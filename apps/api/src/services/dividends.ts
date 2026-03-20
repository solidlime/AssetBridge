import type { DividendCalendar, DividendHolding } from "@assetbridge/types";
import { getCached, setCached } from "../lib/cache";
import { getHoldings } from "./portfolio";

interface YfDividendData {
  yieldPct: number;
  nextExDate?: string;
}

// インスタンスをモジュールレベルでキャッシュ（crumb/cookie を1回だけ取得）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _yfInstance: any = null;
async function getYf() {
  if (!_yfInstance) {
    const YahooFinance = await import("yahoo-finance2");
    _yfInstance = new YahooFinance.default();
  }
  return _yfInstance;
}

async function fetchDividendData(symbol: string, _assetType: string): Promise<YfDividendData> {
  try {
    const yf = await getYf();

    // 日本株/ETF は 4〜5桁数字 → "{symbol}.T" 形式に変換
    const yfSymbol = /^\d{4,5}$/.test(symbol) ? `${symbol}.T` : symbol;

    // 10秒タイムアウト付きで quoteSummary を実行
    const quoteSummary = await Promise.race([
      yf.quoteSummary(yfSymbol, { modules: ["summaryDetail", "calendarEvents"] }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout: ${yfSymbol}`)), 10000)
      ),
    ]);

    const detail = quoteSummary?.summaryDetail;
    const calendar = quoteSummary?.calendarEvents;

    // ETF は summaryDetail.yield に入る場合があるため3段階フォールバック
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawYield: number =
      detail?.dividendYield ||
      detail?.trailingAnnualDividendYield ||
      (detail as any)?.yield ||
      0;

    return {
      yieldPct: rawYield * 100,
      nextExDate: calendar?.exDividendDate
        ? (() => {
            const d = new Date(calendar.exDividendDate);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          })()
        : undefined,
    };
  } catch {
    return { yieldPct: 0, nextExDate: undefined };
  }
}

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

  // yieldPct が 0 の銘柄も含めて表示（Yahoo Finance 取得失敗時でも銘柄一覧を表示する）
  const holdingsResult: DividendHolding[] = dividendData
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

  const monthlyBreakdown = buildMonthlyBreakdown(
    holdingsResult.map((h) => ({ ...h, nextExDate: h.nextExDate ?? null }))
  );

  // 30日以上前の過去日付は除外（Yahoo Finance のスタールデータを除去）
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const nextExDividendDates = holdingsResult
    .filter((h): h is DividendHolding & { nextExDate: string } => !!h.nextExDate && h.nextExDate >= cutoffStr)
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
