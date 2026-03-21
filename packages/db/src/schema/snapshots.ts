import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { assets } from "./assets";

export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  id:               integer("id").primaryKey({ autoIncrement: true }),
  assetId:          integer("asset_id").notNull().references(() => assets.id),
  date:             text("date").notNull(),
  quantity:         real("quantity").notNull().default(0),
  priceJpy:         real("price_jpy").notNull().default(0),
  valueJpy:         real("value_jpy").notNull().default(0),
  costBasisJpy:     real("cost_basis_jpy").notNull().default(0),
  costPerUnitJpy:   real("cost_per_unit_jpy").notNull().default(0),
  unrealizedPnlJpy:    real("unrealized_pnl_jpy").notNull().default(0),
  unrealizedPnlPct:    real("unrealized_pnl_pct").notNull().default(0),
  dividendFrequency:   text("dividend_frequency"),
  dividendAmount:      real("dividend_amount"),
  dividendRate:        real("dividend_rate"),
  exDividendDate:      text("ex_dividend_date"),
  nextExDividendDate:  text("next_ex_dividend_date"),
  distributionType:    text("distribution_type"),
  lastDividendUpdate:  integer("last_dividend_update"),
  currentPriceJpy:     real("current_price_jpy"),
}, (t) => [
  uniqueIndex("uq_snapshot").on(t.assetId, t.date),
  index("ix_snapshot_date").on(t.date),
]);

export const dailyTotals = sqliteTable("daily_totals", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  date:        text("date").notNull().unique(),
  totalJpy:    real("total_jpy").notNull().default(0),
  stockJpJpy:  real("stock_jp_jpy").notNull().default(0),
  stockUsJpy:  real("stock_us_jpy").notNull().default(0),
  fundJpy:     real("fund_jpy").notNull().default(0),
  cashJpy:     real("cash_jpy").notNull().default(0),
  pensionJpy:  real("pension_jpy").notNull().default(0),
  pointJpy:    real("point_jpy").notNull().default(0),
  prevDiffJpy: real("prev_diff_jpy").notNull().default(0),
  prevDiffPct: real("prev_diff_pct").notNull().default(0),
}, (t) => [index("ix_daily_date").on(t.date)]);
