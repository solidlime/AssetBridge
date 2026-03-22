import { eq, desc, lt } from "drizzle-orm";
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
          currentPriceNative: data.currentPriceNative,
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

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export class DailyTotalsRepo {
  constructor(private db: Db) {}

  upsert(data: typeof dailyTotals.$inferInsert): void {
    const date = data.date;
    const totalJpy = data.totalJpy ?? 0;

    // 前月比 (30日前)
    const prevMonthRow = this.getByDate(subtractDays(date, 30));
    const prevMonthDiffJpy = prevMonthRow != null ? totalJpy - prevMonthRow.totalJpy : null;
    const prevMonthDiffPct =
      prevMonthRow != null && prevMonthRow.totalJpy > 0
        ? ((totalJpy - prevMonthRow.totalJpy) / prevMonthRow.totalJpy) * 100
        : null;

    // 前年比 (365日前)
    const prevYearRow = this.getByDate(subtractDays(date, 365));
    const prevYearDiffJpy = prevYearRow != null ? totalJpy - prevYearRow.totalJpy : null;
    const prevYearDiffPct =
      prevYearRow != null && prevYearRow.totalJpy > 0
        ? ((totalJpy - prevYearRow.totalJpy) / prevYearRow.totalJpy) * 100
        : null;

    // カテゴリ別前日比
    const prevDayRow = this.getBeforeDate(date);

    function catDiff(
      curr: number,
      prev: number | undefined | null,
    ): { jpy: number | null; pct: number | null } {
      if (prevDayRow == null || prev == null) return { jpy: null, pct: null };
      const diffJpy = curr - prev;
      const diffPct = prev > 0 ? (diffJpy / prev) * 100 : null;
      return { jpy: diffJpy, pct: diffPct };
    }

    const stockJpDiff  = catDiff(data.stockJpJpy ?? 0, prevDayRow?.stockJpJpy);
    const stockUsDiff  = catDiff(data.stockUsJpy ?? 0, prevDayRow?.stockUsJpy);
    const fundDiff     = catDiff(data.fundJpy     ?? 0, prevDayRow?.fundJpy);
    const cashDiff     = catDiff(data.cashJpy     ?? 0, prevDayRow?.cashJpy);
    const pensionDiff  = catDiff(data.pensionJpy  ?? 0, prevDayRow?.pensionJpy);
    const pointDiff    = catDiff(data.pointJpy    ?? 0, prevDayRow?.pointJpy);

    this.db.insert(dailyTotals)
      .values({
        ...data,
        prevMonthDiffJpy,
        prevMonthDiffPct,
        prevYearDiffJpy,
        prevYearDiffPct,
        stockJpPrevDiffJpy:  stockJpDiff.jpy,
        stockJpPrevDiffPct:  stockJpDiff.pct,
        stockUsPrevDiffJpy:  stockUsDiff.jpy,
        stockUsPrevDiffPct:  stockUsDiff.pct,
        fundPrevDiffJpy:     fundDiff.jpy,
        fundPrevDiffPct:     fundDiff.pct,
        cashPrevDiffJpy:     cashDiff.jpy,
        cashPrevDiffPct:     cashDiff.pct,
        pensionPrevDiffJpy:  pensionDiff.jpy,
        pensionPrevDiffPct:  pensionDiff.pct,
        pointPrevDiffJpy:    pointDiff.jpy,
        pointPrevDiffPct:    pointDiff.pct,
      })
      .onConflictDoUpdate({
        target: dailyTotals.date,
        set: {
          totalJpy:          data.totalJpy,
          stockJpJpy:        data.stockJpJpy,
          stockUsJpy:        data.stockUsJpy,
          fundJpy:           data.fundJpy,
          cashJpy:           data.cashJpy,
          pensionJpy:        data.pensionJpy,
          pointJpy:          data.pointJpy,
          prevDiffJpy:       data.prevDiffJpy,
          prevDiffPct:       data.prevDiffPct,
          prevMonthDiffJpy,
          prevMonthDiffPct,
          prevYearDiffJpy,
          prevYearDiffPct,
          stockJpPrevDiffJpy:  stockJpDiff.jpy,
          stockJpPrevDiffPct:  stockJpDiff.pct,
          stockUsPrevDiffJpy:  stockUsDiff.jpy,
          stockUsPrevDiffPct:  stockUsDiff.pct,
          fundPrevDiffJpy:     fundDiff.jpy,
          fundPrevDiffPct:     fundDiff.pct,
          cashPrevDiffJpy:     cashDiff.jpy,
          cashPrevDiffPct:     cashDiff.pct,
          pensionPrevDiffJpy:  pensionDiff.jpy,
          pensionPrevDiffPct:  pensionDiff.pct,
          pointPrevDiffJpy:    pointDiff.jpy,
          pointPrevDiffPct:    pointDiff.pct,
        },
      })
      .run();
  }

  getByDate(date: string): (typeof dailyTotals.$inferSelect) | undefined {
    return this.db.select().from(dailyTotals)
      .where(eq(dailyTotals.date, date))
      .get();
  }

  getBeforeDate(date: string): (typeof dailyTotals.$inferSelect) | undefined {
    return this.db.select().from(dailyTotals)
      .where(lt(dailyTotals.date, date))
      .orderBy(desc(dailyTotals.date))
      .limit(1)
      .get();
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
