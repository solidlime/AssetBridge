import { router, proc } from "../trpc";
import { z } from "zod";
import { sqlite } from "@assetbridge/db/client";
import { SettingsRepo, SECRET_SETTING_KEYS } from "@assetbridge/db/repos/settings";

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

  // 全設定取得（機密マスク済み）
  getAllSettings: proc.query(() => settingsRepo.getAllSettings()),

  // Discord チャンネルID設定
  setDiscordChannelId: proc
    .input(z.object({ channelId: z.string().max(30) }))
    .mutation(({ input }) => {
      settingsRepo.set("discord_channel_id", input.channelId);
    }),

  // APIキー（シークレット）設定 — 空文字列で削除、非空で保存
  setSecret: proc
    .input(
      z.object({
        key: z.enum(SECRET_SETTING_KEYS),
        value: z.string().max(500),
      })
    )
    .mutation(({ input }) => {
      if (input.value === "") {
        settingsRepo.set(input.key, "");
      } else {
        settingsRepo.setSecret(input.key, input.value);
      }
    }),

  // DATABASE_URL設定（再起動後に有効）
  setDatabaseUrl: proc
    .input(z.object({ url: z.string().max(500) }))
    .mutation(({ input }) => {
      settingsRepo.set("database_url", input.url);
    }),
});
