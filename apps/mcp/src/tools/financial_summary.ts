import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PortfolioSnapshot, HoldingItem, DividendCalendar } from "@assetbridge/types";
import { trpc } from "../trpc-client";

// ─── ローカル型定義（API サービスから infer） ──────────────────────────────────

interface MonthlyWithdrawalSummary {
  month: string;
  fixedExpenseTotal: number;
  creditCardTotal: number;
  grandTotal: number;
  linkedAssetIds: number[];
}

interface CcBalanceStatusItem {
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
  status: string;
  accountName: string | null;
  accountAssetId: number | null;
  accountBalanceJpy: number | null;
  shortfallJpy: number;
  isInsufficient: boolean;
}

interface CcBalanceStatus {
  status: "ok" | "warning";
  totalWithdrawalJpy: number;
  summary: CcBalanceStatusItem[];
}

// ─── 内部ユーティリティ ───────────────────────────────────────────────────────

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function getNextMonthStr(now: Date): string {
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;
}

// ─── 統合データ収集 ───────────────────────────────────────────────────────────

interface FetchedData {
  snapshot: PortfolioSnapshot | null;
  holdings: HoldingItem[];
  thisMonthSummary: MonthlyWithdrawalSummary | null;
  nextMonthSummary: MonthlyWithdrawalSummary | null;
  ccBalance: CcBalanceStatus | null;
  dividendCalendar: DividendCalendar | null;
}

async function fetchAllData(): Promise<FetchedData> {
  const now = new Date();
  const nextMonth = getNextMonthStr(now);

  const [
    snapshotResult,
    holdingsResult,
    thisMonthResult,
    nextMonthResult,
    ccBalanceResult,
    dividendResult,
  ] = await Promise.allSettled([
    trpc.portfolio.snapshot.query({}),
    trpc.portfolio.holdings.query({ assetType: "all" }),
    trpc.incomeExpense.getMonthlyWithdrawalSummary.query({}),
    trpc.incomeExpense.getMonthlyWithdrawalSummary.query({ month: nextMonth }),
    trpc.incomeExpense.getCcBalanceStatus.query(),
    trpc.dividends.calendar.query(),
  ]);

  return {
    snapshot: snapshotResult.status === "fulfilled" ? snapshotResult.value : null,
    holdings: holdingsResult.status === "fulfilled" ? holdingsResult.value : [],
    thisMonthSummary: thisMonthResult.status === "fulfilled" ? thisMonthResult.value : null,
    nextMonthSummary: nextMonthResult.status === "fulfilled" ? nextMonthResult.value : null,
    ccBalance: ccBalanceResult.status === "fulfilled" ? ccBalanceResult.value : null,
    dividendCalendar: dividendResult.status === "fulfilled" ? dividendResult.value : null,
  };
}

// ─── 統合サマリー構築 ─────────────────────────────────────────────────────────

interface BreakdownItem {
  jpy: number;
  pct: number;
}

interface FinancialSummary {
  generatedAt: string;
  portfolio: {
    totalJpy: number;
    prevDiffJpy: number;
    prevDiffPct: number;
    breakdown: {
      stockJp: BreakdownItem;
      stockUs: BreakdownItem;
      fund: BreakdownItem;
      cash: BreakdownItem;
      pension: BreakdownItem;
      point: BreakdownItem;
    };
    topHoldings: Array<{
      name: string;
      valueJpy: number;
      unrealizedPnlPct: number;
      weightPct: number;
    }>;
    unrealizedPnl: { totalJpy: number; pct: number };
  };
  cashflow: {
    thisMonthWithdrawalJpy: number;
    nextMonthWithdrawalJpy: number;
    upcomingWithdrawals: Array<{
      cardName: string;
      withdrawalDate: string;
      amountJpy: number;
      accountName: string | null;
      isInsufficient: boolean;
    }>;
    shortfalls: Array<{
      cardName: string;
      withdrawalDate: string;
      amountJpy: number;
      accountName: string | null;
      shortfallJpy: number;
    }>;
  };
  dividends: {
    annualEstimateJpy: number;
    yieldPct: number;
    nextPaymentMonth: string | null;
    nextPaymentJpy: number;
  };
  riskMetrics: {
    concentrationWarnings: string[];
    cashReserveMonths: number;
  };
}

function buildFinancialSummary(data: FetchedData): FinancialSummary {
  const { snapshot, holdings, thisMonthSummary, nextMonthSummary, ccBalance, dividendCalendar } = data;

  // ── ポートフォリオ ────────────────────────────────────────────────────────
  const totalJpy = snapshot?.totalJpy ?? 0;
  const prevDiffJpy = snapshot?.prevDiffJpy ?? 0;
  const prevDiffPct = snapshot?.prevDiffPct ?? 0;

  const breakdownRaw = snapshot?.breakdown;
  const allocPct = snapshot?.allocationPct;

  const breakdown = {
    stockJp: { jpy: breakdownRaw?.stockJpJpy ?? 0, pct: allocPct?.stockJpJpy ?? 0 },
    stockUs: { jpy: breakdownRaw?.stockUsJpy ?? 0, pct: allocPct?.stockUsJpy ?? 0 },
    fund:    { jpy: breakdownRaw?.fundJpy ?? 0,    pct: allocPct?.fundJpy ?? 0 },
    cash:    { jpy: breakdownRaw?.cashJpy ?? 0,    pct: allocPct?.cashJpy ?? 0 },
    pension: { jpy: breakdownRaw?.pensionJpy ?? 0, pct: allocPct?.pensionJpy ?? 0 },
    point:   { jpy: breakdownRaw?.pointJpy ?? 0,   pct: allocPct?.pointJpy ?? 0 },
  };

  const topHoldings = holdings.slice(0, 5).map((h) => ({
    name: h.name,
    valueJpy: h.valueJpy,
    unrealizedPnlPct: h.unrealizedPnlPct,
    weightPct: h.portfolioWeightPct,
  }));

  const totalUnrealizedPnlJpy = holdings.reduce((sum, h) => sum + h.unrealizedPnlJpy, 0);
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasisJpy, 0);
  const unrealizedPnlPct = totalCostBasis > 0 ? (totalUnrealizedPnlJpy / totalCostBasis) * 100 : 0;

  // ── キャッシュフロー ──────────────────────────────────────────────────────
  const thisMonthWithdrawalJpy = thisMonthSummary?.grandTotal ?? 0;
  const nextMonthWithdrawalJpy = nextMonthSummary?.grandTotal ?? 0;

  const upcomingWithdrawals = (ccBalance?.summary ?? []).map((s) => ({
    cardName: s.cardName,
    withdrawalDate: s.withdrawalDate,
    amountJpy: s.amountJpy,
    accountName: s.accountName,
    isInsufficient: s.isInsufficient,
  }));

  const shortfalls = (ccBalance?.summary ?? [])
    .filter((s) => s.isInsufficient)
    .map((s) => ({
      cardName: s.cardName,
      withdrawalDate: s.withdrawalDate,
      amountJpy: s.amountJpy,
      accountName: s.accountName,
      shortfallJpy: s.shortfallJpy,
    }));

  // ── 配当 ────────────────────────────────────────────────────────────────
  const annualEstimateJpy = dividendCalendar?.totalAnnualEstJpy ?? 0;
  const yieldPct = dividendCalendar?.portfolioYieldPct ?? 0;
  const monthlyBreakdown: number[] = dividendCalendar?.monthlyBreakdown ?? Array(12).fill(0) as number[];

  const now = new Date();
  const currentMonthIndex = now.getMonth(); // 0-based
  const currentYear = now.getFullYear();
  let nextPaymentMonth: string | null = null;
  let nextPaymentJpy = 0;

  for (let i = 0; i < 12; i++) {
    const monthIdx = (currentMonthIndex + i) % 12;
    const yearOffset = currentMonthIndex + i >= 12 ? 1 : 0;
    if ((monthlyBreakdown[monthIdx] ?? 0) > 0) {
      nextPaymentMonth = `${currentYear + yearOffset}-${String(monthIdx + 1).padStart(2, "0")}`;
      nextPaymentJpy = Math.round(monthlyBreakdown[monthIdx] ?? 0);
      break;
    }
  }

  // ── リスク指標 ───────────────────────────────────────────────────────────
  const concentrationWarnings: string[] = [];

  // 単一銘柄の集中リスク（20%超）
  for (const h of holdings) {
    if (h.portfolioWeightPct > 20) {
      concentrationWarnings.push(
        `${h.name}（${h.symbol}）が総資産の${h.portfolioWeightPct.toFixed(1)}%を占めています`
      );
    }
  }

  // アセットタイプ別集中リスク（20%超）
  const assetTypeLabels: Array<[keyof typeof breakdown, string]> = [
    ["stockJp", "日本株"],
    ["stockUs", "米国株"],
    ["fund", "ファンド"],
    ["cash", "現金"],
    ["pension", "年金"],
    ["point", "ポイント"],
  ];
  for (const [key, label] of assetTypeLabels) {
    if (breakdown[key].pct > 20) {
      concentrationWarnings.push(
        `${label}が総資産の${breakdown[key].pct.toFixed(1)}%を占めています`
      );
    }
  }

  const cashJpy = breakdownRaw?.cashJpy ?? 0;
  const cashReserveMonths = thisMonthWithdrawalJpy > 0 ? cashJpy / thisMonthWithdrawalJpy : Infinity;

  return {
    generatedAt: now.toISOString(),
    portfolio: {
      totalJpy,
      prevDiffJpy,
      prevDiffPct,
      breakdown,
      topHoldings,
      unrealizedPnl: { totalJpy: totalUnrealizedPnlJpy, pct: unrealizedPnlPct },
    },
    cashflow: {
      thisMonthWithdrawalJpy,
      nextMonthWithdrawalJpy,
      upcomingWithdrawals,
      shortfalls,
    },
    dividends: {
      annualEstimateJpy,
      yieldPct,
      nextPaymentMonth,
      nextPaymentJpy,
    },
    riskMetrics: {
      concentrationWarnings,
      cashReserveMonths,
    },
  };
}

// ─── システムプロンプト構築 ───────────────────────────────────────────────────

function buildSystemPrompt(data: FinancialSummary): string {
  const { portfolio, cashflow, dividends, riskMetrics } = data;

  const diffSign = portfolio.prevDiffPct >= 0 ? "+" : "";
  const breakdownStr = [
    `日本株 ${portfolio.breakdown.stockJp.pct.toFixed(1)}%`,
    `米国株 ${portfolio.breakdown.stockUs.pct.toFixed(1)}%`,
    `ファンド ${portfolio.breakdown.fund.pct.toFixed(1)}%`,
    `現金 ${portfolio.breakdown.cash.pct.toFixed(1)}%`,
    `年金 ${portfolio.breakdown.pension.pct.toFixed(1)}%`,
    `ポイント ${portfolio.breakdown.point.pct.toFixed(1)}%`,
  ].join("、");

  const shortfallStr =
    cashflow.shortfalls.length > 0
      ? cashflow.shortfalls.map((s) => `${s.cardName}（不足: ${formatJpy(Math.abs(s.shortfallJpy))}）`).join("、")
      : "なし";

  const concentrationStr =
    riskMetrics.concentrationWarnings.length > 0
      ? riskMetrics.concentrationWarnings.join("、")
      : "なし";

  const cashReserveStr = isFinite(riskMetrics.cashReserveMonths)
    ? `${riskMetrics.cashReserveMonths.toFixed(1)}ヶ月分`
    : "∞（引き落としなし）";

  return [
    "あなたは AssetBridge のアセットマネジメント AI です。",
    `現在の保有資産 ${formatJpy(portfolio.totalJpy)}（前日比 ${diffSign}${portfolio.prevDiffPct.toFixed(1)}%）を管理しています。`,
    `主な保有: ${breakdownStr}`,
    `今月の引き落とし予定: ${formatJpy(cashflow.thisMonthWithdrawalJpy)}`,
    `来月の引き落とし予定: ${formatJpy(cashflow.nextMonthWithdrawalJpy)}`,
    `残高不足のカード: ${shortfallStr}`,
    `年間配当見込み: ${formatJpy(dividends.annualEstimateJpy)}（利回り ${dividends.yieldPct.toFixed(2)}%）`,
    `集中リスク警告: ${concentrationStr}`,
    `キャッシュリザーブ: ${cashReserveStr}`,
  ].join("\n");
}

// ─── ツール登録 ───────────────────────────────────────────────────────────────

export function registerFinancialSummaryTools(server: McpServer): void {
  // ── get_financial_summary ─────────────────────────────────────────────────
  server.tool(
    "get_financial_summary",
    "LLMがアドバイスするのに必要な情報を1回で全て返す統合ツール（ポートフォリオ・キャッシュフロー・配当・リスク指標）",
    {},
    async () => {
      try {
        const data = await fetchAllData();
        const summary = buildFinancialSummary(data);
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    }
  );

  // ── get_investment_advice_context ─────────────────────────────────────────
  server.tool(
    "get_investment_advice_context",
    "LLMへのシステムプロンプトとデータを渡すためのコンテキスト生成ツール（get_financial_summary のデータ＋日本語サマリー）",
    {},
    async () => {
      try {
        const data = await fetchAllData();
        const summary = buildFinancialSummary(data);
        const systemPrompt = buildSystemPrompt(summary);
        const result = { systemPrompt, data: summary };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    }
  );
}
