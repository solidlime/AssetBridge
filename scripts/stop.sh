#!/bin/bash
# AssetBridge サービス停止スクリプト
# 使用方法: bash scripts/stop.sh
#
# setup.sh が .pids/ に保存した PID を読み込んで停止する。
# PID ファイルがない場合はポートから強制終了する。

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS_DIR="$PROJECT_ROOT/.pids"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }

kill_tree() {
  local pid=$1
  [ -z "$pid" ] && return
  if command -v powershell.exe &>/dev/null; then
    powershell.exe -NonInteractive -NoProfile -Command \
      "taskkill /F /T /PID $pid 2>\$null | Out-Null" >/dev/null 2>&1 || true
  else
    local pgid
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [ -n "$pgid" ] && [ "$pgid" -ne 1 ] 2>/dev/null; then
      kill -- -"$pgid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    else
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

kill_port() {
  local port=$1
  if command -v powershell.exe &>/dev/null; then
    powershell.exe -NonInteractive -NoProfile -Command "
      \$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      if (\$conn) {
        taskkill /F /T /PID \$conn.OwningProcess 2>\$null | Out-Null
        Start-Sleep -Seconds 1
      }
    " >/dev/null 2>&1 || true
    sleep 1
  elif command -v lsof &>/dev/null; then
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  fi
}

echo ""
echo "========================================"
echo "  AssetBridge サービス停止"
echo "========================================"
echo ""

STOPPED=0

# PID ファイルから停止
for service in api web mcp bot; do
  PID_FILE="$PIDS_DIR/${service}.pid"
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    kill_tree "$PID"
    rm -f "$PID_FILE"
    info "[$service] 停止 (PID: $PID)"
    STOPPED=$((STOPPED + 1))
  fi
done

# ポートでのフォールバック停止
info "残存プロセスをポートで確認・停止中..."
kill_port 8000
kill_port 3000
kill_port 8001

if [ "$STOPPED" -eq 0 ]; then
  warn "PID ファイルが見つかりませんでした（ポートでの強制停止のみ実行）"
fi

success "停止完了"
echo ""
