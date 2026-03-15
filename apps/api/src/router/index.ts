import { router } from "../trpc";
import { portfolioRouter } from "./portfolio";
import { analysisRouter } from "./analysis";
import { marketRouter } from "./market";
import { dividendsRouter } from "./dividends";
import { scrapeRouter } from "./scrape";
import { simulatorRouter } from "./simulator";
import { settingsRouter } from "./settings";

export const appRouter = router({
  portfolio: portfolioRouter,
  analysis: analysisRouter,
  market: marketRouter,
  dividends: dividendsRouter,
  scrape: scrapeRouter,
  simulator: simulatorRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
