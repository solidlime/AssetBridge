import { router, proc } from "../trpc";
import { z } from "zod";
import { analyzePeriod, runScenario, getRiskMetrics } from "../services/analysis";

export const analysisRouter = router({
  period: proc
    .input(
      z.object({
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で入力してください"),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で入力してください"),
      })
    )
    .query(({ input }) => analyzePeriod(input.fromDate, input.toDate)),

  scenario: proc
    .input(z.object({ shocks: z.record(z.number()) }))
    .mutation(({ input }) => runScenario(input.shocks)),

  risk: proc
    .input(z.object({ days: z.number().min(1).max(365).default(90) }))
    .query(({ input }) => getRiskMetrics(input.days)),
});
