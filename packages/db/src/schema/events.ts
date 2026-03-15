import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const scrapeEvents = sqliteTable("scrape_events", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  scrapedAt: integer("scraped_at", { mode: "timestamp" }).notNull(),
  rawJson:   text("raw_json").notNull(),
  version:   integer("version").notNull().default(1),
});
