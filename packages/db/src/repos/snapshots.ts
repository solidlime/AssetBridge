import { eq, desc } from "drizzle-orm";
import type { Db } from "../client";
import { portfolioSnapshots, dailyTotals, assets } from "../schema/index";

export class SnapshotsRepo {
  constructor(private db: Db) {}

  upsertSnapshot(data: typeof portfolioSnapshots.$inferInsert): void {
    this.db.insert(portfolioSnapshots)
      .values(data)
      .onConflictDoUpdate({
        target: [portfolioSnapshots.assetId, portfolioSnapshots.date],
        set: {
          quantity: data.quantity,
          priceJpy: data.priceJpy,
          valueJpy: data.valueJpy,
          costBasisJpy: data.costBasisJpy,
          costPerUnitJpy: data.costPerUnitJpy,
          unrealizedPnlJpy: data.unrealizedPnlJpy,
          unrealizedPnlPct: data.unrealizedPnlPct,
          dividendFrequency: data.dividendFrequency,
          dividendAmount: data.dividendAmount,
          dividendRate: data.dividendRate,
          exDividendDate: data.exDividendDate,
          nextExDividendDate: data.nextExDividendDate,
          distributionType: data.distributionType,
          lastDividendUpdate: data.lastDividendUpdate,
          currentPriceJpy: data.currentPriceJpy,
        },
      })
      .run();
  }

  getLatestByDate(date: string) {
    return this.db.select()
      .from(portfolioSnapshots)
      .innerJoin(assets, eq(portfolioSnapshots.assetId, assets.id))
      .where(eq(portfolioSnapshots.date, date))
      .all();
  }
}

export class DailyTotalsRepo {
  constructor(private db: Db) {}

  upsert(data: typeof dailyTotals.$inferInsert): void {
    this.db.insert(dailyTotals)
      .values(data)
      .onConflictDoUpdate({
        target: dailyTotals.date,
        set: {
          totalJpy: data.totalJpy,
          stockJpJpy: data.stockJpJpy,
          stockUsJpy: data.stockUsJpy,
          fundJpy: data.fundJpy,
          cashJpy: data.cashJpy,
          pensionJpy: data.pensionJpy,
          pointJpy: data.pointJpy,
          prevDiffJpy: data.prevDiffJpy,
          prevDiffPct: data.prevDiffPct,
        },
      })
      .run();
  }

  getHistory(days: number): (typeof dailyTotals.$inferSelect)[] {
    return this.db.select().from(dailyTotals)
      .orderBy(desc(dailyTotals.date))
      .limit(days)
      .all()
      .reverse();
  }

  getLatest(): (typeof dailyTotals.$inferSelect) | undefined {
    return this.db.select().from(dailyTotals)
      .orderBy(desc(dailyTotals.date))
      .limit(1)
      .get();
  }

  getPrev(): (typeof dailyTotals.$inferSelect) | undefined {
    return this.db.select().from(dailyTotals)
      .orderBy(desc(dailyTotals.date))
      .limit(2)
      .all()[1];
  }
}
