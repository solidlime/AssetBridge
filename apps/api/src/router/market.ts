import { router, proc } from "../trpc";
import { z } from "zod";
import { getMarketContext, searchNews } from "../services/market";

export const marketRouter = router({
  context: proc.query(() => getMarketContext()),

  news: proc
    .input(
      z.object({
        query: z.string().optional(),
        symbols: z.array(z.string()).optional(),
        days: z.number().default(7),
      })
    )
    .query(({ input }) => searchNews(input)),
});
