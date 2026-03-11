#!/bin/bash
# AssetBridge 環境セットアップ + 起動スクリプト
# 使用方法: bash scripts/setup.sh [--no-start]
#
#   --no-start  セットアップのみ実行（サーバー起動しない）
#   --skip-deps 依存関係インストールをスキップ（2回目以降の高速起動）

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

VENV_DIR="$PROJECT_ROOT/.venv"
NO_START=false
SKIP_DEPS=false

for arg in "$@"; do
  case "$arg" in
    --no-start)   NO_START=true ;;
    --skip-deps)  SKIP_DEPS=true ;;
  esac
done

# =========================================================
# カラー出力
# =========================================================
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*"; }

echo ""
echo "========================================"
echo "  AssetBridge セットアップ"
echo "========================================"
echo ""

# =========================================================
# Step 1: Python バージョン確認
# =========================================================
info "Step 1/6: Python バージョン確認"
PYTHON_CMD=""
for cmd in python3 python python3.12 python3.11; do
  if command -v "$cmd" &>/dev/null; then
    VER=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null) || true
    MAJOR=$(echo "$VER" | cut -d. -f1)
    MINOR=$(echo "$VER" | cut -d. -f2)
    if [ -n "$MAJOR" ] && [ -n "$MINOR" ] \
        && [ "$MAJOR" -eq 3 ] 2>/dev/null \
        && [ "$MINOR" -ge 11 ] 2>/dev/null; then
      PYTHON_CMD="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON_CMD" ]; then
  error "Python 3.11 以上が必要です。インストールしてください。"
  exit 1
fi
success "Python $VER ($PYTHON_CMD)"

# =========================================================
# Step 2: 仮想環境の作成・アクティベート
# =========================================================
info "Step 2/6: 仮想環境のセットアップ"
if [ ! -d "$VENV_DIR" ]; then
  info ".venv を作成中..."
  "$PYTHON_CMD" -m venv "$VENV_DIR"
  success ".venv 作成完了"
else
  success ".venv は既に存在します"
fi

# Activate (Windows Git Bash / Unix 両対応)
if [ -f "$VENV_DIR/Scripts/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV_DIR/Scripts/activate"
elif [ -f "$VENV_DIR/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
else
  error "仮想環境のアクティベートに失敗しました"
  exit 1
fi
success "仮想環境アクティベート完了"

# =========================================================
# Step 3: Python 依存関係インストール
# =========================================================
info "Step 3/6: Python 依存関係インストール"
if [ "$SKIP_DEPS" = false ]; then
  pip install --quiet --upgrade pip
  pip install --quiet -r "$PROJECT_ROOT/requirements.txt"
  success "Python パッケージインストール完了"

  # Playwright ブラウザのインストール
  if ! python -c "from playwright.sync_api import sync_playwright; sync_playwright().__enter__().chromium.launch().close()" &>/dev/null 2>&1; then
    info "Playwright Chromium をインストール中..."
    playwright install chromium
    success "Playwright Chromium インストール完了"
  else
    success "Playwright Chromium は既にインストール済み"
  fi
else
  warn "--skip-deps: 依存関係インストールをスキップ"
fi

# =========================================================
# Step 4: pnpm / Node.js 確認
# =========================================================
info "Step 4/6: pnpm / Node.js 確認"
if command -v pnpm &>/dev/null; then
  PNPM_VER=$(pnpm --version 2>/dev/null)
  success "pnpm $PNPM_VER"
  if [ "$SKIP_DEPS" = false ]; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    success "pnpm パッケージインストール完了"
  fi
else
  warn "pnpm が見つかりません。Web UI を使用する場合はインストールしてください:"
  warn "  npm install -g pnpm"
fi

# =========================================================
# Step 5: 環境変数ファイル確認
# =========================================================
info "Step 5/6: 環境変数ファイル確認"
_ENV_FILE="${ASSETBRIDGE_ENV_PATH:-$HOME/.assetbridge/.env}"

if [ ! -f "$_ENV_FILE" ]; then
  warn "~/.assetbridge/.env が見つかりません"
  info "setup_secrets.py を実行して作成します..."
  python "$PROJECT_ROOT/scripts/setup_secrets.py"
  echo ""
  warn "================================================"
  warn "  重要: $_ENV_FILE を開いて"
  warn "  MF_EMAIL / MF_PASSWORD 等を設定してください"
  warn "================================================"
  echo ""
  read -r -p "設定が完了したら Enter を押してください..."
else
  success "環境変数ファイル確認済み: $_ENV_FILE"
fi

# .env を読み込む（CRLF対策: sedで\rを除去してから読む）
set -a
# shellcheck disable=SC1090
set +e
source <(sed 's/\r//' "$_ENV_FILE")
set -e
set +a

# =========================================================
# Step 6: データベース初期化
# =========================================================
info "Step 6/6: データベース初期化"
DB_FILE="${DATABASE_URL:-sqlite:///./data/assetbridge.db}"
DB_PATH="${DB_FILE#sqlite:///}"
# ./data/assetbridge.db → 絶対パスに変換
if [[ "$DB_PATH" == ./* ]]; then
  DB_PATH="$PROJECT_ROOT/${DB_PATH:2}"
fi

if [ ! -f "$DB_PATH" ]; then
  info "データベースを初期化中..."
  PYTHONPATH="$PROJECT_ROOT" python "$PROJECT_ROOT/scripts/setup_db.py"
  success "データベース初期化完了: $DB_PATH"
else
  success "データベースは既に存在します: $DB_PATH"
  # スキーママイグレーション（新テーブル追加のみ、データ保持）
  PYTHONPATH="$PROJECT_ROOT" python "$PROJECT_ROOT/scripts/setup_db.py" 2>/dev/null || true
fi

# =========================================================
# セットアップ完了サマリー
# =========================================================
echo ""
echo "========================================"
echo -e "  ${GREEN}セットアップ完了！${RESET}"
echo "========================================"
echo ""
echo "  設定ファイル:  $_ENV_FILE"
echo "  データベース:  $DB_PATH"
echo "  仮想環境:      $VENV_DIR"
echo ""

# =========================================================
# サーバー起動
# =========================================================
if [ "$NO_START" = true ]; then
  info "--no-start: サーバー起動をスキップします"
  info "起動するには: bash scripts/run_dev.sh"
  exit 0
fi

echo "========================================"
echo "  サービス起動"
echo "========================================"
echo ""

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
MCP_PORT="${MCP_PORT:-8001}"

# FastAPI
info "[1/4] FastAPI を起動中 (port ${API_PORT})..."
cd "$PROJECT_ROOT/apps/api" && PYTHONPATH="$PROJECT_ROOT" python -m uvicorn src.main:app \
  --host 0.0.0.0 --port "$API_PORT" --reload &
API_PID=$!
cd "$PROJECT_ROOT"

sleep 2

# MCP Server
info "[2/4] MCP サーバを起動中 (port ${MCP_PORT})..."
cd "$PROJECT_ROOT/apps/mcp" && PYTHONPATH="$PROJECT_ROOT" python src/server.py &
MCP_PID=$!
cd "$PROJECT_ROOT"

# Discord Bot
info "[3/4] Discord Bot を起動中..."
if [ -n "${DISCORD_TOKEN:-}" ]; then
  cd "$PROJECT_ROOT/apps/discord-bot" && PYTHONPATH="$PROJECT_ROOT" python src/bot.py &
  BOT_PID=$!
  cd "$PROJECT_ROOT"
else
  warn "DISCORD_TOKEN が未設定のため Discord Bot をスキップ"
  BOT_PID=""
fi

# Next.js
info "[4/4] Next.js を起動中 (port ${WEB_PORT})..."
if command -v pnpm &>/dev/null; then
  cd "$PROJECT_ROOT/apps/web" && pnpm dev -p "$WEB_PORT" &
  WEB_PID=$!
  cd "$PROJECT_ROOT"
else
  warn "pnpm が見つからないため Next.js をスキップ"
  WEB_PID=""
fi

echo ""
echo "========================================"
echo "  サービス一覧"
echo "========================================"
echo "  FastAPI Swagger: http://localhost:${API_PORT}/docs"
echo "  MCP Server:      http://localhost:${MCP_PORT}/mcp"
echo "  Web Dashboard:   http://localhost:${WEB_PORT}"
echo ""
echo "  Ctrl+C で全サービスを停止"
echo "========================================"
echo ""

# Ctrl+C で全プロセスを終了
cleanup() {
  echo ""
  info "サービスを停止しています..."
  # shellcheck disable=SC2086
  kill $API_PID $MCP_PID ${BOT_PID:-} ${WEB_PID:-} 2>/dev/null || true
  # shellcheck disable=SC2086
  wait $API_PID $MCP_PID ${BOT_PID:-} ${WEB_PID:-} 2>/dev/null || true
  success "停止完了"
}

trap cleanup INT TERM
wait
