import type { DividendCalendar, DividendHolding, HoldingItem } from "@assetbridge/types";
import { getCached, setCached } from "../lib/cache";
import { getAllDividendData } from "../lib/dividendCache";
import { getHoldings } from "./portfolio";
import { getMarketContext } from "./market";

interface YfDividendEvent {
  date: Date | string;
  dividends: number;
}

interface YfQuoteSummaryResult {
  summaryDetail?: {
    dividendYield?: number;
    trailingAnnualDividendYield?: number;
    dividendDate?: Date | string;
    yield?: number;
  };
  calendarEvents?: {
    exDividendDate?: Date | string;
  };
}

interface YfDividendData {
  amountPerShare: number;
  dividendFrequency: string | null;
  fxRateToJpy: number;
  totalAmountJpy: number;
  yieldPct: number;
  nextExDate?: string;
}

// インスタンスをモジュールレベルでキャッシュ（crumb/cookie を1回だけ取得）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _yfInstance: any = null;
async function getYf() {
  if (!_yfInstance) {
    const YahooFinance = await import("yahoo-finance2");
    // suppressNotices はコンストラクタオプションで渡す（インスタンスメソッドは存在しない）
    _yfInstance = new YahooFinance.default({ suppressNotices: ['yahooSurvey'] });
  }
  return _yfInstance;
}

function normalizeYfSymbol(symbol: string): string {
  return /^\d{4,5}$/.test(symbol) ? `${symbol}.T` : symbol;
}

function formatYmd(dateLike: Date | string): string {
  const d = new Date(dateLike);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function roundYen(value: number): number {
  return Math.round(value);
}

function paymentsPerYearFromFrequency(frequency: string | null): number {
  switch ((frequency ?? "").toLowerCase()) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semi-annual":
      return 2;
    case "annual":
    case "yearly":
      return 1;
    default:
      return 1;
  }
}

function inferDividendFrequency(events: YfDividendEvent[]): string | null {
  if (events.length === 0) return null;
  if (events.length >= 10) return "monthly";
  if (events.length === 1) return "annual";
  if (events.length === 2) return "semi-annual";

  const dates = [...events]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((e) => new Date(e.date).getTime());
  const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / (1000 * 60 * 60 * 24));
  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  if (avgGap <= 45) return "monthly";
  if (avgGap <= 120) return "quarterly";
  if (avgGap <= 220) return "semi-annual";
  return "annual";
}

async function getFxRateToJpy(currency: string): Promise<number> {
  if (currency === "JPY") return 1;
  if (currency !== "USD") return 1;

  try {
    const market = await getMarketContext();
    const usdJpy = market.indices.find((i) => i.symbol === "USDJPY=X");
    if (usdJpy?.price && usdJpy.price > 0) {
      return usdJpy.price;
    }
  } catch {
    // fall through to direct quote
  }

  try {
    const yf = await getYf();
    const quote = (await withTimeout(
      yf.quote("USDJPY=X", { fields: ["regularMarketPrice"] }),
      "USDJPY=X"
    ).catch(() => null)) as { regularMarketPrice?: number | null } | null;
    const regularMarketPrice = quote?.regularMarketPrice ?? null;
    return regularMarketPrice && regularMarketPrice > 0 ? regularMarketPrice : 1;
  } catch {
    return 1;
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: ${label}`)), timeoutMs)
    ),
  ]);
}

export async function fetchDividendData(holding: Pick<
  HoldingItem,
  "symbol" | "assetType" | "currency" | "quantity" | "valueJpy" | "dividendFrequency" | "nextExDividendDate"
>): Promise<YfDividendData> {
  try {
    const yf = await getYf();
    const yfSymbol = normalizeYfSymbol(holding.symbol);

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 370);
    const period1 = formatYmd(start);
    const period2 = formatYmd(end);

    const [quoteSummaryRaw, dividendHistory, fxRateToJpy] = await Promise.all([
      withTimeout(
        yf.quoteSummary(yfSymbol, { modules: ["summaryDetail", "calendarEvents"] }),
        `quoteSummary:${yfSymbol}`
      ).catch(() => null as YfQuoteSummaryResult | null),
      withTimeout(
        yf.historical(yfSymbol, { period1, period2, events: "dividends" }),
        `dividendHistory:${yfSymbol}`
      ).catch(() => [] as YfDividendEvent[]),
      getFxRateToJpy(holding.currency),
    ]);
    const quoteSummary = quoteSummaryRaw as YfQuoteSummaryResult | null;

    const events = Array.isArray(dividendHistory) ? dividendHistory : [];
    const normalizedEvents = events
      .map((event) => ({
        date: event.date,
        dividends: Number(event.dividends ?? 0),
      }))
      .filter((event) => event.dividends > 0);

    const frequencyFromHistory = inferDividendFrequency(normalizedEvents);
    const dividendFrequency =
      frequencyFromHistory ?? holding.dividendFrequency ?? null;
    const paymentsPerYear = paymentsPerYearFromFrequency(dividendFrequency);
    const amountPerShare = normalizedEvents.length
      ? normalizedEvents.reduce((sum, event) => sum + event.dividends, 0) / normalizedEvents.length
      : 0;

    const detail = quoteSummary?.summaryDetail;
    const calendar = quoteSummary?.calendarEvents;

    // 権利落ち日: calendarEvents.exDividendDate → summaryDetail.dividendDate の順でフォールバック
    const rawExDate = calendar?.exDividendDate ?? detail?.dividendDate;
    const nextExDate = rawExDate
      ? (() => {
          const d = new Date(rawExDate);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        })()
      : undefined;

    const yieldPctFromHistory =
      holding.valueJpy > 0
        ? ((amountPerShare * paymentsPerYear * holding.quantity * fxRateToJpy) / holding.valueJpy) * 100
        : 0;

    // 既存ロジックとの後方互換: 履歴が取れない場合は Yahoo の yield を使う
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawYield: number =
      detail?.dividendYield ||
      detail?.trailingAnnualDividendYield ||
      (detail as any)?.yield ||
      0;

    const annualEstimateJpyFromYield =
      holding.assetType === "FUND" && rawYield === 0
        ? holding.valueJpy * 0.04
        : holding.valueJpy * rawYield;

    const totalAmountJpy =
      normalizedEvents.length > 0
        ? roundYen(amountPerShare * holding.quantity * fxRateToJpy)
        : roundYen(annualEstimateJpyFromYield / paymentsPerYear);

    return {
      amountPerShare: amountPerShare > 0 ? amountPerShare : totalAmountJpy / Math.max(holding.quantity * fxRateToJpy, 1),
      dividendFrequency,
      fxRateToJpy,
      totalAmountJpy,
      yieldPct: normalizedEvents.length > 0 ? yieldPctFromHistory : rawYield * 100,
      nextExDate,
    };
  } catch {
    return {
      amountPerShare: 0,
      dividendFrequency: holding.dividendFrequency ?? null,
      fxRateToJpy: holding.currency === "JPY" ? 1 : 1,
      totalAmountJpy: 0,
      yieldPct: 0,
      nextExDate: undefined,
    };
  }
}

export function buildMonthlyBreakdown(
  holdings: { 
    annualEstJpy: number; 
    nextExDate: string | null; 
    assetType: string;
    dividendFrequency?: string | null;
    nextExDividendDate?: string | null;
  }[]
): number[] {
  const monthly = Array(12).fill(0) as number[];
  for (const h of holdings) {
    if (h.annualEstJpy <= 0) continue;

    const freq = (h.dividendFrequency ?? "").toLowerCase();
    const dateStr = h.nextExDividendDate ?? h.nextExDate;

    if (freq === "monthly") {
      for (let m = 0; m < 12; m++) {
        monthly[m] += h.annualEstJpy / 12;
      }
    } else if (freq === "annual" || freq === "yearly") {
      if (dateStr) {
        const exMonth = parseInt(dateStr.split("-")[1], 10) - 1;
        monthly[exMonth] += h.annualEstJpy;
      } else {
        monthly[2] += h.annualEstJpy; // 3月フォールバック
      }
    } else if (freq === "semi-annual") {
      if (dateStr) {
        const exMonth = parseInt(dateStr.split("-")[1], 10) - 1;
        monthly[exMonth] += h.annualEstJpy / 2;
        monthly[(exMonth + 6) % 12] += h.annualEstJpy / 2;
      } else {
        monthly[2] += h.annualEstJpy / 2;  // 3月
        monthly[8] += h.annualEstJpy / 2;  // 9月
      }
    } else if (freq === "quarterly") {
      if (dateStr) {
        const exMonth = parseInt(dateStr.split("-")[1], 10) - 1;
        for (let i = 0; i < 4; i++) {
          monthly[(exMonth + i * 3) % 12] += h.annualEstJpy / 4;
        }
      } else {
        monthly[2]  += h.annualEstJpy / 4;
        monthly[5]  += h.annualEstJpy / 4;
        monthly[8]  += h.annualEstJpy / 4;
        monthly[11] += h.annualEstJpy / 4;
      }
    } else if (freq) {
      // 既知だが上記以外の頻度は年1回として扱う
      if (dateStr) {
        const exMonth = parseInt(dateStr.split("-")[1], 10) - 1;
        monthly[exMonth] += h.annualEstJpy;
      } else {
        monthly[2] += h.annualEstJpy;
      }
    } else if (h.assetType === "FUND") {
      // freq 不明の投信は、権利落ち日 or 毎月均等
      if (dateStr) {
        const exMonth = parseInt(dateStr.split("-")[1], 10) - 1;
        monthly[exMonth] += h.annualEstJpy;
      } else {
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
  const allInvestmentHoldings = holdings.filter(
    (h) => h.assetType === "STOCK_JP" || h.assetType === "STOCK_US" || h.assetType === "FUND"
  );

  // dividend_data.is_unknown=1 の銘柄は配当未確認のため除外
  const dividendDataMap = await getAllDividendData();
  const investmentHoldings = allInvestmentHoldings.filter((h) => {
    const d = dividendDataMap.get(h.symbol);
    return !d?.isUnknown;
  });

  const dividendData = await Promise.all(
    investmentHoldings.map(async (h) => {
      const data = await fetchDividendData(h);
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
      quantity: h.quantity,
      currency: h.currency,
      amountPerShare: h.amountPerShare,
      fxRateToJpy: h.fxRateToJpy,
      totalAmountJpy: h.totalAmountJpy,
      annualEstJpy:
        h.dividendFrequency === "monthly"
          ? h.totalAmountJpy * 12
          : h.dividendFrequency === "quarterly"
            ? h.totalAmountJpy * 4
            : h.dividendFrequency === "semi-annual"
              ? h.totalAmountJpy * 2
              : h.dividendFrequency === "annual" || h.dividendFrequency === "yearly"
                ? h.totalAmountJpy
                : h.assetType === "FUND" && h.yieldPct === 0
                  ? h.valueJpy * 0.04
                  : h.valueJpy * (h.yieldPct / 100),
      yieldPct: h.yieldPct,
      nextExDate: h.nextExDate,
      dividendFrequency: h.dividendFrequency,        // 履歴推定 or DB から
      nextExDividendDate: h.nextExDividendDate,      // DB から
    }));

  const totalAnnualEstJpy = holdingsResult.reduce((a, h) => a + h.annualEstJpy, 0);
  const totalValue = holdings.reduce((a, h) => a + h.valueJpy, 0);
  const portfolioYieldPct = totalValue > 0 ? (totalAnnualEstJpy / totalValue) * 100 : 0;

  const monthlyBreakdown = buildMonthlyBreakdown(
    holdingsResult.map((h) => ({ 
      ...h, 
      nextExDate: h.nextExDate ?? null,
      dividendFrequency: h.dividendFrequency ?? null,
      nextExDividendDate: h.nextExDividendDate ?? null,
    }))
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
