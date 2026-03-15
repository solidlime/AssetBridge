import { router, proc } from "../trpc";
import { getDividendCalendar } from "../services/dividends";

export const dividendsRouter = router({
  calendar: proc.query(() => getDividendCalendar()),
});
