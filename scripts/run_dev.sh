#!/bin/bash
# AssetBridge 開発環境一括起動スクリプト
# 使用方法: bash scripts/run_dev.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ~/.assetbridge/.env から設定を読み込む（ASSETBRIDGE_ENV_PATH で上書き可）
_ENV_FILE="${ASSETBRIDGE_ENV_PATH:-$HOME/.assetbridge/.env}"
if [ -f "$_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$_ENV_FILE"
  set +a
fi

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
MCP_PORT="${MCP_PORT:-8001}"

echo "=============================="
echo "  AssetBridge Dev Server"
echo "=============================="

# FastAPI
echo "[1/4] FastAPI を起動中 (port ${API_PORT})..."
cd "$PROJECT_ROOT/apps/api" && python -m uvicorn src.main:app --host 0.0.0.0 --port "$API_PORT" --reload &
API_PID=$!
cd "$PROJECT_ROOT"

sleep 2

# MCP Server
echo "[2/4] MCP サーバを起動中 (port ${MCP_PORT})..."
cd "$PROJECT_ROOT/apps/mcp" && python src/server.py &
MCP_PID=$!
cd "$PROJECT_ROOT"

# Discord Bot
echo "[3/4] Discord Bot を起動中..."
cd "$PROJECT_ROOT/apps/discord-bot" && python src/bot.py &
BOT_PID=$!
cd "$PROJECT_ROOT"

# Next.js
echo "[4/4] Next.js を起動中 (port ${WEB_PORT})..."
cd "$PROJECT_ROOT/apps/web" && pnpm dev -p "$WEB_PORT" &
WEB_PID=$!
cd "$PROJECT_ROOT"

echo ""
echo "=============================="
echo "  サービス一覧"
echo "=============================="
echo "FastAPI Swagger: http://localhost:${API_PORT}/docs"
echo "MCP Server:      http://localhost:${MCP_PORT}/mcp"
echo "Web Dashboard:   http://localhost:${WEB_PORT}"
echo ""
echo "Ctrl+C で全サービスを停止"
echo "=============================="

# Ctrl+C で全プロセスを終了
cleanup() {
    echo ""
    echo "サービスを停止しています..."
    kill $API_PID $MCP_PID $BOT_PID $WEB_PID 2>/dev/null || true
    wait $API_PID $MCP_PID $BOT_PID $WEB_PID 2>/dev/null || true
    echo "停止完了"
}

trap cleanup INT TERM
wait
