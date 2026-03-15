import type { DividendCalendar, DividendHolding } from "@assetbridge/types";
import { getCached, setCached } from "../lib/cache";
import { getHoldings } from "./portfolio";

interface YfDividendData {
  yieldPct: number;
  nextExDate?: string;
}

async function fetchDividendData(symbol: string, assetType: string): Promise<YfDividendData> {
  try {
    const yf = await import("yahoo-finance2");
    // 日本株は 4〜5桁数字 → "{symbol}.T" 形式に変換
    const yfSymbol = /^\d{4,5}$/.test(symbol) ? `${symbol}.T` : symbol;

    const quoteSummary = await (
      yf.default as unknown as {
        quoteSummary: (
          s: string,
          opts: { modules: string[] }
        ) => Promise<{
          summaryDetail?: { dividendYield?: number };
          calendarEvents?: { exDividendDate?: number };
        }>;
      }
    ).quoteSummary(yfSymbol, { modules: ["summaryDetail", "calendarEvents"] });

    const detail = quoteSummary?.summaryDetail;
    const calendar = quoteSummary?.calendarEvents;

    return {
      yieldPct: (detail?.dividendYield ?? 0) * 100,
      nextExDate: calendar?.exDividendDate
        ? new Date(calendar.exDividendDate * 1000).toISOString().split("T")[0]
        : undefined,
    };
  } catch {
    return { yieldPct: 0, nextExDate: undefined };
  }
}

export async function getDividendCalendar(): Promise<DividendCalendar> {
  const cacheKey = "dividend_calendar";
  const cached = getCached<DividendCalendar>(cacheKey);
  if (cached) return cached;

  const holdings = await getHoldings({ assetType: "all" });
  // 株式のみ配当対象（投信・現金・年金・ポイントはスキップ）
  const investmentHoldings = holdings.filter(
    (h) => h.assetType === "STOCK_JP" || h.assetType === "STOCK_US"
  );

  const dividendData = await Promise.all(
    investmentHoldings.map(async (h) => {
      const data = await fetchDividendData(h.symbol, h.assetType);
      return { ...h, ...data };
    })
  );

  const holdingsResult: DividendHolding[] = dividendData
    .filter((h) => h.yieldPct > 0)
    .map((h) => ({
      symbol: h.symbol,
      name: h.name,
      assetType: h.assetType,
      valueJpy: h.valueJpy,
      annualEstJpy: h.valueJpy * (h.yieldPct / 100),
      yieldPct: h.yieldPct,
      nextExDate: h.nextExDate,
    }));

  const totalAnnualEstJpy = holdingsResult.reduce((a, h) => a + h.annualEstJpy, 0);
  const totalValue = holdings.reduce((a, h) => a + h.valueJpy, 0);
  const portfolioYieldPct = totalValue > 0 ? (totalAnnualEstJpy / totalValue) * 100 : 0;

  // 月別分布は簡易均等配分
  const monthlyBreakdown = Array(12).fill(totalAnnualEstJpy / 12) as number[];

  const nextExDividendDates = holdingsResult
    .filter((h): h is DividendHolding & { nextExDate: string } => !!h.nextExDate)
    .map((h) => ({ symbol: h.symbol, date: h.nextExDate }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const result: DividendCalendar = {
    totalAnnualEstJpy,
    portfolioYieldPct,
    monthlyBreakdown,
    holdings: holdingsResult,
    nextExDividendDates,
  };

  // 24時間キャッシュ
  setCached(cacheKey, result, 86400);
  return result;
}
