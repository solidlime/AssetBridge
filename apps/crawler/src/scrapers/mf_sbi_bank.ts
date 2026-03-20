/**
 * mf_sbi_bank.ts — Bun ランタイムで動作するスクレイプ調整レイヤー
 *
 * Playwright は Bun の pipe サポートと非互換のため、ブラウザ操作は
 * Node.js サブプロセス (browser-scraper.mjs) に委譲する。
 * このファイルは bun:sqlite を使った DB 操作のみ担当する。
 */

import { db, sqlite } from "@assetbridge/db/client";
import { AssetsRepo } from "@assetbridge/db/repos/assets";
import { SnapshotsRepo, DailyTotalsRepo } from "@assetbridge/db/repos/snapshots";
import { SettingsRepo } from "@assetbridge/db/repos/settings";
import { crawlerSessions, scrapeEvents, appSettings, creditCardWithdrawals, jobQueue } from "@assetbridge/db/schema";
import { eq, and, gte } from "drizzle-orm";
import type { AssetType } from "@assetbridge/types";
import path from "path";
import { fileURLToPath } from "url";

const settingsRepo = new SettingsRepo(sqlite);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScrapedHolding {
  symbol: string;
  name: string;
  assetType: AssetType;
  valueJpy: number;
  unrealizedPnlJpy: number;
  quantity: number;
  priceJpy: number;
  costBasisJpy: number;
  costPerUnitJpy: number;
  institutionName?: string | null;
  dividendFrequency?: string | null;
  dividendAmount?: number | null;
  dividendRate?: number | null;
  exDividendDate?: string | null;
  nextExDividendDate?: string | null;
  distributionType?: string | null;
  lastDividendUpdate?: number | null;
}

export interface ScrapedCreditWithdrawal {
  cardName: string;
  withdrawalDate: string;  // YYYY-MM-DD
  amountJpy: number;
  status: "scheduled" | "withdrawn";
  bankAccount?: string;
}

export interface ScrapedData {
  totalJpy: number;
  categories: Partial<Record<AssetType, number>>;
  holdings: ScrapedHolding[];
  creditCardWithdrawals?: ScrapedCreditWithdrawal[];
}

function loadCookiesFromDb(): string | undefined {
  const row = db
    .select()
    .from(crawlerSessions)
    .where(eq(crawlerSessions.name, "mf_sbi_bank"))
    .get();
  return row?.cookiesJson ?? undefined;
}

function saveCookiesToDb(cookiesJson: string): void {
  db
    .insert(crawlerSessions)
    .values({ name: "mf_sbi_bank", cookiesJson, savedAt: new Date() })
    .onConflictDoUpdate({
      target: crawlerSessions.name,
      set: { cookiesJson, savedAt: new Date() },
    })
    .run();
}

/** DB から 2FA コードをポーリングして返す（最大 5分） */
async function poll2faCodeFromDb(jobId?: number, timeoutMs = 300_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "mf_2fa_pending_code"))
      .get();
    if (row?.value) {
      db.update(appSettings)
        .set({ value: null })
        .where(eq(appSettings.key, "mf_2fa_pending_code"))
        .run();
      if (jobId !== undefined) {
        db.update(jobQueue).set({ status: "running" }).where(eq(jobQueue.id, jobId)).run();
      }
      return row.value;
    }
    await new Promise<void>((r) => setTimeout(r, 10_000));
  }
  return null;
}

/** Node.js サブプロセスとの通信ループ */
async function runBrowserProcess(
  email: string,
  password: string,
  cookiesJson: string | undefined,
  jobId?: number
): Promise<{ data: ScrapedData; cookies: unknown[] }> {
  const scraperPath = path.join(__dirname, "browser-scraper.mjs");
  process.stderr.write(`[mf_sbi_bank] __dirname=${__dirname}\n`);
  process.stderr.write(`[mf_sbi_bank] scraperPath=${scraperPath}\n`);

  const proc = Bun.spawn({
    cmd: ["node", scraperPath],
    stdout: "pipe",
    stdin: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      MF_EMAIL: email,
      MF_PASSWORD: password,
      ...(cookiesJson ? { MF_COOKIES_JSON: cookiesJson } : {}),
    },
  });

  // stderr をリアルタイムでパイプスルー
  (async () => {
    const reader = proc.stderr.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stderr.write(dec.decode(value));
    }
  })();

  // stdout を行ごとに読み取る
  const reader = proc.stdout.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === "REQUIRES_2FA") {
        console.log("[crawler] 2FA required, polling DB for code...");
        if (jobId !== undefined) {
          db.update(jobQueue).set({ status: "await_2fa" }).where(eq(jobQueue.id, jobId)).run();
        }
        const code = await poll2faCodeFromDb(jobId);
        if (!code) throw new Error("2FA timeout: no code received within 5 minutes");
        const stdin = proc.stdin;
        const encoder = new TextEncoder();
        stdin.write(encoder.encode(`CODE:${code}\n`));
      } else if (trimmed.startsWith("DONE:")) {
        const json = trimmed.slice(5);
        proc.stdin.end();
        await proc.exited;
        return JSON.parse(json) as { data: ScrapedData; cookies: unknown[] };
      } else if (trimmed.startsWith("ERROR:")) {
        proc.stdin.end();
        await proc.exited;
        throw new Error(trimmed.slice(6));
      }
    }
  }

  proc.stdin.end();
  await proc.exited;
  throw new Error("Browser process exited without sending DONE or ERROR");
}

export async function runScrape(jobId?: number): Promise<ScrapedData> {
  // DB 優先、なければ env フォールバック
  const email = settingsRepo.get("mf_email") ?? process.env.MF_EMAIL ?? "";
  const password = settingsRepo.get("mf_password") ?? process.env.MF_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error("MF_EMAIL or MF_PASSWORD not set (設定ページで入力してください)");
  }

  const cookiesJson = loadCookiesFromDb();

  const { data, cookies } = await runBrowserProcess(email, password, cookiesJson, jobId);

  // セッション Cookie を DB へ保存
  saveCookiesToDb(JSON.stringify(cookies));

  // スクレイプイベントを DB へ記録
  db.insert(scrapeEvents)
    .values({ scrapedAt: new Date(), rawJson: JSON.stringify(data) })
    .run();

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const assetsRepo = new AssetsRepo(db);
  const snapshotsRepo = new SnapshotsRepo(db);
  const dailyRepo = new DailyTotalsRepo(db);

  // 重複排除: 同じ名前で複数のエントリがある場合、証券コード(STOCK_JP/STOCK_US/FUND)を優先して
  // 銘柄名ベースのCASHエントリを除外する
  const holdingsByName = new Map<string, ScrapedHolding>();
  for (const h of data.holdings) {
    const existing = holdingsByName.get(h.name);
    if (!existing) {
      holdingsByName.set(h.name, h);
    } else {
      // 既存が CASH で新しいのが非 CASH → 非 CASH を優先
      if (existing.assetType === "CASH" && h.assetType !== "CASH") {
        holdingsByName.set(h.name, h);
      }
      // 既存が非 CASH で新しいのが CASH → 既存を維持（何もしない）
      // 両方非 CASH → valueJpy が大きい方を優先（同銘柄の重複）
      else if (existing.assetType !== "CASH" && h.assetType !== "CASH") {
        if (h.valueJpy > existing.valueJpy) {
          holdingsByName.set(h.name, h);
        }
      }
    }
  }
  const deduplicatedHoldings = Array.from(holdingsByName.values());

  // categories["STOCK_US"] が MF の UI 構造上取得できないため、holdings から補完
  // (MF は全株式を "株式（現物）" = STOCK_JP としてまとめて表示するため STOCK_US は 0 になる)
  data.categories["STOCK_US"] = deduplicatedHoldings
    .filter((h) => h.assetType === "STOCK_US")
    .reduce((sum, h) => sum + h.valueJpy, 0);
  // STOCK_JP は MF categories から取得した合計を使用（US株込みの全株式合計）
  // ただし STOCK_US 分を差し引いて純粋な日本株合計にする
  if (data.categories["STOCK_JP"] && data.categories["STOCK_JP"] > 0) {
    data.categories["STOCK_JP"] = data.categories["STOCK_JP"] - data.categories["STOCK_US"];
  }

  // PENSION/POINT の合計額をダミーレコードとして追加
  if (data.categories.PENSION && data.categories.PENSION > 0) {
    deduplicatedHoldings.push({
      symbol: "",
      name: "年金（合計）",
      assetType: "PENSION" as AssetType,
      valueJpy: data.categories.PENSION,
      quantity: 1,
      priceJpy: data.categories.PENSION,
      costBasisJpy: data.categories.PENSION,
      costPerUnitJpy: data.categories.PENSION,
      unrealizedPnlJpy: 0,
      institutionName: "確定拠出年金・iDeCo",
      dividendFrequency: null,
      dividendAmount: null,
      dividendRate: null,
      exDividendDate: null,
      nextExDividendDate: null,
      distributionType: null,
      lastDividendUpdate: null,
    });
  }

  if (data.categories.POINT && data.categories.POINT > 0) {
    deduplicatedHoldings.push({
      symbol: "",
      name: "ポイント・マイル（合計）",
      assetType: "POINT" as AssetType,
      valueJpy: data.categories.POINT,
      quantity: data.categories.POINT,
      priceJpy: 1,
      costBasisJpy: data.categories.POINT,
      costPerUnitJpy: 1,
      unrealizedPnlJpy: 0,
      institutionName: "ポイント・マイル",
      dividendFrequency: null,
      dividendAmount: null,
      dividendRate: null,
      exDividendDate: null,
      nextExDividendDate: null,
      distributionType: null,
      lastDividendUpdate: null,
    });
  }

  for (const h of deduplicatedHoldings) {
    const assetId = assetsRepo.upsert({
      symbol: h.symbol || h.name.slice(0, 50),
      name: h.name,
      assetType: h.assetType,
      currency: h.assetType === "STOCK_US" ? "USD" : "JPY",
      institutionName: h.institutionName ?? null,
    });
    // unrealizedPnlPct: costBasisJpy がある場合はコスト基準、なければ valueJpy 基準で計算
    // (MF は取得単価を提供しないケースが多いため valueJpy ベースをフォールバックとして使用)
    const unrealizedPnlPct =
      h.costBasisJpy > 0
        ? (h.unrealizedPnlJpy / h.costBasisJpy) * 100
        : h.valueJpy > 0 && h.unrealizedPnlJpy !== 0
          ? (h.unrealizedPnlJpy / (h.valueJpy - h.unrealizedPnlJpy)) * 100
          : 0;
    snapshotsRepo.upsertSnapshot({
      assetId,
      date: today,
      quantity: h.quantity,
      priceJpy: h.priceJpy,
      valueJpy: h.valueJpy,
      costBasisJpy: h.costBasisJpy,
      costPerUnitJpy: h.costPerUnitJpy,
      unrealizedPnlJpy: h.unrealizedPnlJpy,
      unrealizedPnlPct,
      dividendFrequency: h.dividendFrequency ?? null,
      dividendAmount: h.dividendAmount ?? null,
      dividendRate: h.dividendRate ?? null,
      exDividendDate: h.exDividendDate ?? null,
      nextExDividendDate: h.nextExDividendDate ?? null,
      distributionType: h.distributionType ?? null,
      lastDividendUpdate: h.lastDividendUpdate ?? null,
    });
  }

  const prevDay = dailyRepo.getLatest();
  const prevTotal = prevDay?.totalJpy ?? 0;
  dailyRepo.upsert({
    date: today,
    totalJpy: data.totalJpy,
    stockJpJpy: data.categories["STOCK_JP"] ?? 0,
    stockUsJpy: data.categories["STOCK_US"] ?? 0,
    fundJpy: data.categories["FUND"] ?? 0,
    cashJpy: data.categories["CASH"] ?? 0,
    pensionJpy: data.categories["PENSION"] ?? 0,
    pointJpy: data.categories["POINT"] ?? 0,
    prevDiffJpy: data.totalJpy - prevTotal,
    prevDiffPct:
      prevTotal > 0
        ? ((data.totalJpy - prevTotal) / prevTotal) * 100
        : 0,
  });

  // クレカ引き落とし情報を DB に保存
  if (data.creditCardWithdrawals && data.creditCardWithdrawals.length > 0) {
    // 将来の scheduled データをリセット（スクレイプのたびに最新状態に更新）
    db.delete(creditCardWithdrawals)
      .where(
        and(
          gte(creditCardWithdrawals.withdrawalDate, today),
          eq(creditCardWithdrawals.status, "scheduled")
        )
      )
      .run();

    const scrapedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    for (const w of data.creditCardWithdrawals) {
      db.insert(creditCardWithdrawals)
        .values({
          cardName: w.cardName,
          withdrawalDate: w.withdrawalDate,
          amountJpy: w.amountJpy,
          status: w.status,
          bankAccount: (w.bankAccount?.trim() || null),
          scrapedAt,
        })
        .run();
    }
    console.log(`[crawler] Saved ${data.creditCardWithdrawals.length} credit card withdrawal(s)`);
  }

  console.log(
    `[crawler] Scrape complete: ¥${data.totalJpy.toLocaleString()}`
  );
  return data;
}
