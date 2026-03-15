import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const appSettings = sqliteTable("app_settings", {
  key:       text("key").primaryKey(),
  value:     text("value"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
