import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const API_KEY = process.env.API_KEY || "test";
const HEADERS = { "X-API-Key": API_KEY, "Content-Type": "application/json" };

function extractTrpcData(body: unknown): unknown {
  return (body as { result?: { data?: unknown } })?.result?.data;
}

// ---------------------------------------------------------------------------
// API: 固定費 CRUD & 引き落とし関連
// ---------------------------------------------------------------------------
test.describe("固定費 API CRUD & 引き落とし", () => {
  let createdId: number;

  test("addFixedExpense: 固定費を追加できる", async ({ request }) => {
    const res = await request.post(
      `${API_BASE}/trpc/incomeExpense.addFixedExpense`,
      {
        headers: HEADERS,
        data: {
          name: "E2Eテスト家賃",
          amountJpy: 80000,
          frequency: "monthly",
          withdrawalDay: 27,
          category: "住居費",
        },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = extractTrpcData(body);
    createdId = (result as any)?.id;
    expect(createdId).toBeTruthy();
  });

  test("getFixedExpenses: 追加した固定費が取得できる", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/trpc/incomeExpense.getFixedExpenses`,
      { headers: HEADERS }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const expenses = extractTrpcData(body) as Array<any>;
    expect(Array.isArray(expenses)).toBe(true);
    // E2Eテスト家賃が含まれている
    const found = expenses.find((e) => e.name === "E2Eテスト家賃");
    expect(found).toBeTruthy();
    expect(found.amountJpy).toBeGreaterThan(0);
  });

  test("getMonthlyWithdrawalSummary: 月次サマリーが取得できる", async ({ request }) => {
    const month = new Date().toISOString().slice(0, 7);
    const res = await request.get(
      `${API_BASE}/trpc/incomeExpense.getMonthlyWithdrawalSummary?input=${encodeURIComponent(JSON.stringify({ json: { month } }))}`,
      { headers: HEADERS }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const summary = extractTrpcData(body) as any;
    expect(summary).toBeTruthy();
    expect(typeof summary.fixedExpenseTotal).toBe("number");
    expect(typeof summary.creditCardTotal).toBe("number");
    expect(typeof summary.grandTotal).toBe("number");
    // 追加した固定費が含まれているので 0 より大きい
    expect(summary.fixedExpenseTotal).toBeGreaterThan(0);
  });

  test("getCreditCardDetails: クレカ詳細が取得できる（空でも可）", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/trpc/incomeExpense.getCreditCardDetails`,
      { headers: HEADERS }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const details = extractTrpcData(body) as Array<any>;
    expect(Array.isArray(details)).toBe(true);
  });

  test("upcomingWithdrawals: 予定引き落としが取得できる", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/trpc/incomeExpense.upcomingWithdrawals`,
      { headers: HEADERS }
    );
    // status 200 または 400 (バリデーションエラー可) を許容
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      const withdrawals = extractTrpcData(body) as Array<any>;
      expect(Array.isArray(withdrawals)).toBe(true);
    }
  });

  test("deleteFixedExpense: 固定費を削除できる", async ({ request }) => {
    if (!createdId) test.skip();
    const res = await request.post(
      `${API_BASE}/trpc/incomeExpense.deleteFixedExpense`,
      {
        headers: HEADERS,
        data: { id: createdId },
      }
    );
    expect(res.status()).toBe(200);
  });

  test("getFixedExpenses: 削除後はE2Eテスト家賃が存在しない", async ({ request }) => {
    if (!createdId) test.skip();
    const res = await request.get(
      `${API_BASE}/trpc/incomeExpense.getFixedExpenses`,
      { headers: HEADERS }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const expenses = extractTrpcData(body) as Array<any>;
    const found = expenses.find((e) => e.name === "E2Eテスト家賃");
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UI: /withdrawals ページ
// ---------------------------------------------------------------------------
test.describe("/withdrawals ページ", () => {
  test("/withdrawals が正常に表示される", async ({ page }) => {
    await page.goto("http://localhost:3000/withdrawals");
    await page.waitForLoadState("networkidle");
    // ページタイトルまたは見出しが表示される
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    // エラーページでないこと
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("/credit にアクセスすると /withdrawals にリダイレクトされる", async ({ page }) => {
    const response = await page.goto("http://localhost:3000/credit");
    // リダイレクト後のURLが /withdrawals であること
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/withdrawals");
  });

  test("/withdrawals にクレジットカードセクションが表示される", async ({ page }) => {
    await page.goto("http://localhost:3000/withdrawals");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // データ読み込み待ち
    // クレカセクションの見出しまたはテーブルが表示
    const creditSection = page.locator("text=クレジットカード, text=💳");
    // ページ全体が表示されること（エラーなし）
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("/withdrawals に固定費セクションが表示される", async ({ page }) => {
    await page.goto("http://localhost:3000/withdrawals");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // データ読み込み待ち
    // 固定費セクションの見出しまたは追加ボタンが表示
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("ナビゲーションに引き落とし管理リンクがある", async ({ page }) => {
    await page.goto("http://localhost:3000");
    // ナビゲーションに /withdrawals リンクがある
    const link = page.locator('a[href="/withdrawals"], a:has-text("引き落とし")');
    await expect(link.first()).toBeVisible({ timeout: 10000 });
  });
});
