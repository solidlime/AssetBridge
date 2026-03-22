import { db } from "@assetbridge/db/client";
import { AppLogsRepo } from "@assetbridge/db/repos/app_logs";

const logsRepo = new AppLogsRepo(db);

export function logMcp(level: "info" | "warn" | "error", message: string, detail?: unknown): void {
  try {
    logsRepo.insertLog("mcp", level, message, detail);
  } catch (e) {
    console.error("[mcp] Failed to log:", e);
  }
}
