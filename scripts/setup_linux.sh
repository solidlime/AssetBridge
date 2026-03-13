#!/bin/bash
# AssetBridge セットアップ + 起動スクリプト（Linux / macOS 版）
# 使用方法: bash scripts/setup_linux.sh [OPTIONS]
#
#   --no-start      セットアップのみ実行（サーバー起動しない）
#   --install-deps  依存関係を強制的に再インストール（初回は自動検出）
#   --with-mcp      MCP Server も起動する（デフォルト: 無効）
#   --with-discord  Discord Bot も起動する（デフォルト: 無効）
#   --auto-scrape   起動後にスクレイパーを自動実行する（デフォルト: 無効）
#
# Discord Bot と MCP Server は Web UI の設定ページから起動・停止できます。

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

VENV_DIR="$PROJECT_ROOT/.venv"
NO_START=false
WITH_MCP=false
WITH_DISCORD=false
AUTO_SCRAPE=false

# .venv と node_modules が両方存在する場合はインストール済みとみなしてスキップ
# --install-deps フラグで強制再インストールが可能
if [ -d "$VENV_DIR" ] && [ -d "$PROJECT_ROOT/apps/web/node_modules" ]; then
  SKIP_DEPS=true
else
  SKIP_DEPS=false
fi

for arg in "$@"; do
  case "$arg" in
    --no-start)      NO_START=true ;;
    --install-deps)  SKIP_DEPS=false ;;  # 存在していても強制再インストール
    --with-mcp)      WITH_MCP=true ;;
    --with-discord)  WITH_DISCORD=true ;;
    --auto-scrape)   AUTO_SCRAPE=true ;;
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
echo "  AssetBridge セットアップ（Linux/macOS）"
echo "========================================"
echo ""

# =========================================================
# ポート解放ユーティリティ（lsof 優先、fuser フォールバック）
# =========================================================
kill_port() {
  local port=$1
  local pid=""

  if command -v lsof &>/dev/null; then
    pid=$(lsof -ti:"$port" 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
      info "ポート ${port} の既存プロセス (PID: ${pid}) を終了中..."
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi
  elif command -v fuser &>/dev/null; then
    fuser -k "${port}/tcp" 2>/dev/null || true
    sleep 1
  fi
}

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
  error "Python 3.11 以上が必要です。"
  error "  Ubuntu/Debian: sudo apt install python3.12"
  error "  macOS:         brew install python@3.12"
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

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
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
    # Linux では依存ライブラリも必要
    playwright install-deps chromium 2>/dev/null || true
    success "Playwright Chromium インストール完了"
  else
    success "Playwright Chromium は既にインストール済み"
  fi
else
  info "依存関係は既にインストール済みです（--install-deps で強制再インストール）"
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
  warn "pnpm が見つかりません:"
  warn "  curl -fsSL https://get.pnpm.io/install.sh | sh -"
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

# .env を読み込む
set -a
# shellcheck disable=SC1090
set +e
source <(sed 's/\r//' "$_ENV_FILE")
set -e
set +a

# API_KEY が未設定なら生成して .env に追記
if [ -z "${API_KEY:-}" ]; then
  API_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
  printf '\nAPI_KEY=%s\n' "$API_KEY" >> "$_ENV_FILE"
  info "API_KEY を生成して .env に保存しました"
fi

# apps/web/.env.local に接続情報を書き込み
_API_PORT="${API_PORT:-8000}"
printf 'NEXT_PUBLIC_API_URL=http://localhost:%s\nNEXT_PUBLIC_API_KEY=%s\n' \
  "$_API_PORT" "$API_KEY" > "$PROJECT_ROOT/apps/web/.env.local"
success "apps/web/.env.local 更新済み"

# =========================================================
# Step 6: データベース初期化
# =========================================================
info "Step 6/6: データベース初期化"
DB_FILE="${DATABASE_URL:-sqlite:///./data/assetbridge.db}"
DB_PATH="${DB_FILE#sqlite:///}"
if [[ "$DB_PATH" == ./* ]]; then
  DB_PATH="$PROJECT_ROOT/${DB_PATH:2}"
fi

if [ ! -f "$DB_PATH" ]; then
  info "データベースを初期化中..."
  PYTHONPATH="$PROJECT_ROOT" python "$PROJECT_ROOT/scripts/setup_db.py"
  success "データベース初期化完了: $DB_PATH"
else
  success "データベースは既に存在します: $DB_PATH"
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

if [ "$NO_START" = true ]; then
  info "--no-start: サーバー起動をスキップします"
  exit 0
fi

# =========================================================
# サーバー起動
# =========================================================
echo "========================================"
echo "  サービス起動"
echo "========================================"
echo ""

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
MCP_PORT="${MCP_PORT:-8001}"

# ---- 既存プロセスを停止 ----
info "既存プロセスを確認・停止中..."
kill_port "$API_PORT"
kill_port "$WEB_PORT"
[ "$WITH_MCP" = true ] && kill_port "$MCP_PORT"

# ---- [1/2] FastAPI ----
info "[1/2] FastAPI を起動中 (port ${API_PORT})..."
cd "$PROJECT_ROOT/apps/api" && PYTHONPATH="$PROJECT_ROOT" python -m uvicorn src.main:app \
  --host 0.0.0.0 --port "$API_PORT" --reload &
API_PID=$!
cd "$PROJECT_ROOT"

sleep 2

# ---- [2/2] Next.js ----
WEB_PID=""
if command -v pnpm &>/dev/null; then
  info "[2/2] Next.js を起動中 (port ${WEB_PORT})..."
  cd "$PROJECT_ROOT/apps/web" && pnpm dev --port "$WEB_PORT" &
  WEB_PID=$!
  cd "$PROJECT_ROOT"
else
  warn "pnpm が見つからないため Next.js をスキップ"
fi

# ---- MCP Server（オプション） ----
MCP_PID=""
if [ "$WITH_MCP" = true ]; then
  info "[+MCP] MCP サーバを起動中 (port ${MCP_PORT})..."
  cd "$PROJECT_ROOT/apps/mcp" && PYTHONPATH="$PROJECT_ROOT" python -m src.server &
  MCP_PID=$!
  cd "$PROJECT_ROOT"
fi

# ---- Discord Bot（オプション） ----
BOT_PID=""
if [ "$WITH_DISCORD" = true ]; then
  if [ -n "${DISCORD_TOKEN:-}" ]; then
    info "[+Discord] Discord Bot を起動中..."
    cd "$PROJECT_ROOT/apps/discord-bot" && PYTHONPATH="$PROJECT_ROOT" python -m src.bot &
    BOT_PID=$!
    cd "$PROJECT_ROOT"
  else
    warn "[+Discord] DISCORD_TOKEN が未設定のため Discord Bot をスキップ"
  fi
fi

echo ""
echo "========================================"
echo "  サービス一覧"
echo "========================================"
echo "  FastAPI Swagger: http://localhost:${API_PORT}/docs"
echo "  Web Dashboard:   http://localhost:${WEB_PORT}"
[ "$WITH_MCP" = true ] && echo "  MCP Server:      http://localhost:${MCP_PORT}/mcp"
echo ""
echo "  MCP / Discord Bot は Web UI 設定ページから起動できます"
[ "$AUTO_SCRAPE" = false ] && echo "  スクレイパー:    手動実行 (--auto-scrape で自動化)"
echo ""
echo "  Ctrl+C で全サービスを停止"
echo "========================================"
echo ""

# スクレイパー自動起動（オプション）
if [ "$AUTO_SCRAPE" = true ]; then
  info "スクレイパーを自動起動します（API 準備完了後）..."
  (
    for _ in $(seq 1 30); do
      if curl -sf "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
        curl -s -X POST "http://localhost:${API_PORT}/api/scrape/trigger" \
          -H "X-API-Key: ${API_KEY}" -H "Content-Type: application/json" >/dev/null
        echo "[INFO] スクレイパートリガー送信済み"
        exit 0
      fi
      sleep 2
    done
    echo "[WARN] API が起動しなかったためスクレイパーをスキップ"
  ) &
fi

# Ctrl+C で全プロセスを終了
cleanup() {
  echo ""
  info "サービスを停止しています..."
  # shellcheck disable=SC2086
  kill $API_PID ${WEB_PID:-} ${MCP_PID:-} ${BOT_PID:-} 2>/dev/null || true
  # shellcheck disable=SC2086
  wait $API_PID ${WEB_PID:-} ${MCP_PID:-} ${BOT_PID:-} 2>/dev/null || true
  success "停止完了"
}

trap cleanup INT TERM

set +e
wait
set -e
