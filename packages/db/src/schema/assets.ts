import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { AssetType } from "@assetbridge/types";

export const assets = sqliteTable("assets", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  symbol:    text("symbol", { length: 50 }).notNull(),
  name:      text("name", { length: 200 }).notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  exchange:  text("exchange", { length: 50 }),
  currency:        text("currency", { length: 10 }).notNull().default("JPY"),
  institutionName: text("institution_name", { length: 200 }),
  createdAt:       integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
}, (t) => [uniqueIndex("uq_symbol_type").on(t.symbol, t.assetType)]);
