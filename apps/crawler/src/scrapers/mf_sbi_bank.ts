import { chromium, type BrowserContext, type Page } from "playwright";
import { db } from "@assetbridge/db/client";
import { AssetsRepo } from "@assetbridge/db/repos/assets";
import { SnapshotsRepo, DailyTotalsRepo } from "@assetbridge/db/repos/snapshots";
import { crawlerSessions, scrapeEvents, appSettings } from "@assetbridge/db/schema";
import { eq } from "drizzle-orm";
import type { AssetType } from "@assetbridge/types";
import { loadEnv } from "../env";

loadEnv();

const BASE_URL = "https://ssnb.x.moneyforward.com";

// MF カテゴリ名 → AssetType マッピング
const CATEGORY_MAP: Record<string, AssetType> = {
  "預金・現金・暗号資産": "CASH",
  "株式（現物）": "STOCK_JP",
  "投資信託": "FUND",
  "年金": "PENSION",
  "ポイント・マイル": "POINT",
};

// 銘柄コードのパターンから AssetType を推定する
function detectAssetType(symbol: string): AssetType {
  if (!symbol) return "CASH";
  if (/^\d{4,5}$/.test(symbol)) return "STOCK_JP";
  if (/^[A-Z]{1,6}$/.test(symbol)) return "STOCK_US";
  if (/[A-Z0-9]{6,}/.test(symbol)) return "FUND";
  return "CASH";
}

// "1,234,567円" や "1234567" → number
function parseAmount(text: string): number {
  const match = text.replace(/,/g, "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

async function saveSession(contextArg: BrowserContext): Promise<void> {
  const cookies = await contextArg.cookies();
  db
    .insert(crawlerSessions)
    .values({
      name: "mf_sbi_bank",
      cookiesJson: JSON.stringify(cookies),
      savedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: crawlerSessions.name,
      set: { cookiesJson: JSON.stringify(cookies), savedAt: new Date() },
    })
    .run();
}

async function loadSession(contextArg: BrowserContext): Promise<boolean> {
  const row = db
    .select()
    .from(crawlerSessions)
    .where(eq(crawlerSessions.name, "mf_sbi_bank"))
    .get();
  if (!row) return false;
  const cookies = JSON.parse(row.cookiesJson) as Parameters<BrowserContext["addCookies"]>[0];
  await contextArg.addCookies(cookies);
  return true;
}

// APIサーバーが mf_2fa_pending_code に書き込んだ 2FA コードを待機・取得する
async function get2faCode(timeoutMs = 300_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "mf_2fa_pending_code"))
      .get();
    if (row?.value) {
      // 読み取り後にクリアして再利用を防ぐ
      db.update(appSettings)
        .set({ value: null })
        .where(eq(appSettings.key, "mf_2fa_pending_code"))
        .run();
      return row.value;
    }
    await new Promise<void>((r) => setTimeout(r, 3_000));
  }
  return null;
}

async function login(page: Page): Promise<void> {
  const email = process.env.MF_EMAIL ?? "";
  const password = process.env.MF_PASSWORD ?? "";

  await page.goto(`${BASE_URL}/users/sign_in`, { waitUntil: "networkidle" });
  await page.fill('input[name="sign_in_session_service[email]"]', email);
  await page.fill('input[name="sign_in_session_service[password]"]', password);
  await page.click('input[type="submit"]');
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/two_step_verifications")) {
    console.log("[crawler] 2FA required. Waiting for code from DB (mf_2fa_pending_code)...");
    const code = await get2faCode();
    if (!code) throw new Error("2FA timeout: no code received within 5 minutes");
    await page.goto(
      `${BASE_URL}/users/two_step_verifications/verify/${code}`,
      { waitUntil: "networkidle" }
    );
  }

  console.log("[crawler] Login successful");
}

// 一括更新ボタンを押してデータを最新化する（ボタンがなければスキップ）
async function triggerBulkUpdate(page: Page): Promise<void> {
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    const refreshBtn = page
      .locator("a.refresh, a[href*='aggregation_queue']")
      .first();
    if (await refreshBtn.isVisible({ timeout: 3_000 })) {
      await refreshBtn.click();
      console.log("[crawler] Bulk update triggered");
      // 更新完了を待機
      await new Promise<void>((r) => setTimeout(r, 10_000));
    }
  } catch {
    console.log("[crawler] No refresh button found, skipping bulk update");
  }
}

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
}

export interface ScrapedData {
  totalJpy: number;
  categories: Partial<Record<AssetType, number>>;
  holdings: ScrapedHolding[];
}

async function scrapePortfolio(page: Page): Promise<ScrapedData> {
  await page.goto(`${BASE_URL}/accounts`, { waitUntil: "networkidle" });

  // 総資産テキストをパース（例: "資産総額：\n38,247,980円"）
  const totalText = await page
    .locator("div.heading-radius-box")
    .innerText()
    .catch(() => "0");
  const totalMatch = totalText.replace(/,/g, "").match(/[\d.]+/);
  const totalJpy = totalMatch ? parseFloat(totalMatch[0]) : 0;

  const categories: Partial<Record<AssetType, number>> = {};
  const holdings: ScrapedHolding[] = [];

  const rows = await page.locator("table tr").all();
  for (const row of rows) {
    const cells = await row.locator("td, th").all();
    const count = cells.length;

    if (count === 2 || count === 3) {
      // カテゴリ行: th=1 + td=2 の構造
      const headerText = await row
        .locator("th")
        .first()
        .locator("a")
        .first()
        .textContent()
        .catch(() => null);
      if (headerText) {
        const catName = headerText.trim();
        const valText = await row
          .locator("td")
          .first()
          .textContent()
          .catch(() => "0");
        const val = parseAmount(valText ?? "0");
        const assetType = CATEGORY_MAP[catName];
        if (assetType) categories[assetType] = val;
      }
    } else if (count >= 13) {
      // 株式保有行: td=13 の構造（td[1]=銘柄名, td[5]=評価額, td[7]=損益）
      const name = ((await cells[1].textContent()) ?? "").trim();
      const valueJpy = parseAmount((await cells[5].textContent()) ?? "0");
      const unrealizedPnlJpy = parseAmount((await cells[7].textContent()) ?? "0");
      if (name && valueJpy > 0) {
        // 括弧内の銘柄コードを抽出。なければ名称の先頭を使う
        const symbolMatch = name.match(/[（(]([A-Z0-9]{1,8})[）)]/);
        const symbol = symbolMatch
          ? symbolMatch[1]
          : name.slice(0, 10).replace(/\s/g, "");
        holdings.push({
          symbol,
          name,
          assetType: detectAssetType(symbol),
          valueJpy,
          unrealizedPnlJpy,
          quantity: 0,
          priceJpy: 0,
          costBasisJpy: 0,
          costPerUnitJpy: 0,
        });
      }
    } else if (count === 5) {
      // 現金・預金行: td=5 の構造（td[0]=名称, td[1]=残高）
      const name = ((await cells[0].textContent()) ?? "").trim();
      const balance = parseAmount((await cells[1].textContent()) ?? "0");
      if (name && balance > 0) {
        holdings.push({
          symbol: "",
          name,
          assetType: "CASH",
          valueJpy: balance,
          unrealizedPnlJpy: 0,
          quantity: balance,
          priceJpy: 1,
          costBasisJpy: balance,
          costPerUnitJpy: 1,
        });
      }
    }
  }

  return { totalJpy, categories, holdings };
}

export async function runScrape(): Promise<ScrapedData> {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });

  try {
    const sessionLoaded = await loadSession(context);
    const page = await context.newPage();

    if (sessionLoaded) {
      // セッションが有効か確認し、期限切れなら再ログイン
      await page.goto(`${BASE_URL}/accounts`, { waitUntil: "networkidle" });
      if (page.url().includes("sign_in")) {
        console.log("[crawler] Session expired, re-login");
        await login(page);
      }
    } else {
      await login(page);
    }

    await saveSession(context);
    await triggerBulkUpdate(page);

    const data = await scrapePortfolio(page);

    // 生データをイベントストアに保存
    db.insert(scrapeEvents)
      .values({ scrapedAt: new Date(), rawJson: JSON.stringify(data) })
      .run();

    const today = new Date().toISOString().split("T")[0];
    const assetsRepo = new AssetsRepo(db);
    const snapshotsRepo = new SnapshotsRepo(db);
    const dailyRepo = new DailyTotalsRepo(db);

    for (const h of data.holdings) {
      const assetId = assetsRepo.upsert({
        symbol: h.symbol || h.name.slice(0, 50),
        name: h.name,
        assetType: h.assetType,
      });
      snapshotsRepo.upsertSnapshot({
        assetId,
        date: today,
        quantity: h.quantity,
        priceJpy: h.priceJpy,
        valueJpy: h.valueJpy,
        costBasisJpy: h.costBasisJpy,
        costPerUnitJpy: h.costPerUnitJpy,
        unrealizedPnlJpy: h.unrealizedPnlJpy,
        unrealizedPnlPct:
          h.costBasisJpy > 0
            ? (h.unrealizedPnlJpy / h.costBasisJpy) * 100
            : 0,
      });
    }

    // 前日合計を参照して差分を計算
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

    console.log(
      `[crawler] Scrape complete: ¥${data.totalJpy.toLocaleString()}`
    );
    return data;
  } finally {
    await context.close();
    await browser.close();
  }
}
