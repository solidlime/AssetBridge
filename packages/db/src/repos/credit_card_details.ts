import type { Db } from "../client";
import { creditCardDetails } from "../schema";
import type { InsertCreditCardDetail } from "../schema";

export class CreditCardDetailRepo {
  constructor(private db: Db) {}

  findAll(): (typeof creditCardDetails.$inferSelect)[] {
    return this.db.select().from(creditCardDetails).all();
  }

  upsertByCardName(data: Omit<InsertCreditCardDetail, "id">): typeof creditCardDetails.$inferSelect {
    return this.db
      .insert(creditCardDetails)
      .values(data)
      .onConflictDoUpdate({
        target: creditCardDetails.cardName,
        set: {
          cardType: data.cardType,
          cardNumberLast4: data.cardNumberLast4,
          totalDebtJpy: data.totalDebtJpy,
          scheduledAmountJpy: data.scheduledAmountJpy,
          scrapedAt: data.scrapedAt ?? new Date().toISOString(),
        },
      })
      .returning()
      .get()!;
  }
}
