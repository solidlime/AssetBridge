# KNOWLEDGE - ドメイン知識・調査結果

## MF for 住信SBI銀行 スクレイピング
- ログイン URL: https://id.moneyforward.com/sign_in
- ポートフォリオ URL: https://netbk.moneyforward.com/bs/portfolio
- MF は UI 変更が多いため、セレクタは定期的に確認が必要
- playwright-stealth でボット検知を回避
- Cookie の有効期限は通常 24 時間程度

## 技術的な知見
- FastMCP の Streamable HTTP は `app.run(transport="streamable-http")` で起動
- LiteLLM は `model` パラメータを `.env` の `LLM_MODEL` で切り替え可能
- SQLite + SQLAlchemy の check_same_thread=False が asyncio 環境で必要
- Discord.py のスラッシュコマンドは `await tree.sync()` で同期が必要

## E2E テスト知見（T10 追加）

### Playwright 並列実行の落とし穴
- `fullyParallel: false` + `workers: 9` の設定でも、ページ系テストは並列実行される
- SSR ページを 9 並列でロードすると PM2 プロセスがタイムアウトを引き起こす
- 推奨: `--workers=2` 以下で実行するか、`playwright.config.ts` を workers: 2 に下げる
- PM2 web を再起動してから実行すると安定する

### ログページのテーブル表示条件
- `/logs` の LogViewer.tsx: ログ 0 件の場合はテーブルではなく「ログがありません」を表示
- E2E テストでは `table || text=ログがありません` の OR 条件でアサートする

### 資産一覧タブ名
- assets/page.tsx の TYPES 定義: `{ value: "fund", label: "投信" }` （「投資信託」ではない）
- タブボタン名は「全て」「日本株」「米国株」「投信」「現金」「年金」「ポイント」

### dividends.calendar API レスポンス型
- 配列ではなく `DividendCalendar` オブジェクト（packages/types/src/index.ts）
- フィールド: `totalAnnualEstJpy`, `portfolioYieldPct`, `monthlyBreakdown[]（12要素）`, `holdings[]`

### MCP package.json に @assetbridge/db を追加済み（T10 修正）
- T06 で logger.ts が追加されたが、apps/mcp/package.json に `@assetbridge/db` 依存が漏れていた
- T10 で修正: `"@assetbridge/db": "workspace:*"` を追加
