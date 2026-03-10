// ===== 共有型定義 =====

export type AssetType = "stock_jp" | "stock_us" | "fund" | "crypto" | "cash" | "pension" | "point";
export type TransactionType = "buy" | "sell" | "dividend" | "deposit" | "withdrawal" | "fee";
export type Sentiment = "positive" | "neutral" | "negative";
export type ScrapeStatus = "success" | "failed" | "running";

export interface Asset {
  id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  exchange: string | null;
  currency: string;
  created_at: string;
}

export interface PortfolioSnapshot {
  id: number;
  asset_id: number;
  date: string;
  quantity: number;
  price_jpy: number;
  value_jpy: number;
  cost_basis_jpy: number;
  unrealized_pnl_jpy: number;
  unrealized_pnl_pct: number;
}

export interface DailyTotal {
  id: number;
  date: string;
  total_jpy: number;
  stock_jp_jpy: number;
  stock_us_jpy: number;
  fund_jpy: number;
  crypto_jpy: number;
  cash_jpy: number;
  pension_jpy: number;
  point_jpy: number;
  prev_day_diff_jpy: number;
  prev_day_diff_pct: number;
}

export interface Transaction {
  id: number;
  asset_id: number | null;
  date: string;
  type: TransactionType;
  quantity: number | null;
  price_jpy: number | null;
  amount_jpy: number;
  note: string | null;
}

export interface MonthlyCashflow {
  id: number;
  year_month: string; // YYYYMM
  income_jpy: number;
  expense_jpy: number;
  net_jpy: number;
  categories_json: string | null;
}

export interface NewsItem {
  id: number;
  symbol: string;
  title: string;
  url: string;
  published_at: string | null;
  source: string | null;
  summary: string | null;
  sentiment: Sentiment;
}

// ===== API レスポンス型 =====

export interface PortfolioSummary {
  date: string;
  total_jpy: number;
  prev_day_diff_jpy: number;
  prev_day_diff_pct: number;
  breakdown: {
    stock_jp_jpy: number;
    stock_us_jpy: number;
    fund_jpy: number;
    crypto_jpy: number;
    cash_jpy: number;
    pension_jpy: number;
    point_jpy: number;
  };
  ai_comment: string | null;
}

export interface HoldingItem {
  asset_id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  price_jpy: number;
  value_jpy: number;
  cost_basis_jpy: number;
  unrealized_pnl_jpy: number;
  unrealized_pnl_pct: number;
}

export interface Holdings {
  date: string;
  items: HoldingItem[];
  total_value_jpy: number;
}

export interface IncomeExpense {
  data: MonthlyCashflow[];
  avg_income_jpy: number;
  avg_expense_jpy: number;
  avg_net_jpy: number;
}

export interface SimulatorParams {
  initial_amount: number;
  monthly_investment: number;
  years: number;
  expected_return: number;
  volatility: number;
  simulations?: number;
}

export interface SimulatorResult {
  years: number;
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  final_values: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  year_labels: number[];
}

export interface ScrapeStatusResponse {
  latest: {
    id: number;
    started_at: string;
    finished_at: string | null;
    status: ScrapeStatus;
    records_saved: number;
    error_message: string | null;
  } | null;
  is_running: boolean;
}

export interface AllocationItem {
  name: string;
  value_jpy: number;
  percentage: number;
  asset_type: AssetType;
}

export interface SectorAllocation {
  allocations: AllocationItem[];
  total_jpy: number;
}
