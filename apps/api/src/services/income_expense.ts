import { db } from "@assetbridge/db/client";
import { creditCardWithdrawals } from "@assetbridge/db/schema";
import { eq, desc } from "drizzle-orm";

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

export async function getUpcomingWithdrawals(_days: number): Promise<UpcomingWithdrawalsResult> {
  // status='scheduled' のものは引き落とし日に関わらず全件返す（過去分も確認できるように）
  const rows = db
    .select()
    .from(creditCardWithdrawals)
    .where(eq(creditCardWithdrawals.status, "scheduled"))
    .orderBy(creditCardWithdrawals.withdrawalDate)
    .all();

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
