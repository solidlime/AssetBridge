import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../client";
import { appLogs } from "../schema/index";

export type AppLog = typeof appLogs.$inferSelect;

export class AppLogsRepo {
  constructor(private db: Db) {}

  insertLog(source: string, level: string, message: string, detail?: unknown): void {
    this.db.insert(appLogs).values({
      source,
      level,
      message,
      detail: detail !== undefined ? JSON.stringify(detail) : undefined,
    }).run();
  }

  getLogs({ source, level, limit = 50, offset = 0 }: {
    source?: string;
    level?: string;
    limit?: number;
    offset?: number;
  }): { logs: AppLog[]; total: number } {
    const conditions = [];
    if (source) conditions.push(eq(appLogs.source, source));
    if (level) conditions.push(eq(appLogs.level, level));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = this.db.select().from(appLogs)
      .where(where)
      .orderBy(desc(appLogs.id))
      .limit(limit)
      .offset(offset)
      .all();

    const totalResult = this.db.select({ count: count() }).from(appLogs)
      .where(where)
      .get();
    const total = totalResult?.count ?? 0;

    return { logs, total };
  }

  cleanOldLogs(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().replace('T', ' ').slice(0, 19);
    
    const result = this.db.delete(appLogs)
      .where(lt(appLogs.createdAt, cutoffStr))
      .returning({ id: appLogs.id })
      .all();
    return result.length;
  }
}
