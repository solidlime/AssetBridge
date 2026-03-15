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
        assetType: z.string().default("all"),
        minValueJpy: z.number().optional(),
        query: z.string().optional(),
      })
    )
    .query(({ input }) => getHoldings(input)),

  assetDetail: proc
    .input(z.object({ symbol: z.string() }))
    .query(({ input }) => getAssetDetail(input.symbol)),
});
