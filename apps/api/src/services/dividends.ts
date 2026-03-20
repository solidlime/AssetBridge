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

    // 権利落ち日: calendarEvents.exDividendDate → summaryDetail.dividendDate の順でフォールバック
    const rawExDate = calendar?.exDividendDate ?? detail?.dividendDate;
    const nextExDate = rawExDate
      ? (() => {
          const d = new Date(rawExDate);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        })()
      : undefined;

    return { yieldPct: rawYield * 100, nextExDate };
  } catch {
    return { yieldPct: 0, nextExDate: undefined };
  }
}

export function buildMonthlyBreakdown(
  holdings: { annualEstJpy: number; nextExDate: string | null; assetType: string }[]
): number[] {
  const monthly = Array(12).fill(0) as number[];
  for (const h of holdings) {
    if (h.annualEstJpy <= 0) continue;

    if (h.assetType === "FUND") {
      if (h.nextExDate) {
        // 年1回分配型(nextExDateあり): 分配月にのみ全額を計上
        const exMonth = parseInt(h.nextExDate.split("-")[1], 10) - 1;
        monthly[exMonth] += h.annualEstJpy;
      } else {
        // 毎月分配型(nextExDateなし): 全12ヶ月均等
        for (let m = 0; m < 12; m++) {
          monthly[m] += h.annualEstJpy / 12;
        }
      }
    } else if (h.nextExDate) {
      // 権利落ち日が判明している STOCK 系:
      const exMonth = parseInt(h.nextExDate.split("-")[1], 10) - 1;
      if (h.assetType === "STOCK_US") {
        // 米国株: 四半期配当（権利落ち日の月から3ヶ月ごと）
        monthly[exMonth]              += h.annualEstJpy / 4;
        monthly[(exMonth + 3) % 12]  += h.annualEstJpy / 4;
        monthly[(exMonth + 6) % 12]  += h.annualEstJpy / 4;
        monthly[(exMonth + 9) % 12]  += h.annualEstJpy / 4;
      } else {
        // 日本株: 半期配当（権利落ち日の月と6ヶ月後）
        monthly[exMonth]             += h.annualEstJpy / 2;
        monthly[(exMonth + 6) % 12] += h.annualEstJpy / 2;
      }
    } else if (h.assetType === "STOCK_JP") {
      // 日本株（権利落ち日不明）: 3月・9月が最も一般的な配当月
      monthly[2] += h.annualEstJpy / 2;  // 3月
      monthly[8] += h.annualEstJpy / 2;  // 9月
    } else if (h.assetType === "STOCK_US") {
      // 米国株（権利落ち日不明）: 四半期配当（3/6/9/12月に均等配分）
      monthly[2]  += h.annualEstJpy / 4; // 3月
      monthly[5]  += h.annualEstJpy / 4; // 6月
      monthly[8]  += h.annualEstJpy / 4; // 9月
      monthly[11] += h.annualEstJpy / 4; // 12月
    } else {
      // その他: 12ヶ月均等分配
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
  // 株式・投信を配当対象に（現金・年金・ポイントはスキップ）
  const investmentHoldings = holdings.filter(
    (h) => h.assetType === "STOCK_JP" || h.assetType === "STOCK_US" || h.assetType === "FUND"
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
      annualEstJpy: h.assetType === "FUND" && h.yieldPct === 0
        ? h.valueJpy * 0.04
        : h.valueJpy * (h.yieldPct / 100),
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
