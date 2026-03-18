import { db } from "@assetbridge/db/client";
import { creditCardWithdrawals } from "@assetbridge/db/schema";
import { gte, lte, desc } from "drizzle-orm";

export interface CreditWithdrawal {
  id: number;
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
  status: "scheduled" | "withdrawn";
  scrapedAt: string;
}

export interface UpcomingWithdrawalsResult {
  withdrawals: CreditWithdrawal[];
  totalAmountJpy: number;
  count: number;
}

export async function getUpcomingWithdrawals(days: number): Promise<UpcomingWithdrawalsResult> {
  const today = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + days * 86400_000).toISOString().split("T")[0];

  const rows = db
    .select()
    .from(creditCardWithdrawals)
    .where(
      gte(creditCardWithdrawals.withdrawalDate, today)
    )
    .orderBy(creditCardWithdrawals.withdrawalDate)
    .all()
    .filter((r) => r.withdrawalDate <= future);

  const withdrawals: CreditWithdrawal[] = rows.map((r) => ({
    id: r.id,
    cardName: r.cardName,
    withdrawalDate: r.withdrawalDate,
    amountJpy: r.amountJpy,
    status: r.status as "scheduled" | "withdrawn",
    scrapedAt: r.scrapedAt,
  }));

  const totalAmountJpy = withdrawals.reduce((sum, w) => sum + w.amountJpy, 0);

  return {
    withdrawals,
    totalAmountJpy,
    count: withdrawals.length,
  };
}

export async function getAllWithdrawals(limit: number): Promise<CreditWithdrawal[]> {
  const rows = db
    .select()
    .from(creditCardWithdrawals)
    .orderBy(desc(creditCardWithdrawals.withdrawalDate))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    cardName: r.cardName,
    withdrawalDate: r.withdrawalDate,
    amountJpy: r.amountJpy,
    status: r.status as "scheduled" | "withdrawn",
    scrapedAt: r.scrapedAt,
  }));
}
