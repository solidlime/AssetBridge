# AssetBridge

資産管理AIエージェント。MoneyForward for 住信SBI銀行（https://ssnb.x.moneyforward.com）をPlaywrightで自動スクレイピングし、ポートフォリオを可視化・分析します。

**キー機能**
- MoneyForward自動スクレイピング（毎日定時実行）
- リアルタイム資産推移グラフ・ダッシュボード
- AI分析コメント生成（LLM選択可能）
- MCP Server（Claude Codeから資産データ参照可能）
- Discord Bot（毎朝自動レポート）
- リスク分析・配当カレンダー・Monteカルロシミュレータ

## 技術スタック

| 領域 | 技術 |
|------|------|
| **Runtime** | Bun 1.1+ |
| **API** | Hono.js + tRPC v11 |
| **ORM** | Drizzle ORM + bun:sqlite |
| **スクレイパー** | Playwright + TypeScript |
| **MCP Server** | @modelcontextprotocol/sdk (stdio) |
| **Discord Bot** | discord.js + node-cron |
| **フロントエンド** | Next.js 15 + shadcn/ui + tRPC client |
| **プロセス管理** | PM2 |
| **モノレポ** | pnpm workspace + Turborepo |

## 必要要件

- **Bun**: 1.1 以上
- **pnpm**: 9.0 以上
- **OS**: Windows / macOS / Linux
- **Node.js**: Bun が内包（不要）

## クイックスタート

### 1. リポジトリをクローン

```bash
git clone https://github.com/solidlime/AssetBridge.git
cd AssetBridge
```

### 2. 依存関係をインストール

```bash
pnpm install
```

### 3. 環境変数を設定

```bash
bun scripts/setup_secrets.ts
```

テンプレートが `~/.assetbridge/.env` に作成されます。以下を編集：

```env
# 必須
MF_EMAIL=your@email.com
MF_PASSWORD=your_password
API_KEY=auto_generated_key

# オプション
DISCORD_TOKEN=...
DISCORD_CHANNEL_ID=123456789
SEARXNG_URL=http://localhost:8888  # ニュース取得用
```

### 4. DB マイグレーション

```bash
bun scripts/migrate.ts
```

初回時のみ実行。`data/assetbridge_v2.db` が作成されます（bun:sqlite WAL モード）。

### 5. 全サービス起動

```bash
pm2 start ecosystem.config.cjs
pm2 status
```

起動後、自動的に以下が実行されます：
- **Web Dashboard**: http://localhost:3000
- **API**: http://localhost:8000
- **MCP Server**: stdio 接続
- **Crawler**: スケジュール実行
- **Discord Bot**: 自動レポート（DISCORD_TOKEN設定時）

## サービス管理

### 起動

```bash
# 全サービス起動
pm2 start ecosystem.config.cjs

# 個別起動
pm2 start "api"
pm2 start "web"
pm2 start "crawler"
pm2 start "discord-bot"
pm2 start "mcp"
```

### 停止

```bash
bash scripts/stop.sh
# または
pm2 stop all
```

### ステータス確認

```bash
pm2 status
pm2 logs
```

### ログ確認

```bash
pm2 logs api
pm2 logs web
pm2 logs crawler
```

## 使い方

### Web ダッシュボード

http://localhost:3000 から以下を操作できます：

| ページ | 機能 |
|--------|------|
| **ダッシュボード** | 総資産・推移グラフ・資産構成・AI分析コメント |
| **保有資産** | 株式・投信・現金等の詳細一覧（評価額・損益） |
| **収支** | 収入・支出の月別推移 |
| **市況** | ニュース・リスク分析 |
| **配当** | 配当カレンダー・月別推定額 |
| **シミュレータ** | Monteカルロシミュレーション（リスク・リターン評価） |
| **設定** | スクレイプスケジュール・LLM設定・Discord設定 |

### tRPC API エンドポイント

全エンドポイントは **`X-API-Key` ヘッダー認証** が必須です。

#### ポートフォリオ

```bash
# 現在のスナップショット
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/portfolio.snapshot

# 資産推移（過去 N 日間）
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/portfolio.history

# 保有銘柄一覧
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/portfolio.holdings

# 銘柄詳細
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/portfolio.assetDetail?id=asset123
```

#### 分析

```bash
# 期間分析（7日/30日/1年）
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/analysis.period

# リスク指標（Sharpe/Sortino/MaxDD）
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/analysis.risk

# シナリオシミュレーション
curl -X POST -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"annual_return":0.05,"volatility":0.1,"years":10}' \
  http://localhost:8000/trpc/analysis.scenario
```

#### 市況・配当

```bash
# 市況コンテキスト（日経/S&P500/TOPIX）
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/market.context

# ニュース検索
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/market.news?query=配当

# 配当カレンダー
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/dividends.calendar
```

#### スクレイパー・シミュレータ

```bash
# スクレイピング開始（一括更新）
curl -X POST -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/scrape.trigger

# スクレイプ状態確認
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/scrape.status

# Monteカルロ実行
curl -X POST -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"iterations":10000}' \
  http://localhost:8000/trpc/simulator.run
```

#### 設定

```bash
# システムプロンプト取得
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/settings.systemPrompt

# スクレイプスケジュール取得
curl -H "X-API-Key: {API_KEY}" http://localhost:8000/trpc/settings.scrapeSchedule
```

### Claude Code MCP ツール

Claude Code から以下のツールを使用可能です（.claude/skills にスキルファイル有）：

**ポートフォリオ取得**
- `get_portfolio_snapshot` — 現在のスナップショット
- `get_holdings` — 保有銘柄一覧
- `get_asset_history` — 銘柄の価格推移
- `get_asset_detail` — 銘柄の詳細情報

**分析**
- `analyze_period` — 期間分析
- `run_scenario` — シナリオシミュレーション
- `get_risk_metrics` — リスク指標

**市況・配当**
- `get_market_context` — 市況コンテキスト
- `search_news` — ニュース検索
- `get_dividend_calendar` — 配当カレンダー

**その他**
- `trigger_scrape` — スクレイピング開始
- `get_scrape_status` — スクレイプ状態確認
- `run_monte_carlo` — Monteカルロシミュレーション実行
- `set_mf_2fa_code` — MF 2FA コード設定

### Claude Code スキル

`.claude/skills/` に事前定義済みスキル：

```bash
/portfolio-review       # ポートフォリオレビュー
/risk-assessment        # リスク分析
/tax-analysis           # 税務分析
/dividend-analysis      # 配当分析
/rebalance              # リバランス提案
```

## ディレクトリ構成

```
AssetBridge/
├── apps/
│   ├── api/                    # Hono.js + tRPC API (port 8000)
│   │   ├── src/
│   │   │   ├── index.ts        # Hono + tRPC エントリーポイント
│   │   │   ├── router/         # tRPC ルーター（portfolio / settings / scrape 等）
│   │   │   ├── services/       # ビジネスロジック
│   │   │   ├── lib/            # キャッシュ等ユーティリティ
│   │   │   └── middleware/     # 認証・エラーハンドリング
│   │   └── package.json
│   │
│   ├── crawler/                # Playwright スクレイパー
│   │   ├── src/
│   │   │   ├── scrapers/
│   │   │   │   └── mf_sbi_bank.ts
│   │   │   ├── job-queue.ts    # スクレイプジョブ管理
│   │   │   └── session-manager.ts
│   │   └── package.json
│   │
│   ├── mcp/                    # MCP サーバー (Streamable HTTP, port 8001)
│   │   ├── src/
│   │   │   └── index.ts        # MCP tool 定義
│   │   └── package.json
│   │
│   ├── discord-bot/            # Discord Bot
│   │   ├── src/
│   │   │   └── index.ts        # Bot エントリーポイント
│   │   └── package.json
│   │
│   └── web/                    # Next.js 15 ダッシュボード (port 3000)
│       ├── src/
│       │   ├── app/            # ページ
│       │   ├── components/     # UI コンポーネント
│       │   └── lib/            # クライアント側ユーティリティ
│       └── package.json
│
├── packages/
│   ├── db/                     # Drizzle スキーマ + bun:sqlite
│   │   ├── src/
│   │   │   ├── schema/         # テーブル定義
│   │   │   ├── repos/          # Repository パターン実装
│   │   │   └── client.ts       # DB インスタンス
│   │   ├── drizzle/            # マイグレーション SQL
│   │   ├── drizzle.config.ts   # Drizzle Kit 設定
│   │   └── package.json
│   │
│   └── types/                  # 共有型定義
│       └── index.ts
│
├── scripts/
│   ├── migrate.ts              # DB マイグレーション（bun:sqlite 直接実行）
│   ├── start.sh                # PM2 起動スクリプト
│   └── stop.sh                 # PM2 停止スクリプト
│
├── data/
│   └── assetbridge_v2.db       # SQLite (WAL モード、Git 管理外)
│
├── logs/                       # PM2 ログ出力先（Git 管理外）
│
├── tests/
│   └── e2e/                    # Playwright E2E テスト
│
├── .agent/                     # AI エージェント用メモリ・ハンドオフ
├── ecosystem.config.cjs        # PM2 全サービス定義
├── package.json                # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json                  # Turborepo パイプライン
└── playwright.config.ts        # E2E テスト設定

# 環境変数ファイル（プロジェクト外）
~/.assetbridge/.env            # 認証情報・APIキー
```

## MoneyForward ログインフロー

- **URL**: https://ssnb.x.moneyforward.com
- **2FA**: メール認証（TOTP 非対応）
  - Claude Code の `set_mf_2fa_code` ツールでコード入力
  - または環境変数 `MF_2FA_CODE=123456` で自動入力
- **セッション**: 自動的に `crawler_sessions` テーブルに永続化

## トラブルシューティング

### ポート競合エラー

```bash
# Windows (Git Bash)
netstat -ano | grep :3000
taskkill /PID <PID> /F

# macOS / Linux
lsof -i :3000
kill -9 <PID>
```

### Playwright インストール失敗

```bash
# Bun 組み込みの Playwright がある場合は不要
# 念のため再インストール
bun add --save playwright
bunx playwright install chromium
```

### MoneyForward ログイン失敗

**よくある原因**
- MF_EMAIL / MF_PASSWORD が間違っている
- 2FA コードが期限切れ
- IP が制限されている

**解決方法**
```bash
# 環境変数を再設定
nano ~/.assetbridge/.env

# セッションキャッシュをクリア
rm data/assetbridge_v2.db
bun scripts/migrate.ts

# スクレイパーを手動実行してログ確認
pm2 logs crawler
```

### API が起動しない

```bash
# ログ確認
pm2 logs api

# 個別起動でエラー出力
bun apps/api/src/index.ts
```

### Web UI が白画面のまま

1. ブラウザコンソールでエラー確認（F12）
2. API_KEY が正しいか確認：
   ```bash
   grep API_KEY ~/.assetbridge/.env
   ```
3. トRPC クライアント設定を確認：
   ```bash
   grep -r "apiUrl" apps/web/src/
   ```

## セキュリティ

- **環境変数の隔離**: `~/.assetbridge/.env` はプロジェクト外に保存（API キー漏洩防止）
- **API 認証**: 全エンドポイントは `X-API-Key` ヘッダー認証が必須
- **CORS**: localhost のみ許可（開発環境）

本番環境で使用する場合：
- HTTPS を有効化
- API_KEY を強力なランダム値に変更
- CORS origins を制限
- MF_PASSWORD をキーチェーン等で管理

## スケジューリング

スクレイパーは **毎日 10:00** に自動実行されます（設定は Web UI から変更可能）。

MoneyForward のバッチ更新により、データ取得には最大 30 分の待機が必要です。

## 開発

### 開発用起動（hot reload）

```bash
# API
bun --watch apps/api/src/index.ts

# Web
cd apps/web
bun dev

# Crawler
bun --watch apps/crawler/src/index.ts
```

### DB マイグレーション（スキーマ変更後）

```bash
bun scripts/migrate.ts
```

### 型生成（tRPC）

```bash
bun generate-types
```

### linting / formatting

```bash
pnpm lint
pnpm format
```

## ライセンス

MIT

## サポート

問題が発生した場合：

1. https://github.com/solidlime/AssetBridge/issues で既知の問題を確認
2. ログを確認：
   ```bash
   pm2 logs
   ```
3. Issue を作成（ログ・環境情報を含める）

---

**最終更新**: 2026-03-19
