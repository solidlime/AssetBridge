# AssetBridge

資産管理AIエージェント。MoneyForward for 住信SBI銀行（https://ssnb.x.moneyforward.com）をPlaywrightで自動スクレイピングし、ポートフォリオを可視化・分析します。

**キー機能**
- MoneyForward自動スクレイピング（毎日定時実行）
- リアルタイム資産推移グラフ・ダッシュボード
- AI分析コメント生成（LLM選択可能）
- MCP Server（Claude Codeから資産データ参照可能）
- Discord Bot（毎朝自動レポート）

## 技術スタック

| 領域 | 技術 |
|------|------|
| **バックエンド** | Python 3.11+ / FastAPI / SQLAlchemy / SQLite |
| **フロントエンド** | Next.js 15 / React 19 / TypeScript / Recharts / Tailwind CSS |
| **スクレイパー** | Playwright (Chromium) / playwright-stealth |
| **AI分析** | LiteLLM（Anthropic/OpenAI/Gemini/OpenRouter対応） |
| **Bot / MCP** | discord.py / FastMCP |
| **モノレポ** | pnpm workspace / Turborepo |

## 必要要件

- **Python**: 3.11 以上
- **Node.js**: 20 以上（Web UI を使う場合）
- **pnpm**: 9.0 以上（Web UI を使う場合）
- **OS**: Windows / macOS / Linux

## クイックスタート

### 1. リポジトリをクローン

```bash
git clone https://github.com/solidlime/AssetBridge.git
cd AssetBridge
```

### 2. セットアップスクリプトを実行

**Windows (Git Bash 推奨)**
```bash
bash scripts/setup.sh
```

**Windows (PowerShell)**
```powershell
.\scripts\setup.ps1
```

**Linux / macOS**
```bash
bash scripts/setup_linux.sh
```

セットアップ中、以下を自動実行します：
- Python 仮想環境構築
- 依存パッケージのインストール
- Playwright Chromium インストール
- 環境変数ファイル（`~/.assetbridge/.env`）の作成
- SQLite データベース初期化
- FastAPI と Next.js の起動

### 3. ブラウザで開く

セットアップ完了後、自動的に起動します：
- **Web Dashboard**: http://localhost:3000
- **API Swagger Docs**: http://localhost:8000/docs

## 環境設定

設定は `~/.assetbridge/.env` に保存されます（プロジェクト外に隔離）。

### 必須項目

```env
MF_EMAIL=your@email.com
MF_PASSWORD=your_password
```

### オプション項目

```env
# AI コメント生成（下記のうち1つ以上設定）
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=sk-or-...

# Discord Bot（Discord レポート+設定リモート操作）
DISCORD_TOKEN=...
DISCORD_CHANNEL_ID=123456789

# 外部データ（オプション）
NEWS_API_KEY=...

# MF 2FA（メール認証を使う場合は不要）
MF_TOTP_SEED=...  # TOTP シード（Base32）

# システム設定
DATABASE_URL=sqlite:////path/to/assetbridge.db  # デフォルト: ./data/assetbridge.db
API_PORT=8000
WEB_PORT=3000
MCP_PORT=8001
```

環境変数を後から更新する場合は、以下を再実行（依存関係は自動検出でスキップされる）：
```bash
bash scripts/setup.sh
```

## セットアップオプション

```bash
# セットアップのみ（サーバーを起動しない）
bash scripts/setup.sh --no-start

# 依存関係を強制再インストール（通常は自動検出で不要）
bash scripts/setup.sh --install-deps

# MCP Server も起動
bash scripts/setup.sh --with-mcp

# Discord Bot も起動（DISCORD_TOKEN 設定済みの場合）
bash scripts/setup.sh --with-discord

# セットアップ後にスクレイパーを自動実行
bash scripts/setup.sh --auto-scrape
```

## 使い方

### Web ダッシュボード

http://localhost:3000 から以下を操作できます：

| ページ | 機能 |
|--------|------|
| **ダッシュボード** | 総資産・推移グラフ・資産構成・AI分析コメント |
| **保有資産** | 株式・投信・現金等の詳細一覧（評価額・損益・銘柄） |
| **収支** | 収入・支出の月別推移 |
| **insights** | 市況ニュース・リスク分析 |
| **シミュレータ** | Monte Carlo シミュレーション（リスク・リターン評価） |
| **サービス設定** | スクレイパースケジュール・LLM設定・Discord設定 |

### API エンドポイント

全エンドポイントは **`X-API-Key` ヘッダー認証** が必須です。API_KEY は setup.sh で自動生成され、Web UI の環境変数に表示されます。

#### ポートフォリオ

**GET `/api/portfolio/summary`** — 総資産・カテゴリ別構成
```bash
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/api/portfolio/summary
```

**GET `/api/portfolio/history`** — 資産推移（過去 N 日間）
```bash
curl -H "X-API-Key: {API_KEY}" "http://localhost:8000/api/portfolio/history?days=30"
```

#### スクレイパー

**POST `/api/scrape/trigger`** — スクレイピング開始（一括更新）
```bash
curl -X POST -H "X-API-Key: {API_KEY}" http://localhost:8000/api/scrape/trigger
```
*完全なデータ取得には 30 分待機します（MoneyForward 仕様）*

**GET `/api/scrape/status`** — スクレイプ実行状態・ログ確認
```bash
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/api/scrape/status
```

#### AI コメント

**GET `/api/ai/comments/portfolio`** — ポートフォリオ分析コメント（TTL: 6時間キャッシュ）

**POST `/api/ai/comments/refresh`** — キャッシュをクリアして再生成

#### その他

**GET `/api/assets`** — 保有銘柄詳細
**GET `/api/income-expense`** — 収支集計
**GET `/api/insights`** — 市況ニュース
**POST `/api/simulator/calculate`** — リスク評価

Swagger UI で全エンドポイント確認可能: http://localhost:8000/docs

### 手動スクレイピング

```bash
# 仮想環境有効化
source .venv/Scripts/activate  # Windows Git Bash
source .venv/bin/activate      # macOS / Linux

# スクレイパー実行
python -m apps.crawler.src.scrapers.mf_sbi_bank
```

### CLI ツール

```bash
# スケジューラー確認
python scripts/check_scheduler.py

# DB バックアップ
python scripts/backup_db.py

# 環境変数テンプレート再作成
python scripts/setup_secrets.py
```

## ディレクトリ構成

```
AssetBridge/
├── apps/
│   ├── api/                    # FastAPI バックエンド
│   │   ├── src/
│   │   │   ├── main.py         # メインアプリケーション
│   │   │   ├── routers/        # API エンドポイント
│   │   │   ├── core/           # 分析ロジック
│   │   │   ├── db/             # SQLAlchemy ORM
│   │   │   └── config/         # 設定ファイル
│   │   └── pyproject.toml      # 依存関係定義
│   │
│   ├── web/                    # Next.js ダッシュボード
│   │   ├── src/
│   │   │   ├── app/            # ページ
│   │   │   └── components/     # UI コンポーネント
│   │   └── package.json
│   │
│   ├── crawler/                # Playwright スクレイパー
│   │   └── src/
│   │       └── scrapers/
│   │           └── mf_sbi_bank.py
│   │
│   ├── mcp/                    # FastMCP サーバー（Claude Code 連携）
│   │   └── src/
│   │       └── server.py
│   │
│   └── discord-bot/            # Discord Bot
│       └── src/
│           └── bot.py
│
├── scripts/
│   ├── setup.sh                # メインセットアップ (Windows/Git Bash)
│   ├── setup.ps1               # Windows PowerShell 版
│   ├── setup_linux.sh          # Linux/macOS 版
│   ├── setup_db.py             # DB 初期化
│   ├── setup_secrets.py        # .env テンプレート作成
│   ├── run_dev.sh              # サーバー起動のみ
│   └── backup_db.py            # DB バックアップ
│
├── data/
│   └── assetbridge.db          # SQLite データベース (Git 管理外)
│
├── .env.example                # 環境変数テンプレート
├── requirements.txt            # Python 依存関係
├── package.json                # Monorepo 設定
├── pnpm-workspace.yaml         # pnpm ワークスペース
└── turbo.json                  # Turborepo パイプライン

# 環境変数ファイル（プロジェクト外）
~/.assetbridge/.env            # 認証情報・APIキー
```

## トラブルシューティング

### Python 3.11 が見つからない

```bash
# バージョン確認
python --version
python3 --version
python3.12 --version

# 手動指定でセットアップ
PYTHON_CMD=python3.12 bash scripts/setup.sh
```

### ポート競合エラー

既存のプロセスを確認して停止：
```bash
# Windows (Git Bash)
netstat -ano | grep 3000
taskkill /PID <PID> /F

# macOS / Linux
lsof -i :3000
kill -9 <PID>
```

または異なるポートで起動：
```bash
WEB_PORT=3001 API_PORT=8001 bash scripts/setup.sh
```

### Playwright インストール失敗

```bash
source .venv/Scripts/activate  # または .venv/bin/activate
playwright install chromium --with-deps
```

### MoneyForward ログイン失敗

**よくある原因**
- MF_EMAIL / MF_PASSWORD が間違っている
- MF にログインできない IP／デバイスから実行している
- 2FA 有効化後、MF_TOTP_SEED が設定されていない

**解決方法**
```bash
# 環境変数を再設定
nano ~/.assetbridge/.env

# キャッシュクリア＆リトライ
rm -rf .venv/lib/python*/site-packages/playwright/
bash scripts/setup.sh --no-start
```

### API が起動しない

```bash
# ログを確認
cd apps/api
PYTHONPATH=../.. python -m uvicorn src.main:app --reload

# DB が壊れていないか確認
python scripts/setup_db.py
```

### Web UI が白画面のまま

1. ブラウザコンソールでエラー確認（F12）
2. API_KEY が正しいか確認：
   ```bash
   grep API_KEY ~/.assetbridge/.env
   ```
3. `.env.local` を削除して再起動：
   ```bash
   rm apps/web/.env.local
   bash scripts/run_dev.sh
   ```

## セキュリティ

- **環境変数の隔離**: `~/.assetbridge/.env` はプロジェクト外に保存（API キー漏洩防止）
- **API 認証**: 全エンドポイントは `X-API-Key` ヘッダー認証が必須
- **暗号化**: セッションファイルは Fernet で暗号化
- **CORS**: localhost のみ許可（開発環境）

本番環境で使用する場合：
- HTTPS を有効化
- API_KEY を強力なランダム値に変更
- CORS origins を制限
- MF_PASSWORD を安全に管理（キーチェーン等）

## スケジューリング

スクレイパーは **毎日 10:00** に自動実行されます（設定は Web UI から変更可能）。

MoneyForward の API 仕様により、データ取得には最大 30 分の待機が必要です。

## ライセンス

MIT

## サポート

問題が発生した場合：

1. https://github.com/solidlime/AssetBridge/issues で既知の問題を確認
2. ログを確認：
   ```bash
   cd apps/api
   python -m uvicorn src.main:app --reload
   ```
3. Issue を作成してください（ログ・環境情報を含める）

---

**最終更新**: 2026-03-13
