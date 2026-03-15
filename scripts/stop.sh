#!/bin/bash
# AssetBridge v2 サービス停止スクリプト
# PM2 で管理されている全サービスを停止する

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }

echo ""
echo "========================================"
echo "  AssetBridge v2 サービス停止"
echo "========================================"
echo ""

if command -v pm2 &>/dev/null; then
  info "PM2 で全サービスを停止中..."
  pm2 stop all
  success "全サービス停止完了"
else
  info "PM2 が見つかりません。ポートで強制終了します..."
  # フォールバック: ポートで強制終了
  kill_port() {
    local port=$1
    if command -v powershell.exe &>/dev/null; then
      powershell.exe -NonInteractive -NoProfile -Command "
        \$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (\$conn) { taskkill /F /T /PID \$conn.OwningProcess 2>\$null | Out-Null }
      " >/dev/null 2>&1 || true
    elif command -v lsof &>/dev/null; then
      lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
    fi
  }
  kill_port 8000
  kill_port 3000
  success "ポート 8000, 3000 のプロセスを停止しました"
fi

echo ""
