#!/bin/bash
# AssetBridge 開発環境一括起動スクリプト
# 使用方法: bash scripts/run_dev.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=============================="
echo "  AssetBridge Dev Server"
echo "=============================="

# FastAPI (port 8000)
echo "[1/4] FastAPI を起動中 (port 8000)..."
cd "$PROJECT_ROOT/apps/api" && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload &
API_PID=$!
cd "$PROJECT_ROOT"

sleep 2

# MCP Server (port 8001)
echo "[2/4] MCP サーバを起動中 (port 8001)..."
cd "$PROJECT_ROOT/apps/mcp" && python src/server.py &
MCP_PID=$!
cd "$PROJECT_ROOT"

# Discord Bot
echo "[3/4] Discord Bot を起動中..."
cd "$PROJECT_ROOT/apps/discord-bot" && python src/bot.py &
BOT_PID=$!
cd "$PROJECT_ROOT"

# Next.js (port 3000)
echo "[4/4] Next.js を起動中 (port 3000)..."
cd "$PROJECT_ROOT/apps/web" && pnpm dev &
WEB_PID=$!
cd "$PROJECT_ROOT"

echo ""
echo "=============================="
echo "  サービス一覧"
echo "=============================="
echo "FastAPI Swagger: http://localhost:8000/docs"
echo "MCP Server:      http://localhost:8001/mcp"
echo "Web Dashboard:   http://localhost:3000"
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
