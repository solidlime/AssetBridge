import { trpc } from "@/lib/trpc";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = 'force-dynamic';

type UpcomingWithdrawalsResult = {
  withdrawals: {
    id: number;
    cardName: string;
    withdrawalDate: string;
    amountJpy: number;
    status: "scheduled" | "withdrawn";
    scrapedAt: string;
  }[];
  totalAmountJpy: number;
  count: number;
};

type FixedExpenseItem = {
  id: number;
  name: string;
  amountJpy: number;
  frequency: "monthly" | "annual" | "quarterly";
};

type MonthlyWithdrawalSummary = {
  month: string;
  fixedExpenseTotal: number;
  creditCardTotal: number;
  grandTotal: number;
  linkedAssetIds: number[];
};

type AccountWithdrawalSummaryItem = {
  accountId: number;
  accountName: string;
  institutionName: string | null;
  balanceJpy: number;
  totalWithdrawalJpy: number;
  shortfallJpy: number;
  nextWithdrawalDate: string | null;
};

async function getData() {
  const summaryMonth = new Date().toISOString().slice(0, 7);
  const [snapshot, withdrawals, monthlySummary, fixedExpenses, accountSummary] = await Promise.allSettled([
    trpc.portfolio.snapshot.query({}),
    trpc.incomeExpense.upcomingWithdrawals.query({ days: 60 }),
    trpc.incomeExpense.getMonthlyWithdrawalSummary.query({ month: summaryMonth }),
    trpc.incomeExpense.getFixedExpenses.query(),
    trpc.incomeExpense.getWithdrawalAccountSummary.query(),
  ]);

  return {
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    withdrawals:
      withdrawals.status === "fulfilled"
        ? withdrawals.value
        : { withdrawals: [], totalAmountJpy: 0, count: 0 },
    monthlySummary: monthlySummary.status === "fulfilled" ? monthlySummary.value : null,
    fixedExpenses: fixedExpenses.status === "fulfilled" ? fixedExpenses.value : [],
    accountSummary: accountSummary.status === "fulfilled" ? accountSummary.value : [],
    summaryMonth,
  };
}

const ALLOC_LABEL_MAP: Record<string, string> = {
  stockJpJpy: "日本株",
  stockUsJpy: "米国株",
  fundJpy: "投資信託",
  cashJpy: "現金",
  pensionJpy: "年金",
  pointJpy: "ポイント",
};

export default async function DashboardPage() {
  const {
    snapshot,
    withdrawals,
    monthlySummary,
    fixedExpenses,
    accountSummary,
    summaryMonth,
  } = await getData();

  const diffJpy = (snapshot as { prevDiffJpy?: number } | null)?.prevDiffJpy ?? 0;
  const diffPct = (snapshot as { prevDiffPct?: number } | null)?.prevDiffPct ?? 0;

  const upcomingResult = withdrawals as unknown as UpcomingWithdrawalsResult;
  const monthlySummaryData = monthlySummary as MonthlyWithdrawalSummary | null;
  const fixedExpenseItems = fixedExpenses as FixedExpenseItem[];
  const accountSummaryItems = accountSummary as AccountWithdrawalSummaryItem[];

  const snapshotAny = snapshot as Record<string, unknown> | null;

  const allocations = snapshotAny?.allocationPct
    ? Object.entries(snapshotAny.allocationPct as Record<string, number>)
        .filter(([, pct]) => pct > 0)
        .map(([key, pct]) => ({
          asset_type: ALLOC_LABEL_MAP[key] ?? key,
          name: ALLOC_LABEL_MAP[key] ?? key,
          value_jpy: snapshotAny.breakdown
            ? ((snapshotAny.breakdown as Record<string, number>)[key] ?? 0)
            : 0,
          pct,
          percentage: pct,
        }))
    : [];

  const totalJpy = (snapshotAny?.totalJpy as number) ?? 0;

  return (
    <DashboardClient
      snapshot={snapshotAny as Parameters<typeof DashboardClient>[0]["snapshot"]}
      upcomingResult={upcomingResult}
      monthlySummaryData={monthlySummaryData}
      fixedExpenseItems={fixedExpenseItems}
      accountSummaryItems={accountSummaryItems}
      summaryMonth={summaryMonth}
      allocations={allocations}
      totalJpy={totalJpy}
      diffJpy={diffJpy}
      diffPct={diffPct}
    />
  );
}
