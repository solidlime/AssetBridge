import { db } from "@assetbridge/db/client";
import { dailyTotals } from "@assetbridge/db/schema";
import type { PeriodAnalysis, ScenarioResult, RiskMetrics } from "@assetbridge/types";
import { desc, gte, lte, and } from "drizzle-orm";
import { getSnapshot } from "./portfolio";

export async function analyzePeriod(fromDate: string, toDate: string): Promise<PeriodAnalysis> {
  const rows = db
    .select()
    .from(dailyTotals)
    .where(and(gte(dailyTotals.date, fromDate), lte(dailyTotals.date, toDate)))
    .orderBy(dailyTotals.date)
    .all();

  if (rows.length < 2) {
    return { fromDate, toDate, returnPct: 0, maxDrawdownPct: 0, volatility: 0, sharpeRatio: 0 };
  }

  const first = rows[0].totalJpy;
  const last = rows[rows.length - 1].totalJpy;
  const returnPct = first > 0 ? ((last - first) / first) * 100 : 0;

  // 最大ドローダウン計算
  let peak = rows[0].totalJpy;
  let maxDrawdown = 0;
  for (const row of rows) {
    if (row.totalJpy > peak) peak = row.totalJpy;
    const drawdown = peak > 0 ? ((peak - row.totalJpy) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // 日次リターン配列を構築
  const dailyReturns: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].totalJpy;
    const curr = rows[i].totalJpy;
    if (prev > 0) dailyReturns.push((curr - prev) / prev);
  }

  const n = dailyReturns.length || 1;

  // ボラティリティ（年率換算: 252営業日）
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / n;
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const volatility = Math.sqrt(variance * 252) * 100;

  // シャープレシオ（無リスク金利0%想定）
  const annualizedReturn = (returnPct / 100) * (252 / rows.length);
  const sharpeRatio = volatility > 0 ? annualizedReturn / (volatility / 100) : 0;

  return { fromDate, toDate, returnPct, maxDrawdownPct: maxDrawdown, volatility, sharpeRatio };
}

export async function runScenario(shocks: Record<string, number>): Promise<ScenarioResult> {
  const snapshot = await getSnapshot();
  const breakdown = snapshot.breakdown;

  const assetKeyMap: Record<string, keyof typeof breakdown> = {
    STOCK_JP: "stockJpJpy",
    STOCK_US: "stockUsJpy",
    FUND: "fundJpy",
    CASH: "cashJpy",
    PENSION: "pensionJpy",
    POINT: "pointJpy",
  };

  let stressedTotal = 0;
  const breakdownResult: ScenarioResult["breakdown"] = {};

  for (const [assetKey, valueKey] of Object.entries(assetKeyMap)) {
    const original = breakdown[valueKey];
    const shock = shocks[assetKey] ?? 0;
    const stressed = original * (1 + shock);
    stressedTotal += stressed;
    breakdownResult[assetKey] = { original, stressed, loss: original - stressed };
  }

  const lossJpy = snapshot.totalJpy - stressedTotal;
  const lossPct = snapshot.totalJpy > 0 ? (lossJpy / snapshot.totalJpy) * 100 : 0;

  return {
    currentTotal: snapshot.totalJpy,
    stressedTotal,
    lossJpy,
    lossPct,
    breakdown: breakdownResult,
  };
}

export async function getRiskMetrics(days: number): Promise<RiskMetrics> {
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const toDate = new Date().toISOString().split("T")[0];

  const analysis = await analyzePeriod(fromDate, toDate);

  return {
    volatilityAnnualized: analysis.volatility,
    maxDrawdownPct: analysis.maxDrawdownPct,
    sharpeRatio: analysis.sharpeRatio,
    days,
  };
}
