import { desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { jobQueue } from "../schema/index";

export class JobQueueRepo {
  constructor(private db: Db) {}

  enqueue(type: string, payload?: object): number {
    const result = this.db.insert(jobQueue)
      .values({ type, payload: payload ? JSON.stringify(payload) : undefined })
      .returning({ id: jobQueue.id })
      .get();
    return result!.id;
  }

  getLatest(): (typeof jobQueue.$inferSelect) | undefined {
    // 全件取得後の .at(-1) は N行分のメモリを無駄にする。DB側で1件に絞る。
    return this.db.select().from(jobQueue)
      .orderBy(desc(jobQueue.id))
      .limit(1)
      .get() ?? undefined;
  }

  updateStatus(id: number, status: string, extra?: { result?: string; error?: string }): void {
    this.db.update(jobQueue)
      .set({
        status,
        ...(status === "done" ? { doneAt: new Date() } : {}),
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(extra ?? {}),
      })
      .where(eq(jobQueue.id, id))
      .run();
  }
}
