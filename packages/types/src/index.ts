export type AssetType = "STOCK_JP" | "STOCK_US" | "FUND" | "CASH" | "PENSION" | "POINT";

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface PortfolioBreakdown {
  stockJpJpy: number;
  stockUsJpy: number;
  fundJpy: number;
  cashJpy: number;
  pensionJpy: number;
  pointJpy: number;
}

export interface PortfolioSnapshot {
  date: string;
  totalJpy: number;
  prevDiffJpy: number;
  prevDiffPct: number;
  breakdown: PortfolioBreakdown;
  allocationPct: PortfolioBreakdown;
  topGainers: HoldingItem[];
  topLosers: HoldingItem[];
}

export interface HoldingItem {
  symbol: string;
  name: string;
  assetType: AssetType;
  currency: string;
  valueJpy: number;
  costBasisJpy: number;
  unrealizedPnlJpy: number;
  unrealizedPnlPct: number;
  portfolioWeightPct: number;
  quantity: number;
  priceJpy: number;
  costPerUnitJpy: number;
  valueDiffJpy: number | null;
  valueDiffPct: number | null;
  priceDiffPct: number | null;
  dividendFrequency?: string;        // "monthly" | "quarterly" | "semi-annual" | "annual"
  dividendAmount?: number;
  dividendRate?: number;
  nextExDividendDate?: string;       // YYYY-MM-DD
  institutionName?: string;
}

export interface DailyTotal {
  date: string;
  totalJpy: number;
  stockJpJpy: number;
  stockUsJpy: number;
  fundJpy: number;
  cashJpy: number;
  pensionJpy: number;
  pointJpy: number;
  prevDiffJpy: number;
  prevDiffPct: number;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MarketContext {
  indices: MarketIndex[];
  cacheAgeMinutes: number;
}

export interface NewsItem {
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
}

export interface DividendHolding {
  symbol: string;
  name: string;
  assetType: AssetType;
  valueJpy: number;
  annualEstJpy: number;
  yieldPct: number;
  nextExDate?: string;
  dividendFrequency?: string;
  nextExDividendDate?: string;
}

export interface DividendCalendar {
  totalAnnualEstJpy: number;
  portfolioYieldPct: number;
  monthlyBreakdown: number[];
  holdings: DividendHolding[];
  nextExDividendDates: { symbol: string; date: string }[];
}

export interface SimulatorInput {
  initial: number;
  monthly: number;
  years: number;
  returnRate: number;
  volatility: number;
  simulations?: number;
}

export interface SimulatorResult {
  yearLabels: number[];
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
}

export interface ScenarioInput {
  shocks: Partial<Record<AssetType, number>>;
}

export interface ScenarioResult {
  currentTotal: number;
  stressedTotal: number;
  lossJpy: number;
  lossPct: number;
  breakdown: Record<string, { original: number; stressed: number; loss: number }>;
}

export interface PeriodAnalysis {
  fromDate: string;
  toDate: string;
  returnPct: number;
  maxDrawdownPct: number;
  volatility: number;
  sharpeRatio: number;
  benchmarkComparison?: {
    symbol: string;
    returnPct: number;
  };
}

export interface ScrapeStatus {
  jobId: number | null;
  status: JobStatus | null;
  attempts: number;
  createdAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
  error: string | null;
}

export interface AssetMarketData {
  symbol: string;
  per?: number;
  pbr?: number;
  dividendYield?: number;
  week52High?: number;
  week52Low?: number;
}

export interface AssetDetail {
  holding: HoldingItem;
  marketData: AssetMarketData;
  news: NewsItem[];
  history30d: DailyTotal[];
}

export interface RiskMetrics {
  volatilityAnnualized: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  days: number;
}
