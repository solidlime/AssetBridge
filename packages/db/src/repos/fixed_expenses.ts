import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { fixedExpenses } from "../schema";
import type { InsertFixedExpense } from "../schema";

export class FixedExpenseRepo {
  constructor(private db: Db) {}

  findAll(): (typeof fixedExpenses.$inferSelect)[] {
    return this.db.select().from(fixedExpenses).all();
  }

  findById(id: number): (typeof fixedExpenses.$inferSelect) | undefined {
    return this.db.select().from(fixedExpenses).where(eq(fixedExpenses.id, id)).get();
  }

  create(data: Omit<InsertFixedExpense, "id" | "createdAt" | "updatedAt">): typeof fixedExpenses.$inferSelect {
    return this.db.insert(fixedExpenses).values(data).returning().get()!;
  }

  update(id: number, data: Partial<Omit<InsertFixedExpense, "id" | "createdAt">>): (typeof fixedExpenses.$inferSelect) | undefined {
    return this.db
      .update(fixedExpenses)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(fixedExpenses.id, id))
      .returning()
      .get();
  }

  delete(id: number): (typeof fixedExpenses.$inferSelect) | undefined {
    return this.db.delete(fixedExpenses).where(eq(fixedExpenses.id, id)).returning().get();
  }
}
