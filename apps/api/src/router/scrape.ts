import { router, proc } from "../trpc";
import { db } from "@assetbridge/db/client";
import { JobQueueRepo } from "@assetbridge/db/repos/job-queue";
import type { ScrapeStatus } from "@assetbridge/types";

const jobQueueRepo = new JobQueueRepo(db);

export const scrapeRouter = router({
  trigger: proc.mutation(() => {
    const jobId = jobQueueRepo.enqueue("scrape");
    return { jobId };
  }),

  status: proc.query((): ScrapeStatus => {
    const job = jobQueueRepo.getLatest();
    if (!job) {
      return {
        jobId: null,
        status: null,
        attempts: 0,
        createdAt: null,
        startedAt: null,
        doneAt: null,
        error: null,
      };
    }
    return {
      jobId: job.id,
      // jobQueue.status は "pending" | "running" | "done" | "failed" と一致
      status: job.status as ScrapeStatus["status"],
      attempts: job.attempts,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      doneAt: job.doneAt,
      error: job.error,
    };
  }),
});
