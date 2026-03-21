# AssetBridge 4タスク実装完了

## 実装内容

### タスク1: クレカ全件取得修正 ✅
- **問題**: PayPayカード等クレジットカード情報の引き落とし口座が取得されていない
- **実装内容**:
  - `browser-scraper.mjs` の `parseCardBlock()` で2段階regex（`引き落とし|ご返済...` → 銀行フォールバック）で口座名抽出追加
  - `ScrapedCreditWithdrawal` インターフェースに `bankAccount?: string` 追加
  - `mf_sbi_bank.ts` の upsert に `bankAccount` 保存ロジック追加
- **DB**: credit_card_withdrawals テーブルの bank_account カラムに自動保存される

### タスク2: CASH資産に金融機関名を追加 ✅
- **問題**: 資産一覧に金融機関名が表示されていない
- **実装内容**:
  1. DB スキーマ修正: assets テーブルに `institutionName TEXT(200)` カラム追加（migration実行済み）
  2. スクレイパー: `browser-scraper.mjs` の holdings.push() に `institutionName: currentInstitution || currentCategory` 追加
  3. API: `HoldingItem` インターフェースに `institutionName?: string` 追加、`getHoldings()` で返却
  4. Web: `apps/web/src/app/assets/page.tsx` のテーブル左端に「機関」列を追加
- **表示**: 資産一覧テーブルの左端に「SBI証券」「楽天銀行」等の金融機関名が表示される

### タスク3: 投信・年金・ポイント資産一覧表示 ✅
- **問題**: 年金・ポイント・マイルが資産一覧に表示されていない
- **実装内容**:
  1. DB スキーマ修正: portfolioSnapshots テーブルに配当関連7カラム追加（dividend_frequency, dividend_amount, dividend_rate, ex_dividend_date, next_ex_dividend_date, distribution_type, last_dividend_update）
  2. スクレイパー: `mf_sbi_bank.ts` で PENSION/POINT の合計額から ダミーレコード を自動生成
     - 例: name="年金（合計）", assetType="PENSION", institutionName="確定拠出年金・iDeCo"
     - 例: name="ポイント・マイル（合計）", assetType="POINT", quantity=ポイント数, priceJpy=1
  3. API: 既に pension/point フィルタオプション定義済みで、今後自動に対応
- **表示**: Web の「年金」「ポイント」タブで該当資産が表示される

### タスク4: 月配当額精度修正 ✅
- **問題**: 毎月分配型投信の配当計算が不正確
- **実装内容**:
  1. DB スキーマ: portfolioSnapshots テーブルに配当7カラム追加済み（Task3と共通）
  2. API: `apps/api/src/services/dividends.ts` の `buildMonthlyBreakdown()` を5段階判定に改善
     - `monthly`: 12ヶ月均等分配
     - `annual/yearly`: 権利落ち月に全額計上（3月フォールバック）
     - `semi-annual`: 権利落ち月 + 6ヶ月後に1/2ずつ
     - `quarterly`: 3ヶ月ごとに1/4ずつ
     - freq不明: 権利落ち日あれば年1回、なければ毎月均等
  3. フォールバック: DB の `nextExDividendDate` 優先、Yahoo Finance の `nextExDate` を後方互換として活用
  4. `HoldingItem` インターフェースに配当フィールド追加

## DB スキーマ修正

### assets テーブル
- 追加: `institutionName TEXT(200)` nullable

### portfolioSnapshots テーブル
- 追加: `dividendFrequency TEXT` nullable
- 追加: `dividendAmount REAL` nullable
- 追加: `dividendRate REAL` nullable
- 追加: `exDividendDate TEXT` nullable
- 追加: `nextExDividendDate TEXT` nullable
- 追加: `distributionType TEXT` nullable
- 追加: `lastDividendUpdate INTEGER` nullable

Migration 実行済み: `drizzle/0001_nosy_malcolm_colcord.sql`

## ビルド結果

全体ビルド成功（`pnpm build`）:
- @assetbridge/web: ✅ Next.js build succeeded
- @assetbridge/crawler: ✅ type-check passed
- @assetbridge/api: ✅ type-check passed
- その他パッケージ: キャッシュ利用

