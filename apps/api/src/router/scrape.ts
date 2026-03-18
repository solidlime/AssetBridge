import { router, proc } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@assetbridge/db/client";
import { JobQueueRepo } from "@assetbridge/db/repos/job-queue";

const jobQueueRepo = new JobQueueRepo(db);

export const scrapeRouter = router({
  trigger: proc.mutation(() => {
    // pending/running のジョブが既に存在する場合は二重実行を防ぐ
    const latest = jobQueueRepo.getLatest();
    if (latest && (latest.status === "pending" || latest.status === "running")) {
      throw new TRPCError({ code: "CONFLICT", message: "スクレイプジョブが既に実行中です" });
    }
    const jobId = jobQueueRepo.enqueue("scrape");
    return { jobId };
  }),

  logs: proc
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(({ input }) => {
      const jobs = jobQueueRepo.getLogs(input.limit);
      return {
        logs: jobs.map((job) => {
          const mappedStatus: "success" | "pending" | "running" | "failed" | "await_2fa" =
            job.status === "done" ? "success" : (job.status as "pending" | "running" | "failed" | "await_2fa");
          let recordsSaved: number | null = null;
          if (job.result) {
            try {
              const parsed = JSON.parse(job.result) as Record<string, unknown>;
              if (typeof parsed.records_saved === "number") recordsSaved = parsed.records_saved;
            } catch { /* ignore */ }
          }
          return {
            id: job.id,
            started_at: job.startedAt instanceof Date
              ? job.startedAt.toISOString()
              : (job.startedAt ? String(job.startedAt) : null),
            finished_at: job.doneAt instanceof Date
              ? job.doneAt.toISOString()
              : (job.doneAt ? String(job.doneAt) : null),
            status: mappedStatus,
            records_saved: recordsSaved,
            error_message: job.error ?? null,
          };
        }),
        is_running: jobs.some((j) => j.status === "pending" || j.status === "running" || j.status === "await_2fa"),
      };
    }),

  status: proc.query(() => {
    const job = jobQueueRepo.getLatest();
    if (!job) {
      return {
        jobId: null,
        // フロントが期待する "success" | "failed" | "running" | "pending" | null
        status: null as "success" | "failed" | "running" | "pending" | "await_2fa" | null,
        attempts: 0,
        // ISO string に変換（JSON シリアライズ・フロント表示用）
        started_at: null as string | null,
        finished_at: null as string | null,
        records_saved: null as number | null,
        error: null as string | null,
      };
    }

    // DB の "done" → フロントの "success" にマッピング
    const mappedStatus: "success" | "pending" | "running" | "failed" | "await_2fa" =
      job.status === "done" ? "success" : (job.status as "pending" | "running" | "failed" | "await_2fa");

    // result JSON から records_saved をパースする試み
    let recordsSaved: number | null = null;
    if (job.result) {
      try {
        const parsed = JSON.parse(job.result) as Record<string, unknown>;
        if (typeof parsed.records_saved === "number") {
          recordsSaved = parsed.records_saved;
        }
      } catch {
        // パース失敗は無視
      }
    }

    return {
      jobId: job.id,
      status: mappedStatus,
      attempts: job.attempts,
      started_at: job.startedAt instanceof Date
        ? job.startedAt.toISOString()
        : (job.startedAt ? String(job.startedAt) : null),
      finished_at: job.doneAt instanceof Date
        ? job.doneAt.toISOString()
        : (job.doneAt ? String(job.doneAt) : null),
      records_saved: recordsSaved,
      error: job.error,
    };
  }),
});
