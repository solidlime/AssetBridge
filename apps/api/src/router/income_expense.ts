import { router, proc } from "../trpc";
import { z } from "zod";
import {
  getAllWithdrawals,
  getCcAccountMapping,
  getCcBalanceStatus,
  getUpcomingWithdrawals,
  setCcAccountMapping,
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
});
