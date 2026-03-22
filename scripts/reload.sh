#!/bin/bash
# AssetBridge — reload.sh
# コード変更後にマイグレーション適用 + PM2 グレースフルリロードを行う
# start.sh（フル再起動）より高速で、ダウンタイムなし
#
# Usage: ./scripts/reload.sh [--skip-migrate] [--skip-build]
# ⚠️  コード変更後は必ずこのスクリプトを使うこと（直接 pm2 reload は禁止）

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { printf "${GREEN}[reload]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[reload]${NC} %s\n" "$*"; }
error() { printf "${RED}[reload] ERROR:${NC} %s\n" "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

SKIP_MIGRATE=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=true ;;
    --skip-build)   SKIP_BUILD=true ;;
    *) error "Unknown flag: $arg"; exit 1 ;;
  esac
done

# --- 1. DB マイグレーション（べき等：適用済みはスキップ） ---
if [ "${SKIP_MIGRATE}" = false ]; then
  info "Running DB migration ..."
  if ! bun scripts/migrate.ts; then
    error "DB migration failed"
    exit 1
  fi
else
  warn "Skipping DB migration (--skip-migrate)"
fi

# --- 2. Next.js ビルド（web プロセスに必要） ---
if [ "${SKIP_BUILD}" = false ]; then
  info "Building @assetbridge/web ..."
  if ! pnpm --filter @assetbridge/web build; then
    error "pnpm build failed"
    exit 1
  fi
else
  warn "Skipping Next.js build (--skip-build)"
fi

# --- 3. PM2 グレースフルリロード（ダウンタイムなし） ---
# NOTE: マイグレーション適用後にリロードすること（このスクリプトが保証する）
# 直接 `pm2 reload all` を実行するとマイグレーション未適用でロールオーバーが起きる
info "Reloading PM2 processes ..."
if ! pm2 reload all; then
  error "pm2 reload failed — try: pm2 restart all"
  exit 1
fi

# --- 4. ヘルスチェック ---
info "Waiting for API health check ..."
HEALTH_OK=false
for i in {1..15}; do
  if curl -sf --noproxy "*" http://localhost:8000/health >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 2
done

if [ "${HEALTH_OK}" = false ]; then
  error "API did not respond within 30s"
  pm2 logs api --lines 20 --nostream 2>/dev/null || true
  exit 1
fi

printf "\n${GREEN}========================================${NC}\n"
printf "${GREEN}  AssetBridge reloaded successfully!${NC}\n"
printf "${GREEN}========================================${NC}\n\n"
pm2 status
