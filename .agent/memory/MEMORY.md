# MEMORY

## プロジェクト概要
AssetBridge — MF for 住信SBI銀行スクレイパー + FastAPI + MCP + Discord Bot + Next.js ダッシュボード

## 学習した知識・教訓

### プロジェクト構造
- Monorepo: pnpm workspace + Turborepo
- Python apps: apps/api, apps/crawler, apps/mcp, apps/discord-bot
- Web: apps/web (Next.js 15)
- 共有型定義: packages/types/src/index.ts

### 重要ファイルパス
- DB: data/assetbridge.db
- 設定: apps/api/src/config/settings.py
- スクレイパー: apps/crawler/src/scrapers/mf_sbi_bank.py
- MCP サーバ: apps/mcp/src/server.py（port 8001）
- FastAPI: apps/api/src/main.py（port 8000）

### 初期実装完了（2026-03-10）
- Phase 1-8 全フェーズ完了
- GitHub: https://github.com/solidlime/AssetBridge.git（master）
- 91ファイル、4人のエージェントが並列実装

### セットアップ手順
1. .env を .env.example から作成
2. `playwright install chromium`
3. `python scripts/setup_db.py`
4. `python scripts/test_login.py` で疎通確認
5. `bash scripts/run_dev.sh` で全サービス起動
