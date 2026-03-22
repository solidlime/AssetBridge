import { db } from "@assetbridge/db/client";
import { assets, portfolioSnapshots, dailyTotals } from "@assetbridge/db/schema";
import type { PortfolioSnapshot, HoldingItem, DailyTotal, AssetType, AssetDetail, AssetMarketData, NewsItem } from "@assetbridge/types";
import { eq, desc, gte, and, lt } from "drizzle-orm";
import { getCachedPrice, setCachedPrice, hasCachedPrice } from "../lib/priceCache.js";

// ─── 内部型定義 ───────────────────────────────────────────────────────────────

/** portfolioSnapshots JOIN assets から得られる行の型 */
type DbRow = {
  portfolio_snapshots: {
    assetId: number;
    priceJpy: number;
    valueJpy: number;
    costBasisJpy: number;
    costPerUnitJpy: number;
    unrealizedPnlJpy: number;
    unrealizedPnlPct: number;
    quantity: number;
    dividendFrequency: string | null;
    dividendAmount: number | null;
    dividendRate: number | null;
    nextExDividendDate: string | null;
    currentPriceJpy: number | null;
    currentPriceNative: number | null;
  };
  assets: {
    symbol: string;
    name: string;
    assetType: string;
    currency: string;
    institutionName: string | null;
  };
};

type PrevSnapshot = { priceJpy: number; valueJpy: number };

// ─── 純粋関数 1: Yahoo Finance から priceDiffPct を取得 ───────────────────────

/**
 * 指定ティッカー（YF 形式、JP株は ".T" 付き）ごとに
 * regularMarketChangePercent を取得して Map で返す。
 * キャッシュを活用して外部API呼び出しを削減する。
 * 失敗したティッカーはマップに含まれない。
 */
export async function fetchYahooQuotes(
  tickers: string[]
): Promise<Map<string, number>> {
  if (tickers.length === 0) return new Map();

  // キャッシュから取得可能なティッカーを分離
  const cachedResults = new Map<string, number>();
  const tickersToFetch: string[] = [];

  for (const ticker of tickers) {
    if (hasCachedPrice(ticker)) {
      const cachedValue = getCachedPrice(ticker);
      if (cachedValue !== undefined) {
        cachedResults.set(ticker, cachedValue);
      }
    } else {
      tickersToFetch.push(ticker);
    }
  }

  // キャッシュミスのティッカーのみ外部 API へ問い合わせ
  const map = new Map<string, number>(cachedResults);

  if (tickersToFetch.length === 0) {
    // すべてキャッシュにあった
    return map;
  }

  const yf = await import("yahoo-finance2");
  type YfQuoteResult = { regularMarketChangePercent?: number | null };
  type YfClient = {
    quote: (symbol: string, opts?: { fields?: string[] }) => Promise<YfQuoteResult>;
  };
  type YfConstructor = new (opts?: { suppressNotices?: string[] }) => YfClient;
  const YahooFinance = yf.default as unknown as YfConstructor;
  const yfInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  const results = await Promise.allSettled(
    tickersToFetch.map((t) =>
      yfInstance
        .quote(t, { fields: ["regularMarketChangePercent"] })
        .then((q) => ({ ticker: t, value: q?.regularMarketChangePercent ?? null }))
    )
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.value !== null) {
      const ticker = tickersToFetch[i];
      map.set(ticker, r.value.value);
      // 取得した値をキャッシュに保存
      setCachedPrice(ticker, r.value.value);
    } else if (r.status === "rejected") {
      console.warn(`YF quote failed for ticker ${tickersToFetch[i]}: ${r.reason}`);
    }
  });
  return map;
}

// ─── 純粋関数 2: DB 行 + quotes Map → HoldingItem[] ──────────────────────────

/**
 * DB から取得した行と YF 価格変動 Map を受け取り、
 * フロントエンド用の HoldingItem 配列に変換する純粋関数。
 *
 * @param rows          portfolioSnapshots JOIN assets の行
 * @param quotes        symbol → priceDiffPct のマップ（元のシンボルをキーとする）
 * @param prevSnapshotMap  前日スナップショット（assetId → {priceJpy, valueJpy}）
 * @param total         ポートフォリオ総額（portfolioWeightPct 計算用）
 */
export function mapToHoldingItems(
  rows: DbRow[],
  quotes: Map<string, number>,
  prevSnapshotMap: Map<number, PrevSnapshot> = new Map(),
  total: number = 0
): HoldingItem[] {
  return rows.map((r) => {
    const prev = prevSnapshotMap.get(r.portfolio_snapshots.assetId) ?? null;
    const valueDiffJpy =
      prev !== null ? r.portfolio_snapshots.valueJpy - prev.valueJpy : null;
    const valueDiffPct =
      prev !== null && prev.valueJpy !== 0
        ? ((r.portfolio_snapshots.valueJpy - prev.valueJpy) / prev.valueJpy) * 100
        : null;

    return {
      symbol: r.assets.symbol,
      name: r.assets.name,
      assetType: r.assets.assetType as AssetType,
      currency: r.assets.currency,
      valueJpy: r.portfolio_snapshots.valueJpy,
      costBasisJpy: r.portfolio_snapshots.costBasisJpy,
      unrealizedPnlJpy: r.portfolio_snapshots.unrealizedPnlJpy,
      unrealizedPnlPct: r.portfolio_snapshots.unrealizedPnlPct,
      portfolioWeightPct:
        total > 0 ? (r.portfolio_snapshots.valueJpy / total) * 100 : 0,
      quantity: r.portfolio_snapshots.quantity,
      priceJpy: r.portfolio_snapshots.priceJpy,
      costPerUnitJpy: r.portfolio_snapshots.costPerUnitJpy,
      currentPriceJpy: r.portfolio_snapshots.currentPriceJpy ?? undefined,
      currentPriceNative: r.portfolio_snapshots.currentPriceNative ?? null,
      valueDiffJpy,
      valueDiffPct,
      priceDiffPct: quotes.get(r.assets.symbol) ?? null,
      dividendFrequency: r.portfolio_snapshots.dividendFrequency ?? undefined,
      dividendAmount: r.portfolio_snapshots.dividendAmount ?? undefined,
      dividendRate: r.portfolio_snapshots.dividendRate ?? undefined,
      nextExDividendDate: r.portfolio_snapshots.nextExDividendDate ?? undefined,
      institutionName: r.assets.institutionName ?? undefined,
    };
  });
}

export async function getSnapshot(date?: string): Promise<PortfolioSnapshot> {
  // 最新の daily_totals 行を取得
  const latestTotalRow = db
    .select()
    .from(dailyTotals)
    .orderBy(desc(dailyTotals.date))
    .limit(1)
    .get();

  const targetDate = date ?? latestTotalRow?.date ?? new Date().toISOString().split("T")[0];

  // 前日比計算のために最新2行を取得
  const prevRows = db
    .select()
    .from(dailyTotals)
    .orderBy(desc(dailyTotals.date))
    .limit(2)
    .all();

  const currentTotal = latestTotalRow?.totalJpy ?? 0;
  const prevTotal = prevRows[1]?.totalJpy ?? currentTotal;
  const prevDiffJpy = currentTotal - prevTotal;
  const prevDiffPct = prevTotal > 0 ? (prevDiffJpy / prevTotal) * 100 : 0;

  const holdings = await getHoldings({ assetType: "all" });

  // 投資系のみ gainers/losers 対象
  const investmentHoldings = holdings.filter(
    (h) => h.valueJpy > 0 && h.assetType !== "CASH" && h.assetType !== "PENSION" && h.assetType !== "POINT"
  );
  // unrealizedPnlPct が全て 0 の場合は unrealizedPnlJpy の絶対値でフォールバックソート
  const allPctZero = investmentHoldings.every((h) => h.unrealizedPnlPct === 0);
  const sorted = [...investmentHoldings].sort((a, b) =>
    allPctZero
      ? b.unrealizedPnlJpy - a.unrealizedPnlJpy
      : b.unrealizedPnlPct - a.unrealizedPnlPct
  );
  const topGainers = sorted.slice(0, 5).filter((h) =>
    allPctZero ? h.unrealizedPnlJpy > 0 : h.unrealizedPnlPct > 0
  );
  const topLosers = [...sorted].reverse().slice(0, 5).filter((h) =>
    allPctZero ? h.unrealizedPnlJpy < 0 : h.unrealizedPnlPct < 0
  );

  const breakdown = {
    stockJpJpy: latestTotalRow?.stockJpJpy ?? 0,
    stockUsJpy: latestTotalRow?.stockUsJpy ?? 0,
    fundJpy: latestTotalRow?.fundJpy ?? 0,
    cashJpy: latestTotalRow?.cashJpy ?? 0,
    pensionJpy: latestTotalRow?.pensionJpy ?? 0,
    pointJpy: latestTotalRow?.pointJpy ?? 0,
  };

  const allocationPct =
    currentTotal > 0
      ? {
          stockJpJpy: (breakdown.stockJpJpy / currentTotal) * 100,
          stockUsJpy: (breakdown.stockUsJpy / currentTotal) * 100,
          fundJpy: (breakdown.fundJpy / currentTotal) * 100,
          cashJpy: (breakdown.cashJpy / currentTotal) * 100,
          pensionJpy: (breakdown.pensionJpy / currentTotal) * 100,
          pointJpy: (breakdown.pointJpy / currentTotal) * 100,
        }
      : { stockJpJpy: 0, stockUsJpy: 0, fundJpy: 0, cashJpy: 0, pensionJpy: 0, pointJpy: 0 };

  return {
    date: targetDate,
    totalJpy: currentTotal,
    prevDiffJpy,
    prevDiffPct,
    prevMonthDiffJpy:    latestTotalRow?.prevMonthDiffJpy    ?? null,
    prevMonthDiffPct:    latestTotalRow?.prevMonthDiffPct    ?? null,
    prevYearDiffJpy:     latestTotalRow?.prevYearDiffJpy     ?? null,
    prevYearDiffPct:     latestTotalRow?.prevYearDiffPct     ?? null,
    stockJpPrevDiffJpy:  latestTotalRow?.stockJpPrevDiffJpy  ?? null,
    stockJpPrevDiffPct:  latestTotalRow?.stockJpPrevDiffPct  ?? null,
    stockUsPrevDiffJpy:  latestTotalRow?.stockUsPrevDiffJpy  ?? null,
    stockUsPrevDiffPct:  latestTotalRow?.stockUsPrevDiffPct  ?? null,
    fundPrevDiffJpy:     latestTotalRow?.fundPrevDiffJpy     ?? null,
    fundPrevDiffPct:     latestTotalRow?.fundPrevDiffPct     ?? null,
    cashPrevDiffJpy:     latestTotalRow?.cashPrevDiffJpy     ?? null,
    cashPrevDiffPct:     latestTotalRow?.cashPrevDiffPct     ?? null,
    pensionPrevDiffJpy:  latestTotalRow?.pensionPrevDiffJpy  ?? null,
    pensionPrevDiffPct:  latestTotalRow?.pensionPrevDiffPct  ?? null,
    pointPrevDiffJpy:    latestTotalRow?.pointPrevDiffJpy    ?? null,
    pointPrevDiffPct:    latestTotalRow?.pointPrevDiffPct    ?? null,
    breakdown,
    allocationPct,
    topGainers,
    topLosers,
  };
}

export async function getHistory(days: number): Promise<DailyTotal[]> {
  return db
    .select()
    .from(dailyTotals)
    .orderBy(desc(dailyTotals.date))
    .limit(days)
    .all()
    .reverse()
    .map((r) => ({
      date: r.date,
      totalJpy: r.totalJpy,
      stockJpJpy: r.stockJpJpy,
      stockUsJpy: r.stockUsJpy,
      fundJpy: r.fundJpy,
      cashJpy: r.cashJpy,
      pensionJpy: r.pensionJpy,
      pointJpy: r.pointJpy,
      prevDiffJpy: r.prevDiffJpy,
      prevDiffPct: r.prevDiffPct,
    }));
}

export async function getHoldings(filter: {
  assetType?: string;
  minValueJpy?: number;
  query?: string;
}): Promise<HoldingItem[]> {
  const latestDate = db
    .select({ date: dailyTotals.date })
    .from(dailyTotals)
    .orderBy(desc(dailyTotals.date))
    .limit(1)
    .get()?.date;

  if (!latestDate) return [];

  const total =
    db
      .select({ totalJpy: dailyTotals.totalJpy })
      .from(dailyTotals)
      .orderBy(desc(dailyTotals.date))
      .limit(1)
      .get()?.totalJpy ?? 0;

  const rows = db
    .select({
      portfolio_snapshots: {
        assetId: portfolioSnapshots.assetId,
        priceJpy: portfolioSnapshots.priceJpy,
        valueJpy: portfolioSnapshots.valueJpy,
        costBasisJpy: portfolioSnapshots.costBasisJpy,
        costPerUnitJpy: portfolioSnapshots.costPerUnitJpy,
        unrealizedPnlJpy: portfolioSnapshots.unrealizedPnlJpy,
        unrealizedPnlPct: portfolioSnapshots.unrealizedPnlPct,
        quantity: portfolioSnapshots.quantity,
        dividendFrequency: portfolioSnapshots.dividendFrequency,
        dividendAmount: portfolioSnapshots.dividendAmount,
        dividendRate: portfolioSnapshots.dividendRate,
        nextExDividendDate: portfolioSnapshots.nextExDividendDate,
        currentPriceJpy: portfolioSnapshots.currentPriceJpy,
        currentPriceNative: portfolioSnapshots.currentPriceNative,
      },
      assets: {
        symbol: assets.symbol,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
        institutionName: assets.institutionName,
      },
    })
    .from(portfolioSnapshots)
    .innerJoin(assets, eq(portfolioSnapshots.assetId, assets.id))
    .where(eq(portfolioSnapshots.date, latestDate))
    .all();

  // 前日の日付を取得
  const prevDateRow = db
    .select({ date: portfolioSnapshots.date })
    .from(portfolioSnapshots)
    .where(lt(portfolioSnapshots.date, latestDate))
    .orderBy(desc(portfolioSnapshots.date))
    .limit(1)
    .get();
  const prevDate = prevDateRow?.date ?? null;

  // 前日スナップショットを Map 化
  const prevSnapshotMap = new Map<number, { priceJpy: number; valueJpy: number }>();
  if (prevDate) {
    const prevRows = db
      .select({
        assetId: portfolioSnapshots.assetId,
        priceJpy: portfolioSnapshots.priceJpy,
        valueJpy: portfolioSnapshots.valueJpy,
      })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.date, prevDate))
      .all();
    for (const row of prevRows) {
      prevSnapshotMap.set(row.assetId, { priceJpy: row.priceJpy, valueJpy: row.valueJpy });
    }
  }

  // --- Yahoo Finance から priceDiffPct を取得（株式のみ）---
  // yfSymbol → originalSymbol の逆引き Map を構築
  const priceDiffMap = new Map<string, number>();
  try {
    const stockEntries = rows
      .filter(
        (r) =>
          r.assets.assetType === "STOCK_JP" || r.assets.assetType === "STOCK_US"
      )
      .map((r) => {
        const sym = r.assets.symbol;
        // JP株: 4〜5桁数字 → "{symbol}.T"
        const yfSymbol =
          r.assets.assetType === "STOCK_JP" && /^\d{4,5}$/.test(sym)
            ? `${sym}.T`
            : sym;
        return { symbol: sym, yfSymbol };
      });

    if (stockEntries.length > 0) {
      const yfQuotes = await fetchYahooQuotes(stockEntries.map((e) => e.yfSymbol));
      // yfSymbol → 元のシンボルに変換して priceDiffMap に格納
      for (const { symbol, yfSymbol } of stockEntries) {
        const pct = yfQuotes.get(yfSymbol);
        if (pct !== undefined) {
          priceDiffMap.set(symbol, pct);
        }
      }
    }
  } catch {
    // Yahoo Finance 取得失敗時は priceDiffPct: null のまま継続
  }

  // rows → HoldingItem[] に変換（mapToHoldingItems に委譲）
  let items = mapToHoldingItems(rows, priceDiffMap, prevSnapshotMap, total);

  if (filter.assetType && filter.assetType !== "all") {
    // フィルタ文字列 → AssetType への変換マップ
    const typeMap: Record<string, AssetType> = {
      stock_jp: "STOCK_JP",
      stock_us: "STOCK_US",
      fund: "FUND",
      cash: "CASH",
      pension: "PENSION",
      point: "POINT",
    };
    const assetType = typeMap[filter.assetType] ?? (filter.assetType.toUpperCase() as AssetType);
    items = items.filter((h) => h.assetType === assetType);
  }

  if (filter.minValueJpy !== undefined) {
    items = items.filter((h) => h.valueJpy >= filter.minValueJpy!);
  }

  if (filter.query) {
    const q = filter.query.toLowerCase();
    items = items.filter(
      (h) => h.name.toLowerCase().includes(q) || h.symbol.toLowerCase().includes(q)
    );
  }

  return items.sort((a, b) => b.valueJpy - a.valueJpy);
}

export async function getAssetDetail(symbol: string): Promise<AssetDetail> {
  const holdings = await getHoldings({ assetType: "all" });
  const holding = holdings.find((h) => h.symbol === symbol);
  if (!holding) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  // yahoo-finance2 でマーケットデータ取得
  let marketData: AssetMarketData = { symbol };
  try {
    const yf = await import("yahoo-finance2");
    // 日本株は 4〜5桁数字 → "{symbol}.T"
    const yfSymbol = /^\d{4,5}$/.test(symbol) ? `${symbol}.T` : symbol;
    const summary = await (
      yf.default as unknown as {
        quoteSummary: (
          s: string,
          opts: { modules: string[] }
        ) => Promise<{
          summaryDetail?: {
            trailingPE?: number;
            priceToBook?: number;
            dividendYield?: number;
            fiftyTwoWeekHigh?: number;
            fiftyTwoWeekLow?: number;
          };
        }>;
      }
    ).quoteSummary(yfSymbol, { modules: ["summaryDetail"] });

    const detail = summary?.summaryDetail;
    marketData = {
      symbol,
      per: detail?.trailingPE,
      pbr: detail?.priceToBook,
      dividendYield: detail?.dividendYield !== undefined ? detail.dividendYield * 100 : undefined,
      week52High: detail?.fiftyTwoWeekHigh,
      week52Low: detail?.fiftyTwoWeekLow,
    };
  } catch {
    // market data 取得失敗は無視してデフォルト値を使用
  }

  // SearXNG で銘柄ニュース5件取得
  let news: NewsItem[] = [];
  try {
    const { searchNews } = await import("./market");
    news = await searchNews({ symbols: [holding.name, symbol], days: 7 });
    news = news.slice(0, 5);
  } catch {
    // ニュース取得失敗は無視
  }

  // portfolio_snapshots から直近30日の銘柄別履歴を取得
  // assets テーブルから asset_id を特定してから snapshots を取得
  const asset = db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.symbol, symbol))
    .get();

  let history30d: DailyTotal[] = [];
  if (asset) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const snapRows = db
      .select()
      .from(portfolioSnapshots)
      .where(
        and(eq(portfolioSnapshots.assetId, asset.id), gte(portfolioSnapshots.date, thirtyDaysAgo))
      )
      .orderBy(portfolioSnapshots.date)
      .all();

    // DailyTotal 型に合わせて変換（銘柄単体のため breakdown は valueJpy を該当フィールドに入れる）
    history30d = snapRows.map((r) => ({
      date: r.date,
      totalJpy: r.valueJpy,
      stockJpJpy: holding.assetType === "STOCK_JP" ? r.valueJpy : 0,
      stockUsJpy: holding.assetType === "STOCK_US" ? r.valueJpy : 0,
      fundJpy: holding.assetType === "FUND" ? r.valueJpy : 0,
      cashJpy: holding.assetType === "CASH" ? r.valueJpy : 0,
      pensionJpy: holding.assetType === "PENSION" ? r.valueJpy : 0,
      pointJpy: holding.assetType === "POINT" ? r.valueJpy : 0,
      prevDiffJpy: 0,
      prevDiffPct: 0,
    }));
  }

  return { holding, marketData, news, history30d };
}
