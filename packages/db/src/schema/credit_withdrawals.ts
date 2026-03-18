import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const creditCardWithdrawals = sqliteTable("credit_card_withdrawals", {
  id:             integer("id").primaryKey({ autoIncrement: true }),
  cardName:       text("card_name").notNull(),
  withdrawalDate: text("withdrawal_date").notNull(),  // YYYY-MM-DD
  amountJpy:      real("amount_jpy").notNull().default(0),
  status:         text("status").notNull().default("scheduled").$type<"scheduled" | "withdrawn">(),
  scrapedAt:      text("scraped_at").notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index("ix_withdrawal_date").on(t.withdrawalDate),
]);
