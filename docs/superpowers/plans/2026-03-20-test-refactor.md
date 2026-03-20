# テスト・リファクタ実装プラン

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** インターリーブ方式（リファクタ → 即テスト）で全層にユニット/統合テストを追加し、複雑な関数を責務単位に分割する。

**Architecture:** Phase 1 で純粋関数を抽出してテストを追加、Phase 2 で大関数を分割しスナップショット比較で等価性を保証、Phase 3 で統合テストを完成させる。各フェーズ末にチェックポイントを設ける。

**Tech Stack:** Bun test（全ユニット/統合）, Playwright E2E（既存維持）, Drizzle ORM + SQLite `:memory:`（統合テスト）, yahoo-finance2（モック対象）

**Spec:** `docs/superpowers/specs/2026-03-20-test-refactor-design.md`

---

## Chunk 1: テスト基盤セットアップ + Phase 1（純粋関数抽出）

### Task 1: テスト基盤セットアップ

**Files:**
- Modify: `turbo.json`
- Modify: `apps/api/package.json`
- Modify: `apps/crawler/package.json`
- Modify: `packages/db/package.json`

- [ ] **Step 1: turbo.json に test タスクを追加**

`turbo.json` の `tasks` オブジェクトに追加:
```json
"test": {
  "dependsOn": ["^build"],
  "cache": false
}
```

- [ ] **Step 2: 各 package.json に test スクリプトを追加**

`apps/api/package.json` の scripts:
```json
"test": "bun test"
```

`apps/crawler/package.json` の scripts:
```json
"test": "bun test"
```

`packages/db/package.json` の scripts:
```json
"test": "bun test"
```

- [ ] **Step 3: テスト用ディレクトリを作成**

```powershell
New-Item -ItemType Directory -Force "apps/api/src/services/__tests__"
New-Item -ItemType Directory -Force "apps/crawler/src/__tests__"
New-Item -ItemType Directory -Force "packages/db/src/repos/__tests__"
New-Item -ItemType Directory -Force "tests/golden"
```

- [ ] **Step 4: turbo test が認識されることを確認**

```bash
pnpm turbo test --dry-run
```
Expected: `api#test`, `crawler#test`, `db#test` が表示されること（エラーなし）

- [ ] **Step 5: コミット**

```bash
git add turbo.json apps/api/package.json apps/crawler/package.json packages/db/package.json
git commit -m "chore: add test scripts to all packages"
```

---

### Task 2: parseCardAmount 関数の追加 + テスト

**背景:** 既存の `parseAmount(text)` は失敗時に `0` を返す（`scrapePortfolio` の9箇所がこれに依存）。シグネチャは変更禁止。クレカ金額専用に `parseCardAmount(text): number | null` を新規追加し、null → スキップ規約を適用する。

**Files:**
- Modify: `apps/crawler/src/scrapers/browser-scraper.mjs`
- Create: `apps/crawler/src/__tests__/browser-scraper.test.mjs`

- [ ] **Step 1: テストファイルを作成（失敗する状態で）**

`apps/crawler/src/__tests__/browser-scraper.test.mjs`:
```js
import { describe, it, expect } from "bun:test";
import { parseCardAmount } from "../scrapers/browser-scraper.mjs";

describe("parseCardAmount", () => {
  it("通常の負の金額を正の数値で返す", () => {
    expect(parseCardAmount("-23,879円")).toBe(23879);
  });
  it("カンマなし金額を返す", () => {
    expect(parseCardAmount("-10885円")).toBe(10885);
  });
  it("確定金額（マイナス記号なし）を返す", () => {
    expect(parseCardAmount("23,879")).toBe(23879);
  });
  it("nullを返す（空文字）", () => {
    expect(parseCardAmount("")).toBeNull();
  });
  it("nullを返す（数字なし）", () => {
    expect(parseCardAmount("未確定")).toBeNull();
  });
  it("nullを返す（null入力）", () => {
    expect(parseCardAmount(null)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd apps/crawler && bun test src/__tests__/browser-scraper.test.mjs
```
Expected: FAIL（`parseCardAmount` が export されていない）

- [ ] **Step 3: browser-scraper.mjs に parseCardAmount を追加してエクスポート**

既存の `parseAmount` 関数の直後に追加:
```js
/**
 * クレカ金額専用パーサー。失敗時は null を返す（スキップ用）。
 * parseAmount とは別関数で、scrapePortfolio に影響しない。
 */
export function parseCardAmount(text) {
  if (!text) return null;
  const match = String(text).replace(/[¥円\s]/g, "").match(/-?[\d,]+/);
  if (!match) return null;
  const num = parseInt(match[0].replace(/,/g, ""), 10);
  return isNaN(num) ? null : Math.abs(num);
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd apps/crawler && bun test src/__tests__/browser-scraper.test.mjs
```
Expected: 6 tests pass

- [ ] **Step 5: scrapeCardsByAnchor / parseCardBlock 内の parseFloat を parseCardAmount に置き換え**

`browser-scraper.mjs` 内でクレカ金額を parseFloat でパースしている箇所を `parseCardAmount` に変更する。  
対象は **`scrapeCardsByAnchor`・`parseCardBlock`・`scrapeCardsByDl` スコープ内** の `parseFloat` のみ（`scrapePortfolio` 内の `parseFloat` は絶対に変更しないこと）。  
置き換え後は null が返った場合にそのカードエントリをスキップ（配列に push しない）するように `if (amount === null) continue;` を追加する。

- [ ] **Step 6: 既存テストが通ることを確認**

```bash
cd apps/crawler && bun test
```
Expected: 全テスト pass

- [ ] **Step 7: コミット**

```bash
git add apps/crawler/src/scrapers/browser-scraper.mjs apps/crawler/src/__tests__/browser-scraper.test.mjs
git commit -m "refactor: extract parseCardAmount with null-return contract"
```

---

### Task 3: parseCardBlock のテスト追加

**背景:** `parseCardBlock(block)` は既に独立した関数として browser-scraper.mjs に存在する（L110-149）。テストを追加してリグレッション防止する。

**Files:**
- Modify: `apps/crawler/src/scrapers/browser-scraper.mjs`（export 追加のみ）
- Modify: `apps/crawler/src/__tests__/browser-scraper.test.mjs`

- [ ] **Step 1: parseCardBlock を export する**

`browser-scraper.mjs` の `function parseCardBlock(` を `export function parseCardBlock(` に変更する。

- [ ] **Step 2: テストを追記（失敗する状態で）**

`browser-scraper.test.mjs` の先頭 import を書き換え:
```js
// 既存の import 文を以下に置き換える（parseCardBlock を追加）
import { parseCardAmount, parseCardBlock } from "../scrapers/browser-scraper.mjs";
```

その後、ファイル末尾に追記:
```js
describe("parseCardBlock", () => {
  it("三井住友カードの確定金額と引き落とし日を返す", () => {
    const block = `三井住友カード (VpassID)金融機関サービスサイトへ
取得日時(03/19 18:44)
-23,879円
引き落とし日:(2026/03/26)
利用残高:-60,366円
ポイント:202円
sol******`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.amountJpy).toBe(23879);
    expect(result.dueDate).toBe("2026-03-26");
    expect(result.cardName).toContain("三井住友");
  });

  it("PayPayカード（引き落とし未確定）は利用残高を返す", () => {
    const block = `PayPayカード金融機関サービスサイトへ
取得日時(03/19 18:43)
引き落とし額未確定
利用残高:-10,885円
080********`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.amountJpy).toBe(10885);
    expect(result.dueDate).toBeNull();
  });

  it("空文字はnullを返す", () => {
    expect(parseCardBlock("")).toBeNull();
  });
});
```

- [ ] **Step 3: テストを実行して結果確認（失敗する場合は parseCardBlock の実装を修正）**

```bash
cd apps/crawler && bun test src/__tests__/browser-scraper.test.mjs
```
Expected: 全テスト pass。もし parseCardBlock の dueDate フォーマットが `2026-03-26` 形式でなければ実装を合わせる。

- [ ] **Step 4: コミット**

```bash
git add apps/crawler/src/scrapers/browser-scraper.mjs apps/crawler/src/__tests__/browser-scraper.test.mjs
git commit -m "test: add parseCardBlock tests"
```

---

### Task 4: buildMonthlyBreakdown 抽出 + テスト

**背景:** `apps/api/src/services/dividends.ts` の `getDividendCalendar()` 内に monthlyBreakdown を計算するインラインロジックがある（L97-110付近）。これを `buildMonthlyBreakdown(holdings)` として抽出し、テスト追加する。

**Files:**
- Modify: `apps/api/src/services/dividends.ts`
- Create: `apps/api/src/services/__tests__/dividends.test.ts`

- [ ] **Step 1: テストファイルを作成（失敗する状態で）**

`apps/api/src/services/__tests__/dividends.test.ts`:
```ts
import { describe, it, expect } from "bun:test";
import { buildMonthlyBreakdown } from "../dividends";

describe("buildMonthlyBreakdown", () => {
  // 実装: nextExDate の月 と 6ヶ月後に年間配当の半分ずつ振り分ける（年2回配当想定）
  it("nextExDate の月と6ヶ月後に半分ずつ振り分ける", () => {
    const holdings = [
      { annualEstJpy: 12000, nextExDate: "2026-03-15" },
    ];
    const result = buildMonthlyBreakdown(holdings as any);
    expect(result[2]).toBe(6000); // 3月(index 2)に半分
    expect(result[8]).toBe(6000); // 9月(index 8 = 2+6)に半分
  });

  it("同じ月の複数銘柄は合算される", () => {
    const holdings = [
      { annualEstJpy: 3000, nextExDate: "2026-03-10" },
      { annualEstJpy: 5000, nextExDate: "2026-03-25" },
    ];
    const result = buildMonthlyBreakdown(holdings as any);
    // 各銘柄の半分が3月に入る: 1500 + 2500 = 4000
    expect(result[2]).toBe(4000);
  });

  it("nextExDate がない銘柄は12ヶ月均等分配される", () => {
    const holdings = [
      { annualEstJpy: 1200, nextExDate: null },
    ];
    const result = buildMonthlyBreakdown(holdings as any);
    // 1200 / 12 = 各月 100
    expect(result.every((v) => v === 100)).toBe(true);
    expect(result).toHaveLength(12);
  });

  it("TZズレなし: YYYY-MM-DD 文字列パースで正しい月を返す", () => {
    // "2026-01-01" を new Date() でパースすると UTC→JST変換で12月になる場合がある
    // split("-") で直接パースするため安全
    const holdings = [{ annualEstJpy: 1000, nextExDate: "2026-01-01" }];
    const result = buildMonthlyBreakdown(holdings as any);
    expect(result[0]).toBe(500); // 1月(index 0)に半分
    expect(result[6]).toBe(500); // 7月(index 6)に半分
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd apps/api && bun test src/services/__tests__/dividends.test.ts
```
Expected: FAIL（`buildMonthlyBreakdown` が export されていない）

- [ ] **Step 3: dividends.ts から buildMonthlyBreakdown を抽出してエクスポート**

`getDividendCalendar()` 内の monthlyBreakdown 構築ロジック（L95-110付近）を以下の関数として抜き出す。  
**重要:** 既存ロジックをそのまま等価抽出すること。フィールド名は `annualEstJpy`、戻り値は `number[]`（長さ12固定）:

```ts
export function buildMonthlyBreakdown(
  holdings: { annualEstJpy: number; nextExDate: string | null }[]
): number[] {
  const monthly = Array(12).fill(0) as number[];
  for (const h of holdings) {
    if (h.annualEstJpy <= 0) continue;
    if (h.nextExDate) {
      const exMonth = parseInt(h.nextExDate.split("-")[1], 10) - 1;
      const exMonth2 = (exMonth + 6) % 12;
      monthly[exMonth] += h.annualEstJpy / 2;
      monthly[exMonth2] += h.annualEstJpy / 2;
    } else {
      for (let m = 0; m < 12; m++) {
        monthly[m] += h.annualEstJpy / 12;
      }
    }
  }
  return monthly;
}
```

`getDividendCalendar()` 内のインラインロジックを `buildMonthlyBreakdown(holdings)` 呼び出しに置き換え、変数 `monthlyBreakdown` への代入を削除する。

- [ ] **Step 4: テストが通ることを確認**

```bash
cd apps/api && bun test src/services/__tests__/dividends.test.ts
```
Expected: 4 tests pass

- [ ] **Step 5: Phase 1 チェックポイント — turbo test + PM2 確認**

```bash
pnpm turbo test
```
Expected: api, crawler, db 全パッケージ pass

```bash
pm2 status
```
Expected: `worker` が `online` であること。`errored` や `stopped` になっていれば `pm2 logs worker --lines 30` でエラーを確認する。

- [ ] **Step 6: コミット**

```bash
git add apps/api/src/services/dividends.ts apps/api/src/services/__tests__/dividends.test.ts
git commit -m "refactor: extract buildMonthlyBreakdown from getDividendCalendar + tests"
```

---

## Chunk 2: Golden Snapshot 取得 + Phase 2（大関数の分割）

### Task 5: Golden Snapshot 取得

**目的:** Phase 2 のリファクタ前に `getHoldings` の実出力を保存し、リファクタ後の等価性検証に使う。

**Files:**
- Create: `tests/golden/holdings.json`

- [ ] **Step 1: API が起動していることを確認**

```bash
curl -s http://localhost:8000/health
```
Expected: `{"status":"ok"}` 相当のレスポンス

- [ ] **Step 2: Golden snapshot を保存**

```bash
curl -s "http://localhost:8000/trpc/holdings.list?batch=1&input=%7B%220%22%3A%7B%7D%7D" > tests/golden/holdings.json
```

または tRPC のエンドポイントに合わせて:
```bash
curl -s "http://localhost:8000/holdings" > tests/golden/holdings.json 2>&1
```

レスポンスが空または `{"error":...}` の場合は実際のエンドポイント URL を `pm2 logs api --lines 20` で確認して修正する。

- [ ] **Step 3: ファイルに有効な JSON が保存されていることを確認**

```bash
node -e "const d = require('./tests/golden/holdings.json'); console.log('items:', Array.isArray(d) ? d.length : Object.keys(d).length)"
```
Expected: 保有銘柄数（数十件）が表示される

- [ ] **Step 4: コミット**

```bash
git add tests/golden/holdings.json
git commit -m "test: save golden snapshot for getHoldings regression testing"
```

---

### Task 6: portfolio.ts getHoldings 分割 + テスト

**背景:** `getHoldings()` 165行が DB取得・YF呼び出し・フィルタ・マッピングを混在。分割後のシグネチャ:
- `fetchYahooQuotes(symbols: string[]): Promise<Map<string, number>>`
- `mapToHoldingItems(rows, prevMap, quoteMap, total: number): HoldingItem[]`

YF 失敗時に `console.warn` を追加する（現状は silent catch）。

**Files:**
- Modify: `apps/api/src/services/portfolio.ts`
- Modify: `apps/api/src/services/__tests__/portfolio.test.ts`（新規作成）

- [ ] **Step 1: テストファイルを作成（失敗する状態で）**

`apps/api/src/services/__tests__/portfolio.test.ts`:
```ts
import { describe, it, expect, spyOn, mock } from "bun:test";

// yahoo-finance2 v3 はコンストラクタパターン。クラスとしてモックする
mock.module("yahoo-finance2", () => ({
  default: class MockYahooFinance {
    constructor(_opts?: { suppressNotices?: string[] }) {}
    async quote(symbol: string, _opts?: unknown) {
      if (symbol === "7203.T") return { symbol, regularMarketChangePercent: -1.5 };
      return { symbol, regularMarketChangePercent: 2.0 };
    }
  },
}));

import { fetchYahooQuotes } from "../portfolio";

describe("fetchYahooQuotes", () => {
  it("シンボルの priceDiffPct マップを返す", async () => {
    const result = await fetchYahooQuotes(["7203.T", "AAPL"]);
    expect(result.get("7203.T")).toBe(-1.5);
    expect(result.get("AAPL")).toBe(2.0);
  });

  it("空配列は空の Map を返す", async () => {
    const result = await fetchYahooQuotes([]);
    expect(result.size).toBe(0);
  });

  it("quote が失敗したシンボルは Map から除外され console.warn が呼ばれる", async () => {
    mock.module("yahoo-finance2", () => ({
      default: class MockYahooFinanceErr {
        constructor(_opts?: unknown) {}
        async quote() { throw new Error("YF network error"); }
      },
    }));
    const warnSpy = spyOn(console, "warn");
    const result = await fetchYahooQuotes(["7203.T"]);
    // Promise.allSettled でも rejected 時に warn が呼ばれることを確認
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: portfolio.ts から fetchYahooQuotes を抽出してエクスポート**

`getHoldings()` 内の Yahoo Finance 呼び出しロジック（L205〜L230付近）を抽出。  
**重要:** v3 コンストラクタパターン（`new YahooFinance(...)`）を維持すること。  
`Promise.allSettled` の `rejected` エントリに対して `console.warn` を追加する（現状はサイレント）:

```ts
type YfConstructor = new (opts?: { suppressNotices?: string[] }) => YfClient;
type YfClient = { quote(symbol: string, opts?: unknown): Promise<{ regularMarketChangePercent?: number | null }> };

export async function fetchYahooQuotes(
  symbols: string[]
): Promise<Map<string, number>> {
  const quoteMap = new Map<string, number>();
  if (symbols.length === 0) return quoteMap;
  try {
    const yf = await import("yahoo-finance2");
    const YahooFinance = yf.default as unknown as YfConstructor;
    const yfInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const results = await Promise.allSettled(
      symbols.map((s) => yfInstance.quote(s, { fields: ["regularMarketChangePercent"] }))
    );
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.warn("[portfolio] Yahoo Finance fetch failed for", symbols[i], r.reason);
      } else if (r.value?.regularMarketChangePercent != null) {
        quoteMap.set(symbols[i], r.value.regularMarketChangePercent);
      }
    });
  } catch (err) {
    console.warn("[portfolio] Yahoo Finance import failed:", err);
  }
  return quoteMap;
}
```

- [ ] **Step 3: portfolio.ts から mapToHoldingItems を抽出してエクスポート**

`getHoldings()` 内のマッピングロジックを抽出。シグネチャ:
```ts
export function mapToHoldingItems(
  rows: any[],
  prevMap: Map<number, { priceJpy: number; valueJpy: number }>,
  quoteMap: Map<string, number>,
  total: number
): HoldingItem[]
```

`portfolioWeightPct: total > 0 ? (r.portfolio_snapshots.valueJpy / total) * 100 : 0` の計算は `total` パラメータを使う。

- [ ] **Step 4: getHoldings() 本体を整理**

`getHoldings()` 内の YF 呼び出し部分を `fetchYahooQuotes()` 呼び出しに置き換える。  
`fetchHoldingsFromDb` や `extractStockSymbols` は新規抽出せず、既存のインラインコードをそのまま残す:

```ts
export async function getHoldings(...) {
  // 1. DB から latest/prev データ取得（既存インラインロジック）
  const rows = await db.select()...;
  const prevMap = ...; // prev スナップショットから構築（既存ロジック）
  const total = ...; // 計算ロジックは既存のまま

  // 2. 株式シンボル抽出して YF 取得（インラインコードを fetchYahooQuotes() 呼び出しに置き換え）
  const stockEntries = rows.filter(...).map(...);
  const symbols = stockEntries.map(({ yfSymbol }) => yfSymbol);
  const quoteMap = await fetchYahooQuotes(symbols);

  // 3. マッピング（mapToHoldingItems() 呼び出しに置き換え）
  return mapToHoldingItems(rows, prevMap, quoteMap, total);
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
cd apps/api && bun test src/services/__tests__/portfolio.test.ts
```
Expected: fetchYahooQuotes のテスト pass

- [ ] **Step 6: 型チェック通過確認**

```bash
pnpm --filter @assetbridge/api run type-check
```
Expected: エラーゼロ

- [ ] **Step 7: Phase 2-A チェックポイント — getHoldings の出力が golden と一致することを確認**

```bash
curl -s "http://localhost:8000/trpc/holdings.list?batch=1&input=%7B%220%22%3A%7B%7D%7D" > tests/golden/holdings_after.json
node -e "
const a = JSON.stringify(require('./tests/golden/holdings.json'));
const b = JSON.stringify(require('./tests/golden/holdings_after.json'));
console.log(a === b ? 'MATCH ✅' : 'DIFF ❌');
"
```
Expected: `MATCH ✅`  
（Task 5 で golden snapshot を取得したエンドポイントと同じ URL を使うこと）

```bash
git add apps/api/src/services/portfolio.ts apps/api/src/services/__tests__/portfolio.test.ts
git commit -m "refactor: split getHoldings into fetchYahooQuotes + mapToHoldingItems"
```

---

### Task 7: scrapeCreditCardWithdrawals 3分割 + テスト

**背景:** `scrapeCreditCardWithdrawals()` 191行の3パターンを分割。呼び出し順序（直列フォールバック）:
1. `scrapeCardsByAnchor(page)` → 結果があればそれを返す
2. `scrapeCardsByTable(page)` → 結果があればそれを返す
3. `scrapeCardsByDl(page)` → 最後の手段

**Files:**
- Modify: `apps/crawler/src/scrapers/browser-scraper.mjs`
- Modify: `apps/crawler/src/__tests__/browser-scraper.test.mjs`

- [ ] **Step 1: scrapeCardsByAnchor を抽出**

`browser-scraper.mjs` の `scrapeCreditCardWithdrawals` 関数 **L170-L201** のアンカーベース取得ロジックを `async function scrapeCardsByAnchor(page)` として抽出する。  
（現在: `if (url === BASE_URL)` ブロック → BASE_URL ページで `金融機関サービスサイトへ` アンカーを見つけて `parseCardBlock` で解析）  
`parseCardAmount` を使用し、null 結果はスキップ。戻り値: `Array<{cardName, amountJpy, dueDate}>`

- [ ] **Step 2: scrapeCardsByTable を抽出**

**L203-L284** のテーブルスキャンのフォールバックロジックを `async function scrapeCardsByTable(page)` として抽出する。  
（現在: `table.table_credit_card tr`, `#cf-table tr`, `[class*="card"] tr` 等のセレクタで各行をスキャンし、金額と日付を正規表現で抽出）

- [ ] **Step 3: scrapeCardsByDl を抽出**

**L286-L351** の dl/dt/dd パターンのロジックを `async function scrapeCardsByDl(page)` として抽出する。  
（現在: `dt, .title, .name, [class*="name"]` セレクタで `カード/引落/引き落とし` を含む要素を見つけ、兄弟要素から金額を `balanceMatch`/`scheduledMatch` で複数パターン検出）

- [ ] **Step 4: オーケストレーター関数を実装**

```js
async function scrapeCreditCardWithdrawals(page) {
  let results = await scrapeCardsByAnchor(page);
  if (results.length === 0) {
    results = await scrapeCardsByTable(page);
  }
  if (results.length === 0) {
    results = await scrapeCardsByDl(page);
  }
  return results;
}
```

- [ ] **Step 5: parseCardAmount に境界値テストを追加**

`browser-scraper.test.mjs` に追記（楽天カード・PayPay 全パターンカバー）:
```js
describe("scrapeCreditCardWithdrawals 境界値", () => {
  it("parseCardAmount が null を返す場合はエントリをスキップ", () => {
    expect(parseCardAmount("引き落とし額未確定")).toBeNull();
    expect(parseCardAmount("")).toBeNull();
  });
});
```

- [ ] **Step 6: テスト全件通過確認**

```bash
cd apps/crawler && bun test
```
Expected: 全テスト pass

- [ ] **Step 7: PM2 worker 再起動して動作確認**

```bash
pm2 restart worker
pm2 logs worker --lines 20 --nostream
```
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add apps/crawler/src/scrapers/browser-scraper.mjs apps/crawler/src/__tests__/browser-scraper.test.mjs
git commit -m "refactor: split scrapeCreditCardWithdrawals into 3 strategy functions"
```

---

## Chunk 3: Phase 3（統合テスト + 最終検証）

### Task 8: snapshots.ts インメモリDB 統合テスト

**Files:**
- Create: `packages/db/src/repos/__tests__/snapshots.test.ts`

- [ ] **Step 1: テストファイルを作成**

`packages/db/src/repos/__tests__/snapshots.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../schema";
import { SnapshotsRepo, DailyTotalsRepo } from "../snapshots";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      type TEXT
    );
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY,
      asset_id INTEGER,
      date TEXT,
      price_jpy REAL,
      value_jpy REAL,
      quantity REAL
    );
    CREATE TABLE IF NOT EXISTS daily_totals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      total_jpy REAL NOT NULL DEFAULT 0,
      stock_jp_jpy REAL NOT NULL DEFAULT 0,
      stock_us_jpy REAL NOT NULL DEFAULT 0,
      fund_jpy REAL NOT NULL DEFAULT 0,
      cash_jpy REAL NOT NULL DEFAULT 0,
      pension_jpy REAL NOT NULL DEFAULT 0,
      point_jpy REAL NOT NULL DEFAULT 0,
      prev_diff_jpy REAL NOT NULL DEFAULT 0,
      prev_diff_pct REAL NOT NULL DEFAULT 0
    );
  `);
  return { db, sqlite };
}

describe("SnapshotsRepo.upsertSnapshot", () => {
  it("同一 (assetId, date) は upsert される", async () => {
    const { db } = createTestDb();
    const repo = new SnapshotsRepo(db);
    await repo.upsertSnapshot({ assetId: 1, date: "2026-03-19", priceJpy: 100, valueJpy: 10000, quantity: 100 });
    await repo.upsertSnapshot({ assetId: 1, date: "2026-03-19", priceJpy: 110, valueJpy: 11000, quantity: 100 });
    const rows = await repo.getByDate("2026-03-19");
    expect(rows).toHaveLength(1);
    expect(rows[0].priceJpy).toBe(110);
  });
});

describe("DailyTotalsRepo.getPrev", () => {
  it("latestDate より前の最新日付を返す", () => {
    const { db } = createTestDb();
    const repo = new DailyTotalsRepo(db);
    // 2日分のデータを挿入
    repo.upsert({ date: "2026-03-18", totalJpy: 1000000, stockJpJpy: 0, stockUsJpy: 0, fundJpy: 0, cashJpy: 1000000, pensionJpy: 0, pointJpy: 0, prevDiffJpy: 0, prevDiffPct: 0 });
    repo.upsert({ date: "2026-03-19", totalJpy: 1010000, stockJpJpy: 0, stockUsJpy: 0, fundJpy: 0, cashJpy: 1010000, pensionJpy: 0, pointJpy: 0, prevDiffJpy: 10000, prevDiffPct: 1.0 });
    // getPrev() は最新日の1つ前（2026-03-18）を返す
    const prev = repo.getPrev();
    expect(prev).not.toBeUndefined();
    expect(prev!.date).toBe("2026-03-18");
    expect(prev!.totalJpy).toBe(1000000);
  });

  it("レコードが1件のみの場合は undefined を返す", () => {
    const { db } = createTestDb();
    const repo = new DailyTotalsRepo(db);
    repo.upsert({ date: "2026-03-19", totalJpy: 1010000, stockJpJpy: 0, stockUsJpy: 0, fundJpy: 0, cashJpy: 1010000, pensionJpy: 0, pointJpy: 0, prevDiffJpy: 0, prevDiffPct: 0 });
    const prev = repo.getPrev();
    expect(prev).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストを実行**

```bash
cd packages/db && bun test src/repos/__tests__/snapshots.test.ts
```
Expected: pass（スキーマエラーが出た場合は schema.ts の実際のカラム名に合わせる）

- [ ] **Step 3: コミット**

```bash
git add packages/db/src/repos/__tests__/snapshots.test.ts
git commit -m "test: add snapshots repo integration tests with in-memory SQLite"
```

---

### Task 9: getHoldings 統合テスト + 最終検証

**Files:**
- Modify: `apps/api/src/services/__tests__/portfolio.test.ts`

- [ ] **Step 1: mapToHoldingItems のユニットテストを追加**

```ts
import { mapToHoldingItems } from "../portfolio";

describe("mapToHoldingItems", () => {
  it("total > 0 の場合 portfolioWeightPct を計算する", () => {
    const rows = [{
      portfolio_snapshots: { assetId: 1, valueJpy: 50000, priceJpy: 500, quantity: 100, costPerUnitJpy: 450, costBasisJpy: 45000 },
      assets: { id: 1, name: "テスト株", symbol: "1234", type: "STOCK_JP" },
    }];
    const prevMap = new Map([[1, { priceJpy: 480, valueJpy: 48000 }]]);
    const quoteMap = new Map([["1234.T", -2.5]]);
    const result = mapToHoldingItems(rows as any, prevMap, quoteMap, 100000);
    expect(result[0].portfolioWeightPct).toBe(50);
    expect(result[0].priceDiffPct).toBe(-2.5);
    expect(result[0].valueDiffJpy).toBe(2000); // 50000 - 48000
  });

  it("前日データなしの場合 valueDiffJpy は null", () => {
    const rows = [{
      portfolio_snapshots: { assetId: 2, valueJpy: 30000, priceJpy: 300, quantity: 100, costPerUnitJpy: 280, costBasisJpy: 28000 },
      assets: { id: 2, name: "現金", symbol: null, type: "CASH" },
    }];
    const result = mapToHoldingItems(rows as any, new Map(), new Map(), 30000);
    expect(result[0].valueDiffJpy).toBeNull();
    expect(result[0].priceDiffPct).toBeNull(); // CASH は YF なし
  });
});
```

- [ ] **Step 2: テストが通ることを確認**

```bash
cd apps/api && bun test src/services/__tests__/portfolio.test.ts
```
Expected: 全テスト pass

- [ ] **Step 3: pnpm turbo test で全パッケージ通過確認**

```bash
pnpm turbo test
```
Expected: api, crawler, db 全て pass

- [ ] **Step 4: 型チェック全パッケージ通過確認**

```bash
pnpm tsc --noEmit
```
Expected: エラーゼロ

- [ ] **Step 5: Playwright E2E smoke テスト実行**

```bash
pnpm exec playwright test tests/e2e/smoke.spec.ts
```
Expected: 全テスト pass（失敗した場合は `pm2 status` で全サービスが online か確認）

- [ ] **Step 6: PM2 全サービス online 確認**

```bash
pm2 status
```
Expected: api, mcp, web, worker が全て `online`

- [ ] **Step 7: getHoldings 出力が golden と一致することを最終確認**

```bash
curl -s "http://localhost:8000/trpc/holdings.list?batch=1&input=%7B%220%22%3A%7B%7D%7D" > tests/golden/holdings_final.json
node -e "
const a = JSON.parse(require('fs').readFileSync('./tests/golden/holdings.json','utf8'));
const b = JSON.parse(require('fs').readFileSync('./tests/golden/holdings_final.json','utf8'));
const aStr = JSON.stringify(a, null, 2);
const bStr = JSON.stringify(b, null, 2);
console.log(aStr === bStr ? 'MATCH ✅' : 'DIFF ❌ (check field differences)');
"
```
Expected: `MATCH ✅`

- [ ] **Step 8: scrapeCreditCardWithdrawals の複数クレカ返却確認**

```bash
pm2 logs worker --lines 50 --nostream | grep -i "card\|credit\|クレカ"
```
Expected: 複数カード（PayPay, 三井住友, 楽天等）のエントリが含まれること

- [ ] **Step 9: 最終コミット**

```bash
git add .
git commit -m "test: complete Phase 3 integration tests and final verification"
```
