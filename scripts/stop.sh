#!/bin/bash
# AssetBridge v2 — stop.sh
# PM2 プロセスを停止し、ゾンビプロセスもポートで確実にクリーンアップする

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { printf "${CYAN}[stop]${NC} %s\n" "$*"; }
success() { printf "${GREEN}[stop]${NC} %s\n" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

printf "\n========================================\n"
printf "  AssetBridge v2 停止\n"
printf "========================================\n\n"

# ---------------------------------------------------------------------------
# 1. PM2 プロセス停止
# ---------------------------------------------------------------------------
if command -v pm2 &>/dev/null; then
  info "PM2 プロセスを削除中..."
  pm2 delete all 2>/dev/null || pm2 stop all 2>/dev/null || true
  success "PM2 停止完了"
else
  info "PM2 が見つかりません — スキップ"
fi

# ---------------------------------------------------------------------------
# 2. ゾンビプロセス強制終了（ポート 8000, 3000, 8001）
#
#    PM2 管理外の Bun プロセスがポートを保持していることがあるため
#    PowerShell 経由でポートを占有しているプロセスを強制終了する
# ---------------------------------------------------------------------------
kill_port() {
  local port=$1
  local pid
  pid=$(powershell.exe -NonInteractive -NoProfile -Command \
    "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess" \
    2>/dev/null | tr -d '\r\n' | tr -d ' ')
  if [ -n "$pid" ] && [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -gt 0 ]; then
    powershell.exe -NonInteractive -NoProfile -Command \
      "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
    info "  Killed PID ${pid} on port ${port}"
  fi
}

info "ポート 8000, 3000, 8001 のゾンビプロセスを終了..."
kill_port 8000
kill_port 3000
kill_port 8001

success "すべてのサービスを停止しました"
printf "\n"
