import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const appLogs = sqliteTable("app_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  detail: text("detail"),
  createdAt: text("created_at").default(sql`(datetime('now', 'localtime'))`),
});
