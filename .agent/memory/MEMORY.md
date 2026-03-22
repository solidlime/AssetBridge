# MEMORY

## プロジェクト概要
AssetBridge — MF for 住信SBI銀行スクレイパー + Hono/tRPC API + MCP + Discord Bot + Next.js ダッシュボード

## 技術スタック（2026-03時点）
- **ランタイム**: Bun (api/mcp/crawler/discord-bot) + Node.js (web)
- **API**: Hono + tRPC (port 8000) / **MCP**: port 8001 / **Web**: Next.js 15 (port 3000)
- **DB**: SQLite + Drizzle ORM / **管理**: PM2 / **モノレポ**: pnpm + Turborepo

## 重要ファイルパス
- DB: `data/assetbridge_v2.db` / スキーマ: `packages/db/src/schema/` / リポジトリ: `packages/db/src/repos/`
- API ルーター: `apps/api/src/router/` / サービス: `apps/api/src/services/`
- スクレイパー: `apps/crawler/src/scrapers/browser-scraper.mjs` + `mf_sbi_bank.ts`
- MCP ツール: `apps/mcp/src/tools/` / PM2: `ecosystem.config.cjs`

## セットアップ手順
1. `.env` を `.env.example` から作成 → `pnpm install` → `playwright install chromium`
2. `bun scripts/migrate.ts`（または `bash scripts/reload.sh` で再起動込み一括実行）
3. `pm2 start ecosystem.config.cjs`

## Windows 固有の注意事項
- `Invoke-WebRequest` はプロキシでタイムアウト → `curl.exe --noproxy "*" URL` を使うこと
- `ecosystem.config.cjs`: `process.env.BUN_PATH ?? "bun"` で bun パスを上書き可能

## 実装済み機能（2026-03-22時点）
- Hono + tRPC 全エンドポイント / Next.js ダッシュボード / Playwright スクレイパー
- 配当ページ / モンテカルロシミュレーター / MCP サーバ / Discord Bot / ジョブキュー
- ログページ (`/logs`) — app_logs テーブル + logsRouter + LogViewer.tsx
- 引き落とし管理ページ (`/withdrawals`) — 固定費・クレカ管理・3段階残高警告

## ログシステム
- `packages/db/src/schema/app_logs.ts` → `repos/app_logs.ts` → `apps/api/src/router/logs.ts`
- `apps/mcp/src/lib/logger.ts` (logMcp) / `apps/discord-bot/src/lib/logger.ts` (logDiscord)
- Web: `apps/web/src/app/logs/page.tsx` + `components/LogViewer.tsx`

## Next.js + tRPC / DB 注意事項
- Client Component から tRPC: `apps/web/src/lib/trpc.ts` の `createTRPCClient` + `httpBatchLink`
- recharts `dataKey` は **camelCase**（`totalJpy`等）。snake_case だとグラフが空になる
- QueryClient は `useState(() => new QueryClient())` 必須（モジュールレベルは SSR でクラッシュ）
- `overrides` 変更時は `pnpm install --no-frozen-lockfile` で lockfile 再生成

## db:migrate 注意事項
- `pnpm db:migrate` はルートからだとDBパス解決エラーの可能性
- `cd packages/db && npx drizzle-kit migrate` または `$env:ASSETBRIDGE_DB_PATH` を明示設定

## テスト戦略の教訓
- `toHaveProperty` はフィールド存在確認のみ → 値の妥当性は `toBeGreaterThan(0)` で確認
- E2E: `getByRole("button", {name:"..."})` が aria-label にも match → nav にスコープ
- brittle test: ハードコード数値より `toBeGreaterThan(0)` が正しい
- 最終E2Eテスト結果（2026-03-22）: 69 passed, 2 skipped, 0 failed

## セッション教訓（PM2・スクレイパー）
- PM2 web が起動しない: `pm2 logs web --err` → `pnpm --filter @assetbridge/web type-check`
- `start.sh` は `--no-frozen-lockfile` を使うこと（`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` 対策）
- クレカ accounts-list: `> li`（直接の子のみ）で入れ子重複を避ける
- CSS 非表示テキスト: `innerText` に返らない → `textContent` を使う
- CASH/POINT/FUND/PENSION はスクレイプ前に全削除（portfolioSnapshots → assets の順序）
- STOCK_JP/STOCK_US は symbol がユニークなので upsert のまま

## 重要バグパターン（スクレイパー）

### CASH/POINT カテゴリ誤分類
- tableContextMap（categoryFromAnchor）+ summaryCategories[] フォールバック
- 原因: 前テーブルのカテゴリが null の場合に引き継がれる

### buildColMap ヘッダー正規化
- MF DOM が「保有\n金融\n機関」と改行入り → `h.replace(/[\s\u3000\n\r]/g, '')` で正規化

### CASH テーブル構造（count=5）
- `[0]=種類, [1]=残高, [2]=保有金融機関, [3]=取得日時, [4]=更新`
- `colMap.institution = -1` のとき `cellTexts[2]` フォールバック必須

### cc_account_mapping の asset_id が stale になる
- CASH/POINT 全削除→再 INSERT で ID が変わる
- 修正: `cashNameToOldId / cashNameToNewId` マップで削除前後追跡し自動リマップ

### bank_account がスクレイプ後にリセット
- 修正: DELETE 前に `existingBankAccounts` マップ保存 → INSERT 時に引き継ぎ

### その他重要バグ修正
- SQLite BUSY_RECOVERY: `PRAGMA busy_timeout = 5000` を `packages/db/src/client.ts` に追加
- クレカ重複: `cardName` 単独 → `cardName|withdrawalDate|amountJpy` 複合キーに変更
- `credit_card_withdrawals` DELETE: `status='scheduled'` 全件削除（過去レコード残留防止）
- CASH institution_name が空の場合、同名 POINT から自動継承

## MF ポートフォリオページ DOM 構造
- Table[0]: サマリー（count=3行 × カテゴリ数）
- Table[1]: CASH詳細（categoryFromAnchor=null → tableContextMap でルックアップ）
- Table[2]: STOCK_JP詳細 / Table[3]: FUND詳細（「評価額」→ value=4）
- Table[4]: PENSION詳細（「現在価値」→ value=2）/ Table[5]: POINT詳細（「現在の価値」→ value=4）

## 大規模機能追加（2026-03-22）

### T01: 資産一覧 現在値ソート + 外貨現在値表示
- current_price_native カラムを snapshots テーブルに追加（migration 0003）
- 資産一覧に「現在値」カラム追加。USD 資産は「$xxx.xx」形式で表示
- ソートキーに currentPriceJpy を追加（SortHeader コンポーネント）

### T02: スクレイパー全カテゴリ安定化（browser-scraper.mjs 最重要修正）
- CASH 誤分類: tableContextMap + summaryCategories[] フォールバック
- querySelector SyntaxError: href.length < 2 ガード + try/catch
- thead ヘッダー取得: isFromThead フラグ。buildColMap に「現在価値」「現在の価値」「換算額」追加
- デバッグログ14件削除済み

### T03: 引き落とし管理機能強化
- 3段階残高警告（urgent/danger/caution）、口座別引き落とし総額サマリー API
- 固定費 bank_account 保存バグ修正（migration 0006 + DB/Repo/Service/Router/Form 4層）
- ダッシュボード: 残高不足口座アラートバナー追加

### T04–T09
- T04: per_payment_jpy（migration 0004）+ buildMonthlyBreakdown 改善
- T05: settings.ts 空文字列保存バグ・NaN ガード・ecosystem API_KEY ハードコード修正
- T06: /logs ページ（migration 0005 app_logs + AppLogsRepo + logsRouter）
- T07: MCP ツール3件（get_withdrawal_summary / get_financial_summary / get_investment_advice_context）+ 4アドバイスプロンプト
- T08: /income-expense 廃止（/ リダイレクト）、MonthlyExpenseChart をダッシュボードに移動
- T09: daily_totals に前月比・前年比・カテゴリ別前日比16カラム追加（migration 0005）

### T10: E2E テスト修正
- getByRole("button") が aria-label にも match → nav スコープで解決
- 69 passed, 2 skipped, 0 failed

### T11: PM2/マイグレーション再発防止
- docs/operations/deployment.md 新規作成 / scripts/reload.sh にコメント追加

## 引き落とし管理ページ (withdrawals/page.tsx)
- 警告バナーは accountSummary (getWithdrawalAccountSummary) の shortfallJpy < 0 の口座を口座名ベースで表示
- 固定費テーブルはインライン編集対応（ダブルクリックで編集、Enter/Blur で保存）
- 口座設定保存ボタンはページ最下部に1つだけ（クレカ+固定費共用）

## ダッシュボード D&D
- @dnd-kit/core・@dnd-kit/sortable で実装
- DashboardClient.tsx (Client Component) が全ブロックの DnD レイアウト管理
- ブロックID: asset-history / category-allocation / monthly-expense / credit-card / balance-warning
- localStorage["assetbridge-dashboard-layout"] に保存

## MCP 資金移動アドバイスツール
- apps/mcp/src/tools/fund_transfer.ts: get_fund_transfer_suggestion ツール
- ecosystem.config.cjs の MCP env に API_KEY / API_URL が必要

## スクレイプログ
- apps/crawler/src/scrapers/mf_sbi_bank.ts: AppLogsRepo 経由で開始・完了・エラーをログ
- ログ失敗は try/catch で無視（スクレイプ継続保証）


