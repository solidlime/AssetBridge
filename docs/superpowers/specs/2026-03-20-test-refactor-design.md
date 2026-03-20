# テスト・リファクタ設計書

**日付:** 2026-03-20  
**方針:** インターリーブ方式（1関数リファクタ → 即テスト追加）  
**原則:** バグ・動作不良ゼロ。既存 E2E を壊さない。

---

## 1. テスト基盤

### フレームワーク選定

| 層 | フレームワーク | 理由 |
|---|---|---|
| 全層（api, crawler, db） | **Bun test** (`bun test`) | Bun は `.test.mjs` も認識可能。全ランナーを一本化 |
| E2E | Playwright（既存維持） | 変更なし |

### ディレクトリ構成

```
apps/api/src/services/__tests__/
  portfolio.test.ts
  dividends.test.ts
apps/crawler/src/__tests__/
  browser-scraper.test.mjs
  mf_sbi_bank.test.ts
packages/db/src/repos/__tests__/
  snapshots.test.ts
```

### turbo.json 追加

```json
"test": { "dependsOn": ["^build"], "cache": false }
```

### package.json 追加（apps/api, apps/crawler, packages/db）

```json
"test": "bun test"
```

実行: `pnpm turbo test` で全パッケージ一括実行。

---

## 2. リファクタ対象・優先順位

### Phase 1 — 純粋関数の抽出（難易度低）

| 対象ファイル | 作業 | テスト観点 |
|---|---|---|
| `browser-scraper.mjs` | `parseAmount` は既存シグネチャ（失敗時 `0` 返却）を維持。クレカ専用に `parseCardAmount(text): number \| null` を**新規追加**。null → スキップ規約を適用 | 各種金額文字列・異常値・null ケース |
| `browser-scraper.mjs` | `parseCardBlock(block): CardInfo \| null` を抽出。null → スキップ（呼び出し元でフィルタ） | カード名・金額・引き落とし日 |
| `dividends.ts` | `getDividendCalendar()` 内インラインを `buildMonthlyBreakdown(holdings)` として**抽出**し即テスト追加 | nextExDate → 月別振り分け・TZズレ |

**parseAmount 変更禁止理由:** `scrapePortfolio` 内9箇所で `0` 返却を前提とした計算（`valueJpy > 0` ガード等）が存在するため、シグネチャ変更は破壊的。クレカ専用関数を別途追加する。

**✅ Phase 1 完了チェックポイント:** `pnpm turbo test` PASS + PM2 `crawler/worker` 正常起動。

### Phase 2 — 大関数の分割（難易度中）

**`portfolio.ts` `getHoldings()` 165行の分割:**

```ts
fetchYahooQuotes(symbols: string[]): Promise<Map<string, number>>
mapToHoldingItems(rows, prevMap, quoteMap, total: number): HoldingItem[]
//                                         ^^^^^^ portfolioWeightPct 計算に必須
```

**`browser-scraper.mjs` `scrapeCreditCardWithdrawals()` 191行の分割（3パターン対応）:**

| 関数名 | カバーするパターン |
|---|---|
| `scrapeCardsByAnchor()` | BASE_URL アンカーベース（メイン） |
| `scrapeCardsByTable()` | テーブルスキャン（フォールバック1） |
| `scrapeCardsByDl()` | dl/dt/dd パターン（フォールバック2・約55行） |

**✅ Phase 2 完了チェックポイント:** `pnpm turbo test` PASS + E2E（Playwright smoke）PASS。

### Phase 3 — 統合テスト（難易度高）

| 対象 | 内容 |
|---|---|
| `snapshots.ts` (repo層) | SQLite インメモリDB で upsert・prevDate 取得を検証 |
| `getHoldings()` (service層) | YF モック込み統合テスト。YF 失敗時に `console.warn` が呼ばれることを `spyOn(console, 'warn')` で検証 |

**✅ Phase 3 完了チェックポイント:** 全テスト PASS + E2E PASS + PM2 全サービス `online`。

---

## 3. エラーハンドリング方針

- Yahoo Finance 失敗 → `console.warn` ログ出力 + `priceDiffPct: null`（全 YF 呼び出しで統一）
- スクレイパー各パターン失敗 → `console.error` ログ出力 + 空配列返却（例外を外に漏らさない）
- テストは `toBe(null)` / `toEqual([])` で境界値を明示検証（`not.toThrow()` のみ不可）

## 4. 型安全性方針

- `HoldingItem` 型は現状維持（破壊的変更を避ける）
- 新規抽出関数には戻り値型を明示
- `parseCardAmount` / `parseCardBlock` は `unknown` 入力に対し `null` 返却型を保証

## 5. 動作等価性の検証戦略

1. **スナップショットテスト**: Phase 2 着手前に `curl http://localhost:8000/holdings` の出力を `tests/golden/holdings.json` に保存。リファクタ後に同一出力を確認。生成コマンド: `curl http://localhost:8000/holdings > tests/golden/holdings.json`
2. **統合テストカバレッジ**: Phase 3 の統合テストが主要パスを全カバー。
3. **E2E 二重確認**: Phase 2 の前後それぞれで Playwright smoke を実行して差分なし確認。

---

## 6. 完了条件

1. `pnpm tsc --noEmit` エラーゼロ
2. `pnpm turbo test` 全テスト PASS
3. 既存 Playwright E2E テスト PASS
4. PM2 全サービス `online`
5. `getHoldings` 出力が golden スナップショットと一致
6. `scrapeCreditCardWithdrawals` が複数クレカを正しく返却
