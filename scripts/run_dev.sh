#!/bin/bash
# AssetBridge 開発環境一括起動スクリプト
# 使用方法: bash scripts/run_dev.sh
# 前提: bash scripts/setup.sh --no-start でセットアップ済みであること

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 仮想環境アクティベート
VENV_DIR="$PROJECT_ROOT/.venv"
if [ -f "$VENV_DIR/Scripts/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV_DIR/Scripts/activate"
elif [ -f "$VENV_DIR/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
fi

# ~/.assetbridge/.env から設定を読み込む（CRLF対策）
_ENV_FILE="${ASSETBRIDGE_ENV_PATH:-$HOME/.assetbridge/.env}"
if [ -f "$_ENV_FILE" ]; then
  set -a
  set +e
  source <(sed 's/\r//' "$_ENV_FILE")
  set -e
  set +a
fi

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
MCP_PORT="${MCP_PORT:-8001}"

# API_KEY が未設定なら生成して .env に追記
if [ -z "${API_KEY:-}" ]; then
  API_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
  printf '\nAPI_KEY=%s\n' "$API_KEY" >> "$_ENV_FILE"
  echo "[INFO] API_KEY を生成して .env に保存しました"
fi

# apps/web/.env.local に接続情報を書き込み
printf 'NEXT_PUBLIC_API_URL=http://localhost:%s\nNEXT_PUBLIC_API_KEY=%s\n' \
  "$API_PORT" "$API_KEY" > "$PROJECT_ROOT/apps/web/.env.local"

echo "=============================="
echo "  AssetBridge Dev Server"
echo "=============================="

# FastAPI
echo "[1/4] FastAPI を起動中 (port ${API_PORT})..."
cd "$PROJECT_ROOT/apps/api" && PYTHONPATH="$PROJECT_ROOT" python -m uvicorn src.main:app \
  --host 0.0.0.0 --port "$API_PORT" --reload &
API_PID=$!
cd "$PROJECT_ROOT"

sleep 2

# MCP Server
echo "[2/4] MCP サーバを起動中 (port ${MCP_PORT})..."
cd "$PROJECT_ROOT/apps/mcp" && PYTHONPATH="$PROJECT_ROOT" python -m src.server &
MCP_PID=$!
cd "$PROJECT_ROOT"

# Discord Bot
echo "[3/4] Discord Bot を起動中..."
if [ -n "${DISCORD_TOKEN:-}" ]; then
  cd "$PROJECT_ROOT/apps/discord-bot" && PYTHONPATH="$PROJECT_ROOT" python -m src.bot &
  BOT_PID=$!
  cd "$PROJECT_ROOT"
else
  echo "[WARN] DISCORD_TOKEN が未設定のため Discord Bot をスキップ"
  BOT_PID=""
fi

# Next.js
echo "[4/4] Next.js を起動中 (port ${WEB_PORT})..."
if command -v pnpm &>/dev/null; then
  cd "$PROJECT_ROOT/apps/web" && pnpm dev -p "$WEB_PORT" &
  WEB_PID=$!
  cd "$PROJECT_ROOT"
else
  echo "[WARN] pnpm が見つからないため Next.js をスキップ"
  WEB_PID=""
fi

echo ""
echo "=============================="
echo "  サービス一覧"
echo "=============================="
echo "  FastAPI Swagger: http://localhost:${API_PORT}/docs"
echo "  MCP Server:      http://localhost:${MCP_PORT}/mcp"
echo "  Web Dashboard:   http://localhost:${WEB_PORT}"
echo ""
echo "  Ctrl+C で全サービスを停止"
echo "=============================="

# スクレイパー自動起動（API 起動待ち後にトリガー）
echo "[INFO] スクレイパーを自動起動します（API 準備完了後）..."
(
  for _ in $(seq 1 30); do
    if curl -sf "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
      curl -s -X POST "http://localhost:${API_PORT}/api/scrape/trigger" \
        -H "X-API-Key: ${API_KEY}" -H "Content-Type: application/json" >/dev/null
      echo "[INFO] スクレイパートリガー送信済み（一括更新→30分後にデータ取得）"
      exit 0
    fi
    sleep 2
  done
  echo "[WARN] API が起動しなかったためスクレイパーをスキップ"
) &

cleanup() {
  echo ""
  echo "サービスを停止しています..."
  # shellcheck disable=SC2086
  kill $API_PID $MCP_PID ${BOT_PID:-} ${WEB_PID:-} 2>/dev/null || true
  # shellcheck disable=SC2086
  wait $API_PID $MCP_PID ${BOT_PID:-} ${WEB_PID:-} 2>/dev/null || true
  echo "停止完了"
}

trap cleanup INT TERM
wait
