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

## Next.js + tRPC の注意事項（2026-03-20）

### Client Component での tRPC 呼び出し
- `apps/web/src/lib/trpc.ts` の `createTRPCClient` + `httpBatchLink` でクライアント側から直接 API を呼べる
- Server Component で `await trpc.xxx.query()` するとサーバー側で実行される（SSR）
- Client Component で `useEffect` 内で `trpc.xxx.query()` すると **ブラウザから HTTP リクエスト**が飛ぶ
- 認証は `X-API-Key` ヘッダーで自動付与される

### dataKey のプロパティ名ミスマッチに注意
- DB/API は **camelCase** (`totalJpy`, `stockJpJpy`)
- recharts の `dataKey` も camelCase で一致させること
- `dataKey="total_jpy"` (snake_case) だと値が取れずグラフが空になる

## テスト戦略の教訓（2026-03-20）

### 取りこぼしたバグのパターン

Task 1〜9（リファクタ）後に発覚した3件のバグから以下を学んだ：

1. **値ゼロバグ**: golden snapshot の `toHaveProperty` はフィールド存在のみ確認→値が0でもPASS
   - 対策: `expect(item.quantity).toBeGreaterThan(0)` のような **値の妥当性アサーション**を必須化

2. **未接続バグ**: 純粋関数の単体テストは通っても、ダッシュボードにデータが表示されるか未検証
   - 対策: 各機能ごとに「スクレイパー→DB→API→UI」の **データフロー統合テスト**を1本書く

3. **フロントエンド固定値バグ**: APIが `days` パラメータを受け付けるのにフロントが固定値で呼んでいた
   - 対策: **フロントエンド E2E テスト**（Playwright）で期間変更・フィルタ操作を検証

### テストチェックリスト（機能追加・修正時に必ず確認）

- [ ] golden snapshot テストで値の妥当性（>0、非null）を確認しているか？
- [ ] 新機能のデータがダッシュボード（page.tsx）に接続されているか確認したか？
- [ ] フロントエンドのパラメータが固定値でないか確認したか？
- [ ] Playwright E2E でUIの動作（クリック・表示変化）を確認したか？

### 推奨テストパターン

```typescript
// ❌ 悪い例：存在確認のみ
expect(item).toHaveProperty("quantity");

// ✅ 良い例：値の妥当性も確認
expect(item.quantity).toBeGreaterThan(0);
expect(item.costPerUnitJpy).toBeGreaterThan(0);
```

### E2E テスト追加の優先度（高い順）
1. ダッシュボード表示（総資産・クレカ引き落とし額が0でない）
2. 資産一覧（数量・取得単価が0でない）
3. グラフ期間選択（7D/30D/90D で件数が変わる）
4. スクレイプ後にDBに値が保存されること

## バグ修正の教訓（2026-03-20）

- `dataKey` のプロパティ名ミスマッチ（`total_jpy` vs `totalJpy`）でグラフが空になった → API レスポンスの実フィールド名を必ず確認
- MF が `cellTexts[6]`（取得単価）を空で返すことがある → `(評価額 - 含み損益) / 数量` で逆算フォールバックを実装
- Server Component でグラフ期間を固定取得していた → Client Component 化して `useEffect` で再 fetch
- brittle test: `toBeGreaterThanOrEqual(47)` のようなハードコード数値は DB 変化で即壊れる → `toBeGreaterThan(0)` が正しい

## スキル自律改定ルール（2026-03-20、CLAUDE.md 追加済み）

- ミス発生時に即時・簡潔にスキルを改定してよい（冗長化禁止）

## セッション教訓（2026-03）

### PM2 web プロセスが起動しない場合
- `logs/web.log` が存在しない = 一度も起動できていない証拠
- よくある原因: `.next` ビルドなし・型エラー・PM2 が stopped 状態（restart ループ後）
- 確認手順: `pm2 list` → `pm2 logs web --err` → `pnpm --filter @assetbridge/web type-check`
- ecosystem.config.cjs のパス設定自体は正しい（変更不要）

### dividendFrequency 配線忘れパターン
- ロジック実装済み・DB スキーマあり・API あり → フロント表示なし = 「配線忘れ」が多い
- `apps/crawler/src/scrapers/mf_sbi_bank.ts` の upsertSnapshot 引数を要確認
- assetType 別デフォルト: STOCK_JP=semi-annual / STOCK_US=quarterly / FUND=monthly

### overrides 変更時は lockfile を必ず再生成すること
- `package.json` の `overrides` を変更したら `pnpm install --no-frozen-lockfile` で lockfile を再生成
- `start.sh` は `--frozen-lockfile` ではなく `--no-frozen-lockfile` を使うこと（overrides 変更に追従できない）
- 症状: `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` でスタートアップクラッシュ
- `SAVE_SNAPSHOTS=1` 環境変数で `data/snapshots/YYYY-MM-DD/*.png` に保存
- `console.error` を使う（stdout はプロトコル通信に使用済み）
- クレカ 0 件問題: MF の HTML 変更でセレクタが壊れやすい → スクショで構造を目視確認

### クリーンアップ方針
- ルート直下のデバッグ用 `.ts` スクリプトは `scripts/` に移動 or 削除
- `playwright.config.ts` は `tests/e2e/` が存在する場合は残す

## バグ修正記録（2026-03-21）

### 謎の銘柄の根本修正（2026-03-21）
- 原因: browser-scraper.mjs 690行目付近、MFページネーション行（5列）に ‹ (U+2039) が混入
- 修正: テーブル単位で走査し、5列行（CASH/POINT行）を明示的にスキップ
- DBの既存不正データ（‹[22], ‹[15], ‹[29]）を DELETE文で削除

### クレカ3枚取得の修正（2026-03-21）
- PayPay/三井住友/楽天カード3枚を正しく取得するよう crawler を修正
- credit_card_withdrawals に bank_account カラムを ALTER TABLE で追加

### currentPriceJpy の実装（2026-03-21）
- current_price_jpy カラムを holdings テーブルに追加（DB: ALTER TABLE）
- API の portfolio/holdings エンドポイントに currentPriceJpy フィールドを追加
- データはスクレイプ後に入力される（現在 NULL は正常）
- cc-account-mapping は 14件アカウント確認済み

## バグ修正記録（2026-03-22）

### SQLite BUSY_RECOVERY クラッシュ
- 原因: 複数プロセス同時起動で `SQLITE_BUSY_RECOVERY (errno: 261)` が発生
- 修正: `packages/db/src/client.ts` に `PRAGMA busy_timeout = 5000` 追加

### start.sh cp 問題
- 原因: `cp ecosystem.config.ts ecosystem.config.cjs` が毎回実行され、過去の cjs 修正が上書きされていた
- 修正: `scripts/start.sh` の cp 行を削除（コメントアウト）

### クレカ重複排除バグ
- 原因: `cardName` 単独キーで、同名カードの別月引き落としが消えていた
- 修正: `cardName|withdrawalDate|amountJpy` 複合キーに変更

### 金融機関名取得失敗の根本修正
- 原因1: sectionHeading 取得で MF 固有コンテナ（account/group 系 div）を見ていなかった
- 原因2: count=1 の colspan 行（金融機関名ヘッダ行）をスキップしていた
- 原因3: ページネーションボタン（‹/›）が金融機関名として誤判定
- 修正: パターン4/5 追加、count=1 対応、ページネーションフィルタ強化
- **重要**: フォールバックは使わず、`/bs/portfolio` からの直接取得を維持すること
- 検証: 次回スクレイプで `[browser-scraper] institution from heading=` または `institution(colspan)` ログが出れば成功

## スクレイパー修正記録（2026-03-21 第2セッション）

### クレカ li 入れ子問題
- 原因: `.facilities.accounts-list li` が内側 li も取得 → 各カードが2件になっていた
- 修正: `> li`（直接の子のみ）に変更。フォールバックも `!li.parentElement.closest('li')` 追加
- 教訓: MF の accounts-list は li が入れ子構造。`querySelectorAll('li')` ではなく `> li` を使うこと

### カード名取得（金融機関サービスサイトへ は innerText に出ない）
- CSS で非表示のテキストは `innerText` に返らない（`textContent` は返る）
- `skipPatterns` ベースで lines[0] からカード名を取得するロジックに修正

### assets の古いゴミデータ残留問題
- CASH/POINT/FUND/PENSION は symbol="" で upsert キーが name になる
- 修正: `mf_sbi_bank.ts` でスクレイプ前に CASH/POINT/FUND/PENSION の assets+snapshots を全削除
- portfolioSnapshots は外部キー → assets の順序で削除すること（ON DELETE CASCADE なし）
- STOCK_JP/STOCK_US は symbol がユニークなので upsert のまま

### isSummaryRow フィルタ
- `startsWith/===` では「ポイント・マイル（合計）」が漏れる → `includes(kw)` に変更
- 「年金（合計）」「ポイント・マイル（合計）」は mf_sbi_bank.ts で意図的に追加するダミーレコード（仕様）

### credit_card_withdrawals の DELETE 条件修正
- 変更前: `withdrawalDate >= today` → 過去日付の古いレコードが残る
- 変更後: `status='scheduled'` 全件削除 → 常に最新状態に

## 改善記録（2026-03-21 第3セッション）

### 資産一覧パフォーマンス改善
- 原因: タブ切り替えのたびに tRPC API 呼び出し（キャッシュなし）+ Yahoo Finance 外部API毎回呼び出し
- 修正: @tanstack/react-query 導入（staleTime:5分）+ assetType:"all" 全件取得 + useMemo クライアントフィルタ
- API側: apps/api/src/lib/priceCache.ts（TTL:24時間の Map キャッシュ）でYahoo Finance呼び出しをラップ
- 効果: タブ切り替え瞬時化、初回ロード 300-500ms 以内
- QueryClientProvider は apps/web/src/components/Providers.tsx に分離（"use client" 制約対応）

### browser-scraper.mjs の修正
- buildColMap: 「口座名義」「金融機関名」「機関名」をカラム検出に追加
- parseCardBlock Step3: マスクID（"080*****"）を bankAccount に設定しないよう修正

### mf_sbi_bank.ts の修正
- 年金（合計）・ポイント・マイル（合計）のダミーレコード追加ロジックを削除
- カテゴリ合計は daily_totals テーブルから参照するため不要

### UI 改善
- AssetHistoryChart.tsx: 「総資産」「カテゴリ別」切替ボタン追加、6ラインのカテゴリ別表示
- AllocationChart.tsx: tooltip のテキストカラーを #ffffff に変更
- simulator/page.tsx: useCallback + debounce(500ms) でリアルタイム更新実装

