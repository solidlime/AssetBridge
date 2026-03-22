import { db } from "@assetbridge/db/client";
import { AppLogsRepo } from "@assetbridge/db/repos/app_logs";

const logsRepo = new AppLogsRepo(db);

export function logDiscord(level: "info" | "warn" | "error", message: string, detail?: unknown): void {
  try {
    logsRepo.insertLog("discord", level, message, detail);
  } catch (e) {
    console.error("[discord] Failed to log:", e);
  }
}
