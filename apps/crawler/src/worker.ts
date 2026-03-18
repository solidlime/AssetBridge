import { db } from "@assetbridge/db/client";
import { jobQueue } from "@assetbridge/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { runScrape } from "./scrapers/mf_sbi_bank";

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function workerLoop(): Promise<void> {
  console.log("[worker] Job queue polling started");

  while (true) {
    // pending かつリトライ上限未達のジョブをトランザクション内でアトミックに取得・ロック
    const job = db.transaction((tx) => {
      const j = tx
        .select()
        .from(jobQueue)
        .where(
          and(
            eq(jobQueue.status, "pending"),
            lt(jobQueue.attempts, jobQueue.maxAttempts)
          )
        )
        .orderBy(jobQueue.id)
        .limit(1)
        .get();

      if (!j) return null;

      tx.update(jobQueue)
        .set({
          status: "running",
          startedAt: new Date(),
          attempts: j.attempts + 1,
        })
        .where(eq(jobQueue.id, j.id))
        .run();

      return j;
    });

    if (!job) {
      await sleep(5_000);
      continue;
    }

    // トランザクション内で +1 済みなので、現在の試行回数は job.attempts + 1
    const currentAttempts = job.attempts + 1;
    console.log(
      `[worker] Processing job #${job.id} type=${job.type} attempt=${currentAttempts}/${job.maxAttempts}`
    );

    try {
      const result = await runScrape(job.id);
      db.update(jobQueue)
        .set({
          status: "done",
          doneAt: new Date(),
          result: JSON.stringify(result),
        })
        .where(eq(jobQueue.id, job.id))
        .run();
      console.log(`[worker] Job #${job.id} done`);
    } catch (e) {
      const errMsg = String(e);
      // リトライ上限に達したら failed、まだ余裕があれば pending に戻す
      const failed = currentAttempts >= job.maxAttempts;
      db.update(jobQueue)
        .set({ status: failed ? "failed" : "pending", error: errMsg })
        .where(eq(jobQueue.id, job.id))
        .run();
      console.error(
        `[worker] Job #${job.id} ${failed ? "failed" : "retrying"}: ${errMsg}`
      );
    }

    await sleep(1_000);
  }
}
