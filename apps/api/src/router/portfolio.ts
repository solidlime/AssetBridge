import { router, proc } from "../trpc";
import { z } from "zod";
import { getSnapshot, getHistory, getHoldings, getAssetDetail } from "../services/portfolio";

export const portfolioRouter = router({
  snapshot: proc
    .input(z.object({ date: z.string().optional() }))
    .query(({ input }) => getSnapshot(input.date)),

  history: proc
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(({ input }) => getHistory(input.days)),

  holdings: proc
    .input(
      z.object({
        assetType: z
          .enum(["all", "stock_jp", "stock_us", "fund", "cash", "pension", "point"])
          .default("all"),
        minValueJpy: z.number().min(0).max(1_000_000_000).optional(),
        query: z.string().optional(),
      })
    )
    .query(({ input }) => getHoldings(input)),

  assetDetail: proc
    .input(
      z.object({
        symbol: z
          .string()
          .min(1)
          .max(20)
          .regex(/^[A-Za-z0-9.\^=\-]+$/),
      })
    )
    .query(({ input }) => getAssetDetail(input.symbol)),
});
