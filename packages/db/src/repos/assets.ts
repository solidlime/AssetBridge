import { eq, and } from "drizzle-orm";
import type { Db } from "../client";
import { assets, portfolioSnapshots } from "../schema/index";
import type { AssetType } from "@assetbridge/types";

export class AssetsRepo {
  constructor(private db: Db) {}

  upsert(data: {
    symbol: string;
    name: string;
    assetType: AssetType;
    exchange?: string;
    currency?: string;
  }): number {
    // symbol + assetType の複合ユニーク制約に従い、既存行があれば更新
    const existing = this.db.select().from(assets)
      .where(and(eq(assets.symbol, data.symbol), eq(assets.assetType, data.assetType)))
      .get();

    if (existing) {
      this.db.update(assets)
        .set({ name: data.name, exchange: data.exchange, currency: data.currency ?? existing.currency })
        .where(eq(assets.id, existing.id))
        .run();
      return existing.id;
    }

    const result = this.db.insert(assets).values(data).returning({ id: assets.id }).get();
    return result!.id;
  }

  findAll(): (typeof assets.$inferSelect)[] {
    return this.db.select().from(assets).all();
  }

  findBySymbol(symbol: string): (typeof assets.$inferSelect) | undefined {
    return this.db.select().from(assets).where(eq(assets.symbol, symbol)).get();
  }
}
