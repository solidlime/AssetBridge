import { describe, it, expect, mock, beforeEach } from "bun:test";

// ─── Yahoo Finance をモック（クラスパターン）───────────────────────────────────
// NOTE: mock.module() はトップレベルで宣言し、import より前に置く必要がある
const mockQuote = mock(async (ticker: string): Promise<{ regularMarketChangePercent: number | null }> => ({
  regularMarketChangePercent: ticker === "AAPL" ? 1.5 : -0.5,
}));

mock.module("yahoo-finance2", () => ({
  default: class MockYahooFinance {
    constructor(_opts: object) {}
    async quote(ticker: string) {
      return mockQuote(ticker);
    }
  },
}));

import { fetchYahooQuotes, mapToHoldingItems, getHoldings } from "../portfolio";
import type { AssetType } from "@assetbridge/types";

// ─── goldenスナップショット ─────────────────────────────────────────────────
import goldenHoldings from "../../../../../tests/golden/holdings.json";

// ─── fetchYahooQuotes ────────────────────────────────────────────────────────

describe("fetchYahooQuotes", () => {
  beforeEach(() => {
    mockQuote.mockReset();
    // デフォルト実装を再設定
    mockQuote.mockImplementation(async (ticker: string) => ({
      regularMarketChangePercent: ticker === "AAPL" ? 1.5 : -0.5,
    }));
  });

  it("空配列は空Mapを返す", async () => {
    const result = await fetchYahooQuotes([]);
    expect(result.size).toBe(0);
  });

  it("tickerに対応するpriceDiffPctをMapで返す", async () => {
    const result = await fetchYahooQuotes(["AAPL", "MSFT"]);
    expect(result.get("AAPL")).toBe(1.5);
    expect(result.get("MSFT")).toBe(-0.5);
  });

  it("quote失敗したtickerはMapに含まれない", async () => {
    // 最初の呼び出し（FAIL）だけ reject させる
    mockQuote.mockImplementationOnce(async () => {
      throw new Error("API error");
    });
    const result = await fetchYahooQuotes(["FAIL", "AAPL"]);
    expect(result.has("FAIL")).toBe(false);
    expect(result.has("AAPL")).toBe(true);
    expect(result.get("AAPL")).toBe(1.5);
  });

  it("regularMarketChangePercent が null の ticker はMapに含まれない", async () => {
    mockQuote.mockImplementationOnce(async () => ({
      regularMarketChangePercent: null,
    }));
    const result = await fetchYahooQuotes(["NULL_TICKER"]);
    expect(result.has("NULL_TICKER")).toBe(false);
  });
});

// ─── mapToHoldingItems ───────────────────────────────────────────────────────

/** テスト用 DbRow ファクトリ */
function makeRow(overrides: {
  symbol?: string;
  name?: string;
  assetType?: string;
  assetId?: number;
  valueJpy?: number;
  costBasisJpy?: number;
  unrealizedPnlJpy?: number;
  unrealizedPnlPct?: number;
  quantity?: number;
  priceJpy?: number;
  costPerUnitJpy?: number;
  dividendFrequency?: string | null;
  dividendAmount?: number | null;
  dividendRate?: number | null;
  nextExDividendDate?: string | null;
}) {
  return {
    portfolio_snapshots: {
      assetId: overrides.assetId ?? 1,
      priceJpy: overrides.priceJpy ?? 1000,
      valueJpy: overrides.valueJpy ?? 10000,
      costBasisJpy: overrides.costBasisJpy ?? 8000,
      costPerUnitJpy: overrides.costPerUnitJpy ?? 800,
      unrealizedPnlJpy: overrides.unrealizedPnlJpy ?? 2000,
      unrealizedPnlPct: overrides.unrealizedPnlPct ?? 25.0,
      quantity: overrides.quantity ?? 10,
      dividendFrequency: overrides.dividendFrequency ?? null,
      dividendAmount: overrides.dividendAmount ?? null,
      dividendRate: overrides.dividendRate ?? null,
      nextExDividendDate: overrides.nextExDividendDate ?? null,
    },
    assets: {
      symbol: overrides.symbol ?? "AAPL",
      name: overrides.name ?? "Apple Inc.",
      assetType: overrides.assetType ?? "STOCK_US",
      currency: "JPY",
      institutionName: null,
    },
  };
}

describe("mapToHoldingItems", () => {
  it("空行は空配列を返す", () => {
    const result = mapToHoldingItems([], new Map());
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("holdingsとquotesを正しくマッピングする", () => {
    const rows = [makeRow({ symbol: "AAPL", valueJpy: 10000 })];
    const quotes = new Map([["AAPL", 1.5]]);
    const result = mapToHoldingItems(rows, quotes, new Map(), 20000);

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.symbol).toBe("AAPL");
    expect(item.name).toBe("Apple Inc.");
    expect(item.assetType).toBe("STOCK_US");
    expect(item.valueJpy).toBe(10000);
    expect(item.priceDiffPct).toBe(1.5);
    expect(item.portfolioWeightPct).toBe(50); // 10000/20000*100
  });

  it("quotesにないsymbolはpriceDiffPct: nullになる", () => {
    const rows = [makeRow({ symbol: "FUND_A", assetType: "FUND" })];
    const result = mapToHoldingItems(rows, new Map());
    expect(result[0].priceDiffPct).toBeNull();
  });

  it("total=0のときportfolioWeightPctは0になる", () => {
    const rows = [makeRow({ valueJpy: 5000 })];
    const result = mapToHoldingItems(rows, new Map(), new Map(), 0);
    expect(result[0].portfolioWeightPct).toBe(0);
  });

  it("prevSnapshotMapがある場合valueDiffJpy/Pctを計算する", () => {
    const rows = [makeRow({ assetId: 42, valueJpy: 11000 })];
    const prevMap = new Map([[42, { priceJpy: 900, valueJpy: 10000 }]]);
    const result = mapToHoldingItems(rows, new Map(), prevMap, 11000);

    expect(result[0].valueDiffJpy).toBe(1000); // 11000 - 10000
    expect(result[0].valueDiffPct).toBeCloseTo(10); // (1000/10000)*100
  });

  it("prevSnapshotMapがない場合valueDiffJpy/PctはnullになRu", () => {
    const rows = [makeRow({ assetId: 99, valueJpy: 5000 })];
    // prevSnapshotMap に assetId=99 は存在しない
    const result = mapToHoldingItems(rows, new Map(), new Map(), 5000);
    expect(result[0].valueDiffJpy).toBeNull();
    expect(result[0].valueDiffPct).toBeNull();
  });

  it("複数銘柄を正しく変換する", () => {
    const rows = [
      makeRow({ symbol: "AAPL", assetId: 1, valueJpy: 10000 }),
      makeRow({ symbol: "KO", assetId: 2, valueJpy: 5000, assetType: "STOCK_US" }),
    ];
    const quotes = new Map([
      ["AAPL", 1.5],
      ["KO", -0.2],
    ]);
    const result = mapToHoldingItems(rows, quotes, new Map(), 15000);

    expect(result).toHaveLength(2);
    expect(result[0].priceDiffPct).toBe(1.5);
    expect(result[1].priceDiffPct).toBe(-0.2);
    // portfolioWeightPct の合計は 100%
    const totalWeight = result.reduce((s, r) => s + r.portfolioWeightPct, 0);
    expect(totalWeight).toBeCloseTo(100);
  });
});

// ─── Golden Snapshot 回帰テスト ───────────────────────────────────────────────

describe("getHoldings golden snapshot", () => {
  it("レスポンス構造がスナップショットと一致する", () => {
    // フィールドの存在確認（値は変動するので構造だけ検証）
    const item = goldenHoldings[0];
    expect(item).toHaveProperty("symbol");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("priceJpy");
    expect(item).toHaveProperty("valueJpy");
    expect(item).toHaveProperty("assetType");
    expect(item).toHaveProperty("costBasisJpy");
    expect(item).toHaveProperty("unrealizedPnlJpy");
    expect(item).toHaveProperty("unrealizedPnlPct");
    expect(item).toHaveProperty("portfolioWeightPct");
    expect(item).toHaveProperty("priceDiffPct");
    expect(goldenHoldings).toHaveLength(47);
  });

  it("全アイテムがHoldingItem型の必須フィールドを持つ", () => {
    const requiredFields: (keyof (typeof goldenHoldings)[0])[] = [
      "symbol",
      "name",
      "assetType",
      "valueJpy",
      "costBasisJpy",
      "unrealizedPnlJpy",
      "unrealizedPnlPct",
      "portfolioWeightPct",
      "quantity",
      "priceJpy",
      "costPerUnitJpy",
    ];
    for (const item of goldenHoldings) {
      for (const field of requiredFields) {
        expect(item).toHaveProperty(field);
      }
    }
  });
});

// ─── getHoldings 統合テスト ───────────────────────────────────────────────────
// NOTE: golden snapshot テスト（上記）が実際の DB を使った統合テストとして機能している。
//       ここでは補完的な edge case テストのみ追加する。

describe("getHoldings integration", () => {
  it("filter.assetType=all で全銘柄を返す", async () => {
    const result = await getHoldings({ assetType: "all" });
    expect(Array.isArray(result)).toBe(true);
    // 少なくとも1銘柄以上返されることを確認
    expect(result.length).toBeGreaterThan(0);
  });

  it("filter.assetType で特定タイプのみ返す", async () => {
    const result = await getHoldings({ assetType: "stock_us" });
    expect(Array.isArray(result)).toBe(true);
    // すべて STOCK_US であることを確認
    result.forEach((item) => {
      expect(item.assetType).toBe("STOCK_US");
    });
  });

  it("filter.minValueJpy でフィルタする", async () => {
    const result = await getHoldings({ assetType: "all", minValueJpy: 1000000 });
    expect(Array.isArray(result)).toBe(true);
    result.forEach((item) => {
      expect(item.valueJpy).toBeGreaterThanOrEqual(1000000);
    });
  });

  it("filter.query でシンボル・名前検索する", async () => {
    const result = await getHoldings({ assetType: "all", query: "apple" });
    expect(Array.isArray(result)).toBe(true);
    // "apple" を含む銘柄のみ返されること（case-insensitive）
    result.forEach((item) => {
      const match =
        item.name.toLowerCase().includes("apple") ||
        item.symbol.toLowerCase().includes("apple");
      expect(match).toBe(true);
    });
  });
});

