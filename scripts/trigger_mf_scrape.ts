/**
 * MF スクレイプの手動トリガー
 * 用途: jobQueue にスクレイプジョブを追加して実行する
 */

import { Database } from 'bun:sqlite';

const db = new Database('data/assetbridge_v2.db');

async function triggerAndMonitor() {
  console.log("[MF Scrape] Triggering scrape job...");

  try {
    // ジョブをキューに追加（INSERT して ID を取得）
    const stmt = db.prepare(
      `INSERT INTO job_queue (type, status, created_at, max_attempts, attempts)
       VALUES (?, ?, ?, ?, ?) RETURNING id`
    );
    const result = stmt.get('scrape', 'pending', new Date().toISOString(), 3, 0);
    const jobId = result?.id;

    if (!jobId) {
      throw new Error("Failed to insert job");
    }

    console.log(`[MF Scrape] Job #${jobId} enqueued`);

    // ジョブの完了まで監視（最大15分）
    const deadline = Date.now() + 15 * 60 * 1000;
    let lastStatus = "pending";

    while (Date.now() < deadline) {
      const query = db.prepare(
        `SELECT id, status, attempts, max_attempts, error, result, started_at, done_at 
         FROM job_queue WHERE id = ?`
      );
      const job = query.get(jobId);

      if (!job) {
        console.log(`[MF Scrape] Job #${jobId} not found`);
        break;
      }

      if (job.status !== lastStatus) {
        console.log(
          `[MF Scrape] Job #${jobId} status: ${job.status} (attempt ${job.attempts}/${job.max_attempts})`
        );
        lastStatus = job.status;
      }

      if (job.status === "done") {
        console.log(`[MF Scrape] ✓ Job completed successfully`);
        if (job.result) {
          try {
            const result = JSON.parse(job.result);
            console.log(`[MF Scrape] Result:`, result);
          } catch {
            console.log(`[MF Scrape] Result (raw):`, job.result);
          }
        }
        db.close();
        return { success: true, jobId };
      }

      if (job.status === "failed") {
        console.error(`[MF Scrape] ✗ Job failed: ${job.error}`);
        db.close();
        return { success: false, jobId, error: job.error };
      }

      if (job.status === "await_2fa") {
        console.log(`[MF Scrape] ⏸ Waiting for 2FA code (check mf_2fa_pending_code in settings)`);
      }

      // 2秒待機してから再確認
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.error(`[MF Scrape] ✗ Timeout: Job did not complete within 15 minutes`);
    db.close();
    return { success: false, jobId, error: "timeout" };
  } catch (e) {
    console.error(`[MF Scrape] ✗ Error:`, e);
    db.close();
    return { success: false, error: String(e) };
  }
}

// 実行
const result = await triggerAndMonitor();
console.log("\n[MF Scrape] Final result:", result);
process.exit(result.success ? 0 : 1);
