import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockHistorical = mock(async (symbol: string) => {
  if (symbol === "JEPQ") {
    return Array.from({ length: 12 }, (_, i) => ({
      date: `2025-${String(i + 1).padStart(2, "0")}-01T00:00:00.000Z`,
      dividends: 0.5,
    }));
  }
  if (symbol === "8473.T") {
    return [
      { date: "2025-03-28T00:00:00.000Z", dividends: 70 },
      { date: "2025-09-29T00:00:00.000Z", dividends: 20 },
    ];
  }
  return [];
});

const mockQuoteSummary = mock(async (_symbol: string) => ({
  summaryDetail: {
    dividendYield: 0.1058,
    trailingAnnualDividendYield: 0.1058,
    dividendDate: "2026-03-13T13:30:00.000Z",
  },
  calendarEvents: {
    exDividendDate: "2026-03-13T13:30:00.000Z",
  },
}));

const mockQuote = mock(async (symbol: string) => {
  if (symbol === "USDJPY=X") {
    return { regularMarketPrice: 160 };
  }
  return { regularMarketPrice: 1 };
});

mock.module("yahoo-finance2", () => ({
  default: class MockYahooFinance {
    constructor(_opts: object) {}
    async historical(symbol: string) {
      return mockHistorical(symbol);
    }
    async quoteSummary(symbol: string) {
      return mockQuoteSummary(symbol);
    }
    async quote(symbol: string) {
      return mockQuote(symbol);
    }
  },
}));

mock.module("../market", () => ({
  getMarketContext: async () => ({
    indices: [
      {
        symbol: "USDJPY=X",
        name: "USD/JPY",
        price: 160,
        change: 0,
        changePct: 0,
      },
    ],
    cacheAgeMinutes: 0,
  }),
  searchNews: async () => [],
}));

import { buildMonthlyBreakdown, fetchDividendData } from "../dividends";

describe("fetchDividendData", () => {
  beforeEach(() => {
    mockHistorical.mockReset();
    mockHistorical.mockImplementation(async (symbol: string) => {
      if (symbol === "JEPQ") {
        return Array.from({ length: 12 }, (_, i) => ({
          date: `2025-${String(i + 1).padStart(2, "0")}-01T00:00:00.000Z`,
          dividends: 0.5,
        }));
      }
      if (symbol === "8473.T") {
        return [
          { date: "2025-03-28T00:00:00.000Z", dividends: 70 },
          { date: "2025-09-29T00:00:00.000Z", dividends: 20 },
        ];
      }
      return [];
    });
    mockQuoteSummary.mockReset();
    mockQuoteSummary.mockImplementation(async () => ({
      summaryDetail: {
        dividendYield: 0.1058,
        trailingAnnualDividendYield: 0.1058,
        dividendDate: "2026-03-13T13:30:00.000Z",
      },
      calendarEvents: {
        exDividendDate: "2026-03-13T13:30:00.000Z",
      },
    }));
    mockQuote.mockReset();
    mockQuote.mockImplementation(async (symbol: string) => {
      if (symbol === "USDJPY=X") {
        return { regularMarketPrice: 160 };
      }
      return { regularMarketPrice: 1 };
    });
  });

  it("月次配当ETFは月配当として判定し、FX換算後の配当総額を返す", async () => {
    const result = await fetchDividendData({
      symbol: "JEPQ",
      assetType: "STOCK_US",
      currency: "USD",
      quantity: 500,
      valueJpy: 4_527_495,
      dividendFrequency: "quarterly",
      nextExDividendDate: null,
    } as never);

    expect(result.dividendFrequency).toBe("monthly");
    expect(result.amountPerShare).toBeCloseTo(0.5, 5);
    expect(result.fxRateToJpy).toBe(160);
    expect(result.totalAmountJpy).toBe(40_000);
    expect(result.yieldPct).toBeCloseTo((40_000 * 12 / 4_527_495) * 100, 4);
  });

  it("JPY建ての半期配当は2回分を均して年間配当を返す", async () => {
    const result = await fetchDividendData({
      symbol: "8473",
      assetType: "STOCK_JP",
      currency: "JPY",
      quantity: 400,
      valueJpy: 1_218_400,
      dividendFrequency: "semi-annual",
      nextExDividendDate: null,
    } as never);

    expect(result.dividendFrequency).toBe("semi-annual");
    expect(result.amountPerShare).toBe(45);
    expect(result.fxRateToJpy).toBe(1);
    expect(result.totalAmountJpy).toBe(18_000);
    expect(result.yieldPct).toBeCloseTo((18_000 * 2 / 1_218_400) * 100, 4);
  });
});

describe("buildMonthlyBreakdown", () => {
  // 実装: nextExDate の月 と 6ヶ月後に年間配当の半分ずつ振り分ける（年2回配当想定）
  it("nextExDate の月と6ヶ月後に半分ずつ振り分ける", () => {
    const holdings = [
      { annualEstJpy: 12000, nextExDate: "2026-03-15", assetType: "STOCK_JP" },
    ];
    const result = buildMonthlyBreakdown(holdings as never);
    expect(result[2]).toBe(6000); // 3月(index 2)に半分
    expect(result[8]).toBe(6000); // 9月(index 8 = 2+6)に半分
  });

  it("同じ月の複数銘柄は合算される", () => {
    const holdings = [
      { annualEstJpy: 3000, nextExDate: "2026-03-10", assetType: "STOCK_JP" },
      { annualEstJpy: 5000, nextExDate: "2026-03-25", assetType: "STOCK_JP" },
    ];
    const result = buildMonthlyBreakdown(holdings as never);
    // 各銘柄の半分が3月に入る: 1500 + 2500 = 4000
    expect(result[2]).toBe(4000);
  });

  it("nextExDate がない銘柄は12ヶ月均等分配される", () => {
    const holdings = [
      { annualEstJpy: 1200, nextExDate: null, assetType: "FUND" },
    ];
    const result = buildMonthlyBreakdown(holdings as never);
    // 1200 / 12 = 各月 100
    expect(result.every((v) => v === 100)).toBe(true);
    expect(result).toHaveLength(12);
  });

  it("月配当の銘柄は月次で均等配分される", () => {
    const holdings = [
      {
        annualEstJpy: 12000,
        nextExDate: "2026-03-15",
        assetType: "STOCK_US",
        dividendFrequency: "monthly",
      },
    ];
    const result = buildMonthlyBreakdown(holdings as never);
    expect(result.every((v) => v === 1000)).toBe(true);
  });

  it("TZズレなし: YYYY-MM-DD 文字列パースで正しい月を返す", () => {
    // "2026-01-01" を new Date() でパースすると UTC→JST変換で12月になる場合がある
    // split("-") で直接パースするため安全
    const holdings = [{ annualEstJpy: 1000, nextExDate: "2026-01-01", assetType: "STOCK_JP" }];
    const result = buildMonthlyBreakdown(holdings as never);
    expect(result[0]).toBe(500); // 1月(index 0)に半分
    expect(result[6]).toBe(500); // 7月(index 6)に半分
  });
});
