# MEMORY

## プロジェクト概要
AssetBridge — MF for 住信SBI銀行スクレイパー + Hono/tRPC API + MCP + Discord Bot + Next.js ダッシュボード

## 技術スタック（2026-03時点）
- **ランタイム**: Bun (apps/api, apps/mcp, apps/crawler, apps/discord-bot) + Node.js (apps/web)
- **API**: Hono + tRPC (apps/api, port 8000)
- **MCP サーバ**: Hono + tRPC クライアント (apps/mcp, port 8001)
- **スクレイパー**: Playwright (apps/crawler)
- **Discord Bot**: discord.js (apps/discord-bot)
- **Web**: Next.js 15 (apps/web, port 3000)
- **DB**: SQLite + Drizzle ORM (packages/db)
- **パッケージマネージャ**: pnpm (monorepo)
- **ビルドシステム**: Turborepo

## 重要ファイルパス
- DB: `data/assetbridge_v2.db` (root レベル)
- DB スキーマ: `packages/db/src/schema/`
- DB リポジトリ: `packages/db/src/repos/`
- API ルーター: `apps/api/src/router/`
- API サービス: `apps/api/src/services/`
- スクレイパー: `apps/crawler/src/scrapers/mf_sbi_bank.ts`
- MCP ツール: `apps/mcp/src/tools/`
- PM2 設定: `ecosystem.config.cjs`
- DB マイグレーション設定: `packages/db/drizzle.config.ts`

## セットアップ手順
1. `.env` を `.env.example` から作成
2. `pnpm install`
3. `playwright install chromium`
4. `pnpm db:migrate`
5. `pm2 start ecosystem.config.cjs`

## Windows 固有の注意事項

### Invoke-WebRequest はプロキシでタイムアウトする
Windows 環境では `Invoke-WebRequest` を localhost に対して使うとプロキシ設定の影響でタイムアウトする。
代わりに以下を使うこと:
- `curl.exe -s -o NUL -w "%{http_code}" --noproxy "*" URL` (ステータスコードのみ取得)
- Windows では `/dev/null` ではなく `NUL` を使う（`-o NUL`）

### ecosystem.config.cjs の BUN パス
- `process.env.BUN_PATH ?? "bun"` を使用。`BUN_PATH` 環境変数で bun の絶対パスを上書き可能

## 実装済み機能
- Hono + tRPC 全エンドポイント (port 8000)
- Next.js ダッシュボード (port 3000)
- Playwright スクレイパー (mf_sbi_bank.ts)
- 配当ページ (yahoo-finance2)
- モンテカルロシミュレーター
- MCP サーバ (port 8001)
- Discord Bot
- ジョブキュー (packages/db/src/repos/job-queue.ts)
