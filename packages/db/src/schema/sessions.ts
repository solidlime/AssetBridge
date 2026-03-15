import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const crawlerSessions = sqliteTable("crawler_sessions", {
  name:        text("name").primaryKey(),
  cookiesJson: text("cookies_json").notNull(),
  savedAt:     integer("saved_at", { mode: "timestamp" }).notNull(),
});
