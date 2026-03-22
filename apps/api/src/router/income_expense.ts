import { router, proc } from "../trpc";
import { z } from "zod";
import {
  getAllWithdrawals,
  getCcAccountMapping,
  getCcBalanceStatus,
  getUpcomingWithdrawals,
  setCcAccountMapping,
  getFixedExpenses,
  addFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  getMonthlyWithdrawalSummary,
  getCreditCardDetails,
  getMonthlyCashflow,
  getWithdrawalAccountSummary,
} from "../services/income_expense";

export const incomeExpenseRouter = router({
  upcomingWithdrawals: proc
    .input(z.object({ days: z.number().min(1).max(365).default(60) }))
    .query(({ input }) => getUpcomingWithdrawals(input.days)),

  allWithdrawals: proc
    .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
    .query(({ input }) => getAllWithdrawals(input.limit)),

  getCcAccountMapping: proc.query(() => getCcAccountMapping()),

  setCcAccountMapping: proc
    .input(z.record(z.string(), z.number()))
    .mutation(({ input }) => setCcAccountMapping(input)),

  getCcBalanceStatus: proc.query(() => getCcBalanceStatus()),

  // ── 固定費 CRUD ───────────────────────────────────────────────────────────
  getFixedExpenses: proc.query(() => getFixedExpenses()),

  addFixedExpense: proc
    .input(
      z.object({
        name: z.string(),
        amountJpy: z.number(),
        frequency: z.enum(["monthly", "annual", "quarterly"]),
        withdrawalDay: z.number().int().min(1).max(31).nullable().optional(),
        withdrawalMonth: z.number().int().min(1).max(12).nullable().optional(),
        category: z.string().nullable().optional(),
        assetId: z.number().int().nullable().optional(),
        bankAccount: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => addFixedExpense(input)),

  updateFixedExpense: proc
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().optional(),
        amountJpy: z.number().optional(),
        frequency: z.enum(["monthly", "annual", "quarterly"]).optional(),
        withdrawalDay: z.number().int().min(1).max(31).nullable().optional(),
        withdrawalMonth: z.number().int().min(1).max(12).nullable().optional(),
        category: z.string().nullable().optional(),
        assetId: z.number().int().nullable().optional(),
        bankAccount: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateFixedExpense(id, data);
    }),

  deleteFixedExpense: proc
    .input(z.object({ id: z.number().int() }))
    .mutation(({ input }) => deleteFixedExpense(input.id)),

  // ── 月次引き落としサマリー ────────────────────────────────────────────────
  getMonthlyWithdrawalSummary: proc
    .input(z.object({ month: z.string().optional() }))
    .query(({ input }) => getMonthlyWithdrawalSummary(input.month)),

  // ── クレジットカード詳細 ──────────────────────────────────────────────────
  getCreditCardDetails: proc.query(() => getCreditCardDetails()),

  monthlyCashflow: proc
    .input(z.object({ months: z.number().int().min(1).max(24).default(6) }))
    .query(({ input }) => getMonthlyCashflow(input.months)),

  getWithdrawalAccountSummary: proc.query(() => getWithdrawalAccountSummary()),
});
