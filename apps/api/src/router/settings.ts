import { router, proc } from "../trpc";
import { z } from "zod";
import { sqlite } from "@assetbridge/db/client";
import { SettingsRepo } from "@assetbridge/db/repos/settings";

const settingsRepo = new SettingsRepo(sqlite);

export const settingsRouter = router({
  systemPrompt: proc.query(() => settingsRepo.get("system_prompt") ?? ""),

  setSystemPrompt: proc
    .input(z.object({ prompt: z.string() }))
    .mutation(({ input }) => {
      settingsRepo.set("system_prompt", input.prompt);
    }),

  scrapeSchedule: proc.query(() => settingsRepo.getScrapeSchedule()),

  setScrapeSchedule: proc
    .input(
      z.object({
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
      })
    )
    .mutation(({ input }) => {
      settingsRepo.setScrapeSchedule(input.hour, input.minute);
    }),

  setMf2faCode: proc
    .input(z.object({ code: z.string() }))
    .mutation(({ input }) => {
      settingsRepo.set("mf_2fa_pending_code", input.code);
    }),
});
