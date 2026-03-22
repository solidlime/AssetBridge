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
import { CreditCardDetailRepo } from "@assetbridge/db/repos/credit_card_details";
import { DividendDataRepo } from "@assetbridge/db/repos/dividend_data";
import { crawlerSessions, scrapeEvents, appSettings, creditCardWithdrawals, jobQueue, assets, portfolioSnapshots } from "@assetbridge/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { AssetType } from "@assetbridge/types";
import path from "path";
import { fileURLToPath } from "url";
import { AppLogsRepo } from "@assetbridge/db/repos/app_logs";

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
  currentPriceJpy?: number | null;
}

export interface ScrapedCreditWithdrawal {
  cardName: string;
  withdrawalDate: string;  // YYYY-MM-DD
  amountJpy: number;
  status: "scheduled" | "withdrawn";
  bankAccount?: string;
}

export interface ScrapedCreditCardDetail {
  cardName: string;
  cardType: string | null;
  cardNumberLast4: string | null;
  totalDebtJpy: number | null;
  scheduledAmountJpy: number | null;
}

export interface ScrapedDividendDataItem {
  ticker: string;
  months: string | null;
  annualJpy: number | null;
  isUnknown: boolean;
}

export interface ScrapedData {
  totalJpy: number;
  categories: Partial<Record<AssetType, number>>;
  holdings: ScrapedHolding[];
  creditCardWithdrawals?: ScrapedCreditWithdrawal[];
  creditCardDetails?: ScrapedCreditCardDetail[];
  dividendData?: ScrapedDividendDataItem[];
}

function inferDividendFrequency(assetType: AssetType): string | null {
  switch (assetType) {
    case "STOCK_JP": return "semi-annual";
    case "STOCK_US": return "quarterly";
    case "FUND":     return "monthly";
    default:         return null;
  }
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
  const logsRepo = new AppLogsRepo(db);
  const startTime = Date.now();

  // DB 優先、なければ env フォールバック
  const email = settingsRepo.get("mf_email") ?? process.env.MF_EMAIL ?? "";
  const password = settingsRepo.get("mf_password") ?? process.env.MF_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error("MF_EMAIL or MF_PASSWORD not set (設定ページで入力してください)");
  }

  const cookiesJson = loadCookiesFromDb();

  try { logsRepo.insertLog("scrape", "info", "スクレイプ開始", { jobId }); } catch { /* ignore */ }

  try {
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

  // 根本修正: POINT の institution_name を事前に name → institution_name で保存しておく。
  // browser-scraper.mjs は CASH テーブルの institution_name を取得できないケースがあるため、
  // 同名 POINT の institution_name を CASH にフォールバックとして使う。
  const pointInstitutionByName = new Map<string, string>();
  for (const h of data.holdings) {
    if (h.assetType === "POINT" && h.institutionName) {
      pointInstitutionByName.set(h.name, h.institutionName);
    }
  }

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

  // CASH の institution_name が未設定の場合、同名 POINT から継承する
  // (MF 画面では同一残高が CASH/POINT 両テーブルに表示されるが、POINT テーブルの方が
  //  金融機関名を確実に取得できるため、CASH のフォールバックとして利用する)
  for (const h of deduplicatedHoldings) {
    if (h.assetType === "CASH" && !h.institutionName) {
      const fallback = pointInstitutionByName.get(h.name);
      if (fallback) {
        h.institutionName = fallback;
        process.stderr.write(`[mf_sbi_bank] CASH "${h.name}": institution_name を POINT から継承 → "${fallback}"\n`);
      }
    }
  }

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

  // CASH 資産の名前→旧 ID マッピングを保存（cc_account_mapping の ID 更新に使用）
  // CASH 全削除→再 INSERT でオートインクリメント ID が変わるため、リマッピングが必要
  const cashNameToOldId = new Map<string, number>();
  for (const a of db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .where(eq(assets.assetType, "CASH"))
    .all()) {
    cashNameToOldId.set(a.name, a.id);
  }

  // CASH/POINT/FUND/PENSION 系の資産は symbol が空文字列（name がキー）なので
  // upsert による差分更新が機能しない。scrape のたびに全削除してから再 insert する。
  // STOCK_JP/STOCK_US は symbol が一意なので upsert のまま（削除しない）。
  const nonStockTypes: AssetType[] = ["CASH", "POINT", "FUND", "PENSION"];
  for (const assetTypeVal of nonStockTypes) {
    const assetsToDelete = db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.assetType, assetTypeVal))
      .all();
    if (assetsToDelete.length > 0) {
      db.delete(portfolioSnapshots)
        .where(inArray(portfolioSnapshots.assetId, assetsToDelete.map((a) => a.id)))
        .run();
    }
    db.delete(assets).where(eq(assets.assetType, assetTypeVal)).run();
  }

  // スクレイプ後の CASH 資産の名前→新 ID マッピング（cc_account_mapping 更新に使用）
  const cashNameToNewId = new Map<string, number>();

  for (const h of deduplicatedHoldings) {
    const assetId = assetsRepo.upsert({
      symbol: h.symbol || h.name.slice(0, 50),
      name: h.name,
      assetType: h.assetType,
      currency: h.assetType === "STOCK_US" ? "USD" : "JPY",
      institutionName: h.institutionName || null,
    });
    // unrealizedPnlPct: costBasisJpy がある場合はコスト基準、なければ valueJpy 基準で計算
    // (MF は取得単価を提供しないケースが多いため valueJpy ベースをフォールバックとして使用)
    const unrealizedPnlPct =
      h.costBasisJpy > 0
        ? (h.unrealizedPnlJpy / h.costBasisJpy) * 100
        : h.valueJpy > 0 && h.unrealizedPnlJpy !== 0
          ? (h.unrealizedPnlJpy / (h.valueJpy - h.unrealizedPnlJpy)) * 100
          : 0;
    // currentPriceJpy: スクレイパーから明示値があればそれを使用。
    // なければ資産タイプ別に計算:
    //   STOCK/FUND → valueJpy / quantity (quantity > 0 のとき)
    //   CASH/PENSION/POINT → quantity=1 なので valueJpy そのもの
    const currentPriceJpy =
      h.currentPriceJpy != null
        ? h.currentPriceJpy
        : (h.assetType === "STOCK_JP" || h.assetType === "STOCK_US" || h.assetType === "FUND")
          ? h.quantity > 0 ? h.valueJpy / h.quantity : null
          : h.valueJpy;
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
      dividendFrequency: h.dividendFrequency ?? inferDividendFrequency(h.assetType),
      dividendAmount: h.dividendAmount ?? null,
      dividendRate: h.dividendRate ?? null,
      exDividendDate: h.exDividendDate ?? null,
      nextExDividendDate: h.nextExDividendDate ?? null,
      distributionType: h.distributionType ?? null,
      lastDividendUpdate: h.lastDividendUpdate ?? null,
      currentPriceJpy,
      currentPriceNative: (h as { currentPriceNative?: number | null }).currentPriceNative ?? null,
    });
    // CASH 資産は再 INSERT で ID が変わるため、新しい ID を記録しておく
    if (h.assetType === "CASH") {
      cashNameToNewId.set(h.name, assetId);
    }
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

  try {
    const counts = {
      CASH: deduplicatedHoldings.filter(a => a.assetType === "CASH").length,
      STOCK_JP: deduplicatedHoldings.filter(a => a.assetType === "STOCK_JP").length,
      STOCK_US: deduplicatedHoldings.filter(a => a.assetType === "STOCK_US").length,
      FUND: deduplicatedHoldings.filter(a => a.assetType === "FUND").length,
      PENSION: deduplicatedHoldings.filter(a => a.assetType === "PENSION").length,
      POINT: deduplicatedHoldings.filter(a => a.assetType === "POINT").length,
    };
    logsRepo.insertLog("scrape", "info",
      `資産取得完了: CASH:${counts.CASH} STOCK_JP:${counts.STOCK_JP} STOCK_US:${counts.STOCK_US} FUND:${counts.FUND} PENSION:${counts.PENSION} POINT:${counts.POINT}`,
      { counts }
    );
  } catch { /* ignore */ }

  // cc_account_mapping の CASH asset ID が変わった場合、設定を自動更新する
  // （CASH 全削除→再 INSERT でオートインクリメント ID が変わるため）
  {
    const idRemap = new Map<number, number>(); // oldId → newId
    for (const [name, newId] of cashNameToNewId.entries()) {
      const oldId = cashNameToOldId.get(name);
      if (oldId !== undefined && oldId !== newId) {
        idRemap.set(oldId, newId);
      }
    }
    if (idRemap.size > 0) {
      const mappingJson = settingsRepo.get("cc_account_mapping");
      if (mappingJson) {
        const mapping = JSON.parse(mappingJson) as Record<string, number>;
        let changed = false;
        for (const [cardName, mappingAssetId] of Object.entries(mapping)) {
          const newId = idRemap.get(mappingAssetId);
          if (newId !== undefined) {
            mapping[cardName] = newId;
            changed = true;
          }
        }
        if (changed) {
          settingsRepo.set("cc_account_mapping", JSON.stringify(mapping));
          process.stderr.write(
            `[mf_sbi_bank] cc_account_mapping: ${idRemap.size} CASH asset ID(s) remapped after scrape\n`
          );
        }
      }
    }
  }

  // クレカ引き落とし情報を DB に保存
  if (data.creditCardWithdrawals && data.creditCardWithdrawals.length > 0) {
    // 既存の bank_account 値を保存（スクレイパーは常に null を返すため、手動設定値を引き継ぐ）
    const existingBankAccounts = new Map<string, string | null>();
    for (const r of db
      .select({ cardName: creditCardWithdrawals.cardName, bankAccount: creditCardWithdrawals.bankAccount })
      .from(creditCardWithdrawals)
      .where(eq(creditCardWithdrawals.status, "scheduled"))
      .all()) {
      existingBankAccounts.set(r.cardName, r.bankAccount);
    }

    // スクレイプのたびに scheduled を全件削除して最新状態に更新
    // （過去日付の重複レコードを防ぐため、日付絞り込みなし）
    db.delete(creditCardWithdrawals)
      .where(eq(creditCardWithdrawals.status, "scheduled"))
      .run();

    const scrapedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    for (const w of data.creditCardWithdrawals) {
      db.insert(creditCardWithdrawals)
        .values({
          cardName: w.cardName,
          withdrawalDate: w.withdrawalDate,
          amountJpy: w.amountJpy,
          status: w.status,
          // スクレイパーが値を提供した場合はそれを使用、そうでない場合は既存値を引き継ぐ
          bankAccount: w.bankAccount?.trim() || existingBankAccounts.get(w.cardName) || null,
          scrapedAt,
        })
        .run();
    }
    console.log(`[crawler] Saved ${data.creditCardWithdrawals.length} credit card withdrawal(s)`);
    try { logsRepo.insertLog("scrape", "info", `クレカ引き落とし: ${data.creditCardWithdrawals.length}件取得`, { count: data.creditCardWithdrawals.length }); } catch { /* ignore */ }
  }

  // クレカ詳細情報を DB に保存
  if (data.creditCardDetails && data.creditCardDetails.length > 0) {
    const creditCardDetailRepo = new CreditCardDetailRepo(db);
    for (const detail of data.creditCardDetails) {
      try {
        creditCardDetailRepo.upsertByCardName({
          cardName: detail.cardName,
          cardType: detail.cardType ?? null,
          cardNumberLast4: detail.cardNumberLast4 ?? null,
          totalDebtJpy: detail.totalDebtJpy ?? null,
          scheduledAmountJpy: detail.scheduledAmountJpy ?? null,
          scrapedAt: new Date().toISOString(),
        });
      } catch (err) {
        process.stderr.write(`[mf_sbi_bank] credit_card_details upsert failed for ${detail.cardName}: ${err}\n`);
      }
    }
    console.log(`[crawler] credit_card_details: ${data.creditCardDetails.length} cards saved`);
  }

  // 配当データを DB に保存
  if (data.dividendData && data.dividendData.length > 0) {
    const dividendDataRepo = new DividendDataRepo(db);
    for (const d of data.dividendData) {
      try {
        dividendDataRepo.upsertByTicker({
          ticker: d.ticker,
          months: d.months ?? null,
          annualJpy: d.annualJpy ?? null,
          isUnknown: d.isUnknown,
          scrapedAt: new Date().toISOString(),
        });
      } catch (err) {
        process.stderr.write(`[mf_sbi_bank] dividend_data upsert failed for ${d.ticker}: ${err}\n`);
      }
    }
    console.log(`[crawler] dividend_data: ${data.dividendData.length} tickers saved`);
  }

  console.log(
    `[crawler] Scrape complete: ¥${data.totalJpy.toLocaleString()}`
  );
  try {
    logsRepo.insertLog("scrape", "info", "スクレイプ完了", { durationMs: Date.now() - startTime });
  } catch { /* ignore */ }
  return data;
  } catch (e) {
    try { logsRepo.insertLog("scrape", "error", `スクレイプエラー: ${(e as Error).message}`, { stack: (e as Error).stack }); } catch { /* ignore */ }
    throw e;
  }
}
