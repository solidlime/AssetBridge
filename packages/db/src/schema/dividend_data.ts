import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const dividendData = sqliteTable("dividend_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull().unique(),
  months: text("months"),
  annualJpy: real("annual_jpy"),
  perPaymentJpy: real("per_payment_jpy"),
  isUnknown: integer("is_unknown", { mode: "boolean" }).default(false),
  scrapedAt: text("scraped_at").default(sql`(datetime('now'))`),
});

export type DividendData = typeof dividendData.$inferSelect;
export type InsertDividendData = typeof dividendData.$inferInsert;
