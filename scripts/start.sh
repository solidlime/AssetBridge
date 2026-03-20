#!/bin/bash
# AssetBridge v2 — start.sh
# Usage: ./scripts/start.sh [--skip-install] [--skip-build] [--skip-migrate] [--quick]

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { printf "${GREEN}[start]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[start]${NC} %s\n" "$*"; }
error() { printf "${RED}[start] ERROR:${NC} %s\n" "$*" >&2; }

# ---------------------------------------------------------------------------
# 1. PROJECT_DIR を解決して cd
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"
info "PROJECT_DIR = ${PROJECT_DIR}"

# ---------------------------------------------------------------------------
# 2. フラグ解析
# ---------------------------------------------------------------------------
SKIP_INSTALL=false
SKIP_BUILD=false
SKIP_MIGRATE=false

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    --skip-build)   SKIP_BUILD=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    --quick)
      SKIP_INSTALL=true
      SKIP_BUILD=true
      SKIP_MIGRATE=true
      ;;
    *)
      error "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 3. .env ロード（CRLF セーフ手動パース）
#    Windows 環境で source すると \r が残るため行単位でパースする
# ---------------------------------------------------------------------------
ENV_FILE="${ASSETBRIDGE_ENV_PATH:-${HOME}/.assetbridge/.env}"

if [ -f "${ENV_FILE}" ]; then
  info "Loading env from ${ENV_FILE}"
  while IFS= read -r line || [ -n "$line" ]; do
    # CRLF 除去
    line="${line%$'\r'}"
    # 空行・コメント行スキップ
    [[ -z "$line" || "$line" == \#* ]] && continue
    # = を含まない行スキップ
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    # インラインコメント除去（スペース2つ以上 + # 以降）
    val="${val%%  #*}"
    val="${val%%	#*}"
    # クォート除去
    if [[ "$val" == \"*\" ]]; then val="${val:1:${#val}-2}"; fi
    if [[ "$val" == \'*\' ]]; then val="${val:1:${#val}-2}"; fi
    # 未設定の場合のみエクスポート（既存の環境変数を上書きしない）
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "${ENV_FILE}"
else
  warn ".env not found at ${ENV_FILE} — continuing without it"
fi

# ---------------------------------------------------------------------------
# 4. ディレクトリ確認
# ---------------------------------------------------------------------------
mkdir -p logs data
info "Ensured directories: logs/ data/"

# ---------------------------------------------------------------------------
# 5. pnpm install
# ---------------------------------------------------------------------------
if [ "${SKIP_INSTALL}" = false ]; then
  info "Running pnpm install --frozen-lockfile ..."
  if ! pnpm install --frozen-lockfile; then
    error "pnpm install failed"
    exit 1
  fi
else
  warn "Skipping pnpm install (--skip-install)"
fi

# ---------------------------------------------------------------------------
# 6. Next.js ビルド
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  info "Building @assetbridge/web ..."
  if ! pnpm --filter @assetbridge/web build; then
    error "pnpm build failed"
    exit 1
  fi
else
  warn "Skipping Next.js build (--skip-build)"
fi

# ---------------------------------------------------------------------------
# 7. DB マイグレーション
# ---------------------------------------------------------------------------
if [ "${SKIP_MIGRATE}" = false ]; then
  if [ -f "scripts/migrate.ts" ]; then
    info "Running DB migration (bun scripts/migrate.ts) ..."
    if ! bun scripts/migrate.ts; then
      error "DB migration failed"
      exit 1
    fi
  else
    warn "scripts/migrate.ts not found — skipping migration"
  fi
else
  warn "Skipping DB migration (--skip-migrate)"
fi

# ---------------------------------------------------------------------------
# 8. ecosystem.config.ts → ecosystem.config.cjs 変換
# ---------------------------------------------------------------------------
info "Converting ecosystem.config.ts → ecosystem.config.cjs ..."
cp ecosystem.config.ts ecosystem.config.cjs

# ---------------------------------------------------------------------------
# 9. ゾンビプロセスキル + PM2 起動
#
#    Windows 環境では PM2 の stop/delete 後も Bun プロセスがポートを保持し続ける
#    ことがある。PM2 delete → ポート解放 → PM2 start の順で確実に起動する。
# ---------------------------------------------------------------------------

# ポートを占有しているプロセスを強制終了する関数
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

# 既存 PM2 プロセスを削除
if pm2 list 2>/dev/null | grep -qE '(online|stopped|errored)'; then
  info "PM2 processes found — deleting all ..."
  pm2 delete all 2>/dev/null || true
fi

# ゾンビプロセスをポートで強制終了
info "Killing any zombie processes on ports 8000, 3000, 8001 ..."
kill_port 8000
kill_port 3000
kill_port 8001
sleep 1

# PM2 起動
info "Starting PM2 with ecosystem.config.cjs ..."
if ! pm2 start ecosystem.config.cjs; then
  error "pm2 start failed"
  exit 1
fi

# ---------------------------------------------------------------------------
# 10. ヘルスチェック（最大 30 秒、2 秒間隔）
# ---------------------------------------------------------------------------
info "Waiting for API health check at http://localhost:8000/health ..."
HEALTH_OK=false
for i in {1..15}; do
  if curl -sf --noproxy "*" http://localhost:8000/health >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 2
done

if [ "${HEALTH_OK}" = false ]; then
  error "API did not respond within 30s. Check logs:"
  pm2 logs api --lines 20 --nostream 2>/dev/null || true
  pm2 status
  exit 1
fi

# ---------------------------------------------------------------------------
# 11. 完了
# ---------------------------------------------------------------------------
printf "\n${GREEN}========================================${NC}\n"
printf "${GREEN}  AssetBridge v2 started successfully!${NC}\n"
printf "${GREEN}  API  : http://localhost:8000/health${NC}\n"
printf "${GREEN}  Web  : http://localhost:3000${NC}\n"
printf "${GREEN}========================================${NC}\n\n"
pm2 status
