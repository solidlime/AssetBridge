# Design Spec: 引き落とし管理ページ進化 + バグ修正

**Date:** 2026-03-22  
**Status:** Approved (rev2 - spec review反映)  
**Scope:** 機能追加 + スクレイパーバグ修正

---

## 概要

クレカページ（`/credit`）を「総合引き落とし管理ページ（`/withdrawals`）」に進化させる。  
固定費の手動入力・クレカ詳細スクレイプを追加し、スクレイパーの3つのバグを修正する。

---

## 機能追加

### A. `/withdrawals` ページ（`/credit` リネーム）

**URL変更:**  
- `/credit` → `/withdrawals`（旧URLは301リダイレクト）

**ページ構成（縦積みレイアウト）:**

```
/withdrawals
├── 月次支出サマリーカード
│   ├── クレカ引き落とし合計
│   ├── 固定費合計（月次換算）
│   └── 総合計 / 口座残高残り
│
├── 💳 クレジットカードセクション
│   ├── 既存テーブル（カード名・引き落とし日・金額・紐づけ口座・残高）
│   └── 詳細列追加（カード種別・下4桁・負債総額）
│
└── 🏠 固定費セクション
    ├── 登録済み固定費テーブル（名称・金額・頻度・引き落とし日・カテゴリ・紐づけ口座）
    ├── 追加フォーム（インライン or モーダル）
    └── 月次換算合計
```

### B. 固定費（`fixed_expenses` テーブル）

```sql
CREATE TABLE fixed_expenses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,          -- "家賃", "電気代"
  amount_jpy     REAL    NOT NULL,          -- 金額
  frequency      TEXT    NOT NULL           -- 'monthly' | 'annual' | 'quarterly'
                   CHECK (frequency IN ('monthly', 'annual', 'quarterly')),
  withdrawal_day INTEGER                    -- 毎月引き落とし日 (1-31)。monthly のみ。
                   CHECK (withdrawal_day BETWEEN 1 AND 31),
  withdrawal_month INTEGER,                 -- annual/quarterly の引き落とし月 (1-12)。月次は NULL。
  category       TEXT,                      -- "住居費", "光熱費" etc.
  asset_id       INTEGER,                   -- 紐づけ口座 (FOREIGN KEY assets.id)
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);
```

**`withdrawal_day` / `withdrawal_month` の意味:**
- `monthly`: `withdrawal_day` に毎月引き落とし（例: 27日）。`withdrawal_month` は NULL。
- `annual`: `withdrawal_month`（例: 4月）+ `withdrawal_day`（例: 1日）に年1回。
- `quarterly`: `withdrawal_month` に最初の引き落とし月を設定（例: 1→ 1/4/7/10月）。

**API エンドポイント（tRPC, incomeExpense router）:**

| エンドポイント | 型 | 説明 |
|---|---|---|
| `getFixedExpenses` | Query | 全固定費一覧取得 |
| `addFixedExpense` | Mutation | 固定費追加 |
| `updateFixedExpense` | Mutation | 固定費更新（id指定） |
| `deleteFixedExpense` | Mutation | 固定費削除（id指定） |
| `getMonthlyWithdrawalSummary` | Query | クレカ + 固定費の月次合計。パラメータ: `month?: string`（例: `"2026-03"`、省略時は当月） |
| `getCreditCardDetails` | Query | スクレイプ済みクレカ詳細一覧（card_name・カード種別・下4桁・負債総額・引き落とし予定額） |

**月次換算ロジック:**
- `monthly` → そのまま
- `annual` → `amount_jpy / 12`（月次換算）
- `quarterly` → `amount_jpy / 3`

### C. クレカ詳細（`credit_card_details` テーブル）

```sql
CREATE TABLE credit_card_details (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  card_name             TEXT    NOT NULL UNIQUE,  -- 楽天カード等。card_name でupsert。
  card_type             TEXT,              -- "VISA", "Mastercard", "JCB"
  card_number_last4     TEXT,              -- 下4桁
  total_debt_jpy        REAL,              -- 負債総額
  scheduled_amount_jpy  REAL,              -- 引き落とし予定額
  scraped_at            TEXT    DEFAULT (datetime('now'))
  -- card_name に UNIQUE制約でupsert（scraped_atはデータ更新日時として更新）
);
```

**`credit_card_withdrawals` との結合:**
- `credit_card_details.card_name = credit_card_withdrawals.card_name` で結合
- カード名の表記ゆれ（例: 「楽天カード」vs「楽天カード（VISA）」）は、スクレイパー側で正規化して防ぐ
  - 詳細ページから取得した `card_name` をホームページと同じ表記に揃える（ホームページのカード名を正とする）

**スクレイプ方法 (`scrapeCreditCardDetails` in browser-scraper.mjs):**
1. ホームページの `.facilities.accounts-list > li` からカード詳細ページへのリンクを抽出
2. 各リンクを巡回し、負債総額・カード種別・番号下4桁・引き落とし予定額を抽出
3. `credit_card_details` テーブルに `card_name` UNIQUE キーで upsert（scraped_at も更新）

**担当コンポーネント:** `apps/crawler/src/scrapers/browser-scraper.mjs`（APIサーバからPlaywrightを呼ばない。既存の crawler → DB フローに準拠）

### D. ダッシュボードウィジェット拡張

**変更対象:** `apps/web/src/app/page.tsx` の「クレジットカード引き落とし予定」セクション

**変更内容:**
- 既存のクレカ引き落とし一覧を維持
- サマリーカードを追加: クレカ小計 | 固定費小計（月次換算）| 総支出予定
- 固定費も一覧に追加表示（名称・金額・引き落とし日・カテゴリ）

**口座残高残り（サマリーカード）の計算:**
- 紐づけ口座の残高は `portfolio_snapshots` の最新スナップショット（当該 `asset_id` の最新 `date`）を使用
- 残高残り = 紐づけ口座残高合計（重複排除） - クレカ引き落とし合計 - 固定費月次換算合計

---

## バグ修正

### E. 資産一覧: セクション合計行の混入除去

**問題:**  
「確定拠出年金・iDeCo年金（合計）」のような集計行が資産一覧に混入している。  
文字列マッチングで削除するのは脆弱。

**根本的修正方針:**  
- スクレイプ対象を `<table>` の `<tbody><tr>` に限定
- `<thead>` 行・クラスに `total` や `summary` を含む行を構造的に除外
- `（合計）` を含む行はスキップ（フォールバックとして残す）
- 既存の `isSummaryRow()` 関数は**廃止**し、上記の構造的アプローチで**完全に置き換え**る

**対象ファイル:** `apps/crawler/src/scrapers/browser-scraper.mjs`

### F. 資産一覧: カテゴリ誤判定修正

**問題:**  
多くの資産が「ポイント」カテゴリに誤判定されている。

**根本的修正方針:**  
- `/bs/portfolio` ページのセクション見出し（`<h2>` や `.section-title` 等）を起点にカテゴリ付与
- セクション見出し → カテゴリマッピング（**既存コードのカテゴリ定数に準拠**）:

| MFセクション名 | カテゴリ定数（既存コードに合わせる） |
|---|---|
| 現金・預金 | CASH |
| 株式（日本株） | STOCK_JP |
| 株式（米国株）/ 外国株式 | STOCK_US |
| 投資信託 | FUND |
| 年金 | PENSION |
| ポイント・マイル | POINT |
| 暗号資産 | CRYPTO |
| その他 | OTHER |

- 日本株・米国株のカテゴリ付与は現状の判定ロジックを優先（変更なし）

### G. 配当月精度改善

**問題:**  
yfinance の日本株配当データは不正確（月・金額ともに誤りが多い）。

**修正方針:**

**日本株:**
- [minkabu.jp](https://minkabu.jp) の銘柄ページから配当月・予想配当額を取得
  - 例: `https://minkabu.jp/stock/{ticker}/dividend`
- 取得失敗時は yfinance にフォールバック

**米国株:**
- yfinance 継続使用（精度良好）

**月別予想配当額:**
- 配当月が確定した銘柄のみ月別集計を更新
- 不明な銘柄は「不明」フラグを立て、月別グラフから除外（ゼロ埋めしない）

**担当コンポーネント:** `apps/crawler/src/scrapers/browser-scraper.mjs`（APIサーバからPlaywrightを呼ばない。既存の crawler → DB フローに準拠）

**minkabu DOM概略（実装時に実スクレイプで確認）:**
- URL: `https://minkabu.jp/stock/{ticker}/dividend`
- 配当月: `table.stock_detail_finance` または `.dividend_trend` の月行
- 予想配当額: `.dividend_estimate` または年間配当欄を月数で除算

**対象ファイル:**
- `apps/crawler/src/scrapers/browser-scraper.mjs`（minkabu スクレイプ関数追加）
- `apps/api/src/lib/dividendCache.ts`（取得済み配当データのキャッシュ・提供のみ担当）

---

## 影響ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `packages/db/src/schema/fixed_expenses.ts` | 新規 | fixed_expenses スキーマ |
| `packages/db/src/schema/credit_card_details.ts` | 新規 | credit_card_details スキーマ |
| `packages/db/src/schema/index.ts` | 修正 | 新テーブルのエクスポート追加 |
| `packages/db/src/migrations/` | 新規 | Drizzle マイグレーションファイル |
| `packages/db/src/repos/fixed_expenses.ts` | 新規 | 固定費 Repository |
| `packages/db/src/repos/credit_card_details.ts` | 新規 | クレカ詳細 Repository |
| `apps/api/src/services/income_expense.ts` | 修正 | 固定費 CRUD・月次サマリー追加 |
| `apps/api/src/router/income_expense.ts` | 修正 | 新エンドポイント追加 |
| `apps/crawler/src/scrapers/browser-scraper.mjs` | 修正 | クレカ詳細スクレイプ・カテゴリ修正・合計行除外 |
| `apps/api/src/lib/dividendCache.ts` | 新規 or 修正 | minkabu 日本株配当取得 |
| `apps/web/src/app/credit/page.tsx` | 削除 | /withdrawals にリネーム |
| `apps/web/src/app/withdrawals/page.tsx` | 新規 | 引き落とし管理ページ |
| `apps/web/src/app/credit/page.tsx` → redirect | 修正 | /withdrawals へリダイレクト |
| `apps/web/src/app/page.tsx` | 修正 | ダッシュボードウィジェット拡張 |
| `apps/web/src/components/FixedExpenseForm.tsx` | 新規 | 固定費入力フォームコンポーネント |

---

## 非機能要件

- 品質最優先（時間は無限）
- スクレイプは構造的アプローチを優先（文字列マッチングより DOM 構造ベース）
- minkabu スクレイプは失敗時に yfinance フォールバック必須
- 全新機能に E2E テスト追加（フレームワーク: **Playwright Test** / `tests/e2e/`）
- `/credit` → `/withdrawals` リダイレクトは `next.config.ts` の `redirects()` で実装（301 permanent）

## DB 制約方針

- `frequency`: CHECK制約でenum強制（`'monthly' | 'annual' | 'quarterly'`）
- `withdrawal_day`: CHECK制約で1-31範囲強制
- Drizzleスキーマの `check()` API で定義し、マイグレーションに反映する

---

## 実装順序

1. DBスキーマ追加 + マイグレーション（fixed_expenses, credit_card_details）
2. スクレイパーバグ修正（E: 合計行除外、F: カテゴリ）
3. クレカ詳細スクレイプ追加（C）
4. 配当月精度改善（G）
5. 固定費 API（CRUD + getMonthlyWithdrawalSummary + getCreditCardDetails）
6. `/withdrawals` ページ実装
7. ダッシュボードウィジェット更新（D）
8. E2E テスト追加
9. ドキュメント更新・コミット
