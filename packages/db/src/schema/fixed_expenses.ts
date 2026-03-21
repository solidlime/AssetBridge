import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const fixedExpenses = sqliteTable("fixed_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amountJpy: real("amount_jpy").notNull(),
  frequency: text("frequency").$type<"monthly" | "annual" | "quarterly">().notNull().default("monthly"),
  withdrawalDay: integer("withdrawal_day"),
  withdrawalMonth: integer("withdrawal_month"),
  category: text("category"),
  assetId: integer("asset_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export type FixedExpense = typeof fixedExpenses.$inferSelect;
export type InsertFixedExpense = typeof fixedExpenses.$inferInsert;
