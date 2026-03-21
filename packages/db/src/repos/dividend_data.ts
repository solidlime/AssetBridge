import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { dividendData } from "../schema";
import type { InsertDividendData } from "../schema";

export class DividendDataRepo {
  constructor(private db: Db) {}

  findByTicker(ticker: string): (typeof dividendData.$inferSelect) | undefined {
    return this.db.select().from(dividendData).where(eq(dividendData.ticker, ticker)).get();
  }

  findAll(): (typeof dividendData.$inferSelect)[] {
    return this.db.select().from(dividendData).all();
  }

  upsertByTicker(data: Omit<InsertDividendData, "id">): typeof dividendData.$inferSelect {
    return this.db
      .insert(dividendData)
      .values(data)
      .onConflictDoUpdate({
        target: dividendData.ticker,
        set: {
          months: data.months,
          annualJpy: data.annualJpy,
          isUnknown: data.isUnknown,
          scrapedAt: data.scrapedAt ?? new Date().toISOString(),
        },
      })
      .returning()
      .get()!;
  }
}
