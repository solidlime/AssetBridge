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
- 起動スクリプト: scripts/setup.ps1 (Windows), scripts/setup.sh (Linux/Mac)
- 停止スクリプト: scripts/stop.sh

### セットアップ手順
1. .env を .env.example から作成
2. `playwright install chromium`
3. `python scripts/setup_db.py`
4. `python scripts/test_login.py` で疎通確認
5. Windows: `.\scripts\setup.ps1` / Linux: `bash scripts/setup.sh`

### Windows 固有の注意事項

#### Invoke-WebRequest はプロキシでタイムアウトする
Windows 環境では `Invoke-WebRequest` を localhost に対して使うとプロキシ設定の影響でタイムアウトする。
代わりに以下を使うこと:
- `curl.exe -s -o NUL -w "%{http_code}" --noproxy "*" URL` (ステータスコードのみ取得)
- `[System.Net.WebClient]` + `.Proxy = $null` (プロキシを明示的に無効化)
- Windows では `/dev/null` ではなく `NUL` を使う（`-o NUL`）

#### Start-Process での環境変数
- `$env:PYTHONPATH = $ProjectRoot` をセットすれば Start-Process の子プロセスに自動継承される
- `-EnvironmentVariable` パラメータは不要（$env: 変数が継承される）

#### .env のインラインコメント
- `API_KEY=test   # コメント` のような値は pydantic-settings が自動除去する
- PowerShell での .env パース時は `($raw -split '\s+#')[0].Trim()` で除去が必要

### API キー
- X-API-Key 認証: `~/.assetbridge/.env` の `API_KEY` 値（現在 `test`）
- pydantic-settings の `default_factory=lambda: secrets.token_urlsafe(32)` は .env 未設定時のみ発動

### 実装済み機能
- FastAPI 全エンドポイント (port 8000)
- Next.js ダッシュボード (port 3000)
- Playwright スクレイパー (mf_sbi_bank.py)
- AIコメント生成 (LiteLLM + OpenRouter)
- 配当ページ (yfinance)
- モンテカルロシミュレーター
- デモデータシード: scripts/seed_demo_data.py
