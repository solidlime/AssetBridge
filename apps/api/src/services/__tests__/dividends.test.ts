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
