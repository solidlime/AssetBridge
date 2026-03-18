import { router } from "../trpc";
import { portfolioRouter } from "./portfolio";
import { analysisRouter } from "./analysis";
import { marketRouter } from "./market";
import { dividendsRouter } from "./dividends";
import { scrapeRouter } from "./scrape";
import { simulatorRouter } from "./simulator";
import { settingsRouter } from "./settings";
import { incomeExpenseRouter } from "./income_expense";

export const appRouter = router({
  portfolio: portfolioRouter,
  analysis: analysisRouter,
  market: marketRouter,
  dividends: dividendsRouter,
  scrape: scrapeRouter,
  simulator: simulatorRouter,
  settings: settingsRouter,
  incomeExpense: incomeExpenseRouter,
});

export type AppRouter = typeof appRouter;
