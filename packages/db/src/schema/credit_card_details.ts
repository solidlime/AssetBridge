import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const creditCardDetails = sqliteTable("credit_card_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardName: text("card_name").notNull().unique(),
  cardType: text("card_type"),
  cardNumberLast4: text("card_number_last4"),
  totalDebtJpy: real("total_debt_jpy"),
  scheduledAmountJpy: real("scheduled_amount_jpy"),
  scrapedAt: text("scraped_at").default(sql`(datetime('now'))`),
});

export type CreditCardDetail = typeof creditCardDetails.$inferSelect;
export type InsertCreditCardDetail = typeof creditCardDetails.$inferInsert;
