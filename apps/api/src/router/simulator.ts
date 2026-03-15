import { router, proc } from "../trpc";
import { z } from "zod";
import { runMonteCarlo } from "../services/simulator";

export const simulatorRouter = router({
  run: proc
    .input(
      z.object({
        initial: z.number().positive(),
        monthly: z.number().min(0),
        years: z.number().min(1).max(50),
        returnRate: z.number().min(-1).max(1),
        volatility: z.number().min(0).max(1),
        simulations: z.number().min(100).max(10000).default(1000),
      })
    )
    .mutation(({ input }) => runMonteCarlo(input)),
});
