import { router, proc } from "../trpc";
import { z } from "zod";
import { db } from "@assetbridge/db/client";
import { AppLogsRepo } from "@assetbridge/db/repos/app_logs";
import { appLogs } from "@assetbridge/db/schema";
import { eq } from "drizzle-orm";

const logsRepo = new AppLogsRepo(db);

export const logsRouter = router({
  getLogs: proc
    .input(z.object({
      source: z.enum(["scrape", "api", "mcp", "discord"]).optional(),
      level: z.enum(["info", "warn", "error"]).optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(({ input }) => {
      return logsRepo.getLogs(input);
    }),

  clearLogs: proc
    .input(z.object({
      source: z.enum(["scrape", "api", "mcp", "discord"]).optional(),
    }))
    .mutation(({ input }) => {
      if (input.source) {
        db.delete(appLogs).where(eq(appLogs.source, input.source)).run();
      } else {
        db.delete(appLogs).run();
      }
      return { success: true };
    }),
});
