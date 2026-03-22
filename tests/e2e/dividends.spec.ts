import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const API_KEY = process.env.API_KEY || "test";
const HEADERS = { "X-API-Key": API_KEY };

test.describe("/dividends ページ — 配当・分配金", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dividends");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  });

  test("配当ページが正常に表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("配当");
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("月別グラフセクション「月別予想配当額」が存在する", async ({ page }) => {
    await expect(page.locator("h2", { hasText: "月別予想配当額" })).toBeVisible({ timeout: 15000 });
  });

  test("月別グラフに月ラベル（1月〜12月）が表示される", async ({ page }) => {
    await expect(page.locator("h2", { hasText: "月別予想配当額" })).toBeVisible({ timeout: 15000 });
    // 月ラベルが表示されていること（最低でも1月・12月が見える）
    await expect(page.locator("text=1月").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=12月").first()).toBeVisible({ timeout: 10000 });
  });

  test("銘柄別配当予想テーブルが表示される（空でも可）", async ({ page }) => {
    const table = page.locator('[aria-label="銘柄別配当予想テーブル"]');
    await expect(table).toBeVisible({ timeout: 15000 });
    // 行数は 0 以上
    const rows = page.locator('[aria-label="銘柄別配当予想テーブル"] tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("サマリー情報（年間予想配当合計・利回り）が表示される", async ({ page }) => {
    await expect(page.locator("text=年間予想配当合計")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=ポートフォリオ利回り")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("配当 API テスト（T04）", () => {
  test("dividends.calendar が 200 で DividendCalendar オブジェクトを返す", async ({ request }) => {
    const res = await request.get(`${API_BASE}/trpc/dividends.calendar`, {
      headers: HEADERS,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const data = (body as { result?: { data?: unknown } })?.result?.data as Record<string, unknown>;
    expect(data).toBeTruthy();
    // DividendCalendar オブジェクトの必須フィールドを確認
    expect(typeof data.totalAnnualEstJpy).toBe("number");
    expect(typeof data.portfolioYieldPct).toBe("number");
    expect(Array.isArray(data.monthlyBreakdown)).toBe(true);
    expect((data.monthlyBreakdown as unknown[]).length).toBe(12);
    expect(Array.isArray(data.holdings)).toBe(true);
  });

  test("dividends.calendar の monthlyBreakdown は12ヶ月分の数値配列（T04）", async ({ request }) => {
    const res = await request.get(`${API_BASE}/trpc/dividends.calendar`, {
      headers: HEADERS,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const data = (body as { result?: { data?: { monthlyBreakdown?: number[] } } })?.result?.data;
    
    expect(data?.monthlyBreakdown).toBeDefined();
    expect(data?.monthlyBreakdown?.length).toBe(12);
    // 各要素は数値であること
    data?.monthlyBreakdown?.forEach((v) => {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
    });
  });
});
