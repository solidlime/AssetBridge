import { test, expect } from "@playwright/test";

test.describe("ダッシュボード (/)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  });

  test("ダッシュボードが正常に表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("ダッシュボード");
    await expect(page.locator("text=Application error")).not.toBeVisible();
    await expect(page.getByText("AssetBridge").first()).toBeVisible();
  });

  test("総資産カードが表示されている", async ({ page }) => {
    await expect(page.getByText("総資産").first()).toBeVisible({ timeout: 15000 });
  });

  test("前月比・前年比が表示されている（データなし時は「—」）", async ({ page }) => {
    // 「前月比:」テキストが存在する
    await expect(page.locator("text=前月比:")).toBeVisible({ timeout: 15000 });
    // 「前年比:」テキストが存在する
    await expect(page.locator("text=前年比:")).toBeVisible({ timeout: 15000 });
    // 値部分が「—」またはパーセント値（例: "+1.23%"）で表示されている
    const prevMonthArea = page.locator("text=前月比:").locator("..");
    const text = await prevMonthArea.textContent();
    expect(text).toBeTruthy();
    // 「—」またはパーセント記号(%)を含む
    expect(text).toMatch(/[—%]/);
  });

  test("カテゴリ別内訳が表示されている（T09）", async ({ page }) => {
    // 6カテゴリのうち少なくとも1つ（日本株 or 米国株）が表示される
    const jpStock = page.locator("text=日本株").first();
    const usStock = page.locator("text=米国株").first();
    const eitherVisible = await jpStock.isVisible({ timeout: 10000 }).catch(() => false)
      || await usStock.isVisible({ timeout: 10000 }).catch(() => false);
    expect(eitherVisible).toBe(true);
  });

  test("「月別支出予定」セクションが存在する（T08）", async ({ page }) => {
    // MonthlyExpenseChart を含む「月別支出予定」h2が存在する
    await expect(page.locator("h2", { hasText: "月別支出予定" })).toBeVisible({ timeout: 15000 });
  });

  test("資産推移グラフセクションが表示される", async ({ page }) => {
    await expect(page.locator("text=資産推移")).toBeVisible({ timeout: 15000 });
  });

  test("アセット配分セクションが表示される", async ({ page }) => {
    await expect(page.locator("text=アセット配分")).toBeVisible({ timeout: 15000 });
  });

  test("「総資産」/「カテゴリ別」グラフ切替ボタンが動作する", async ({ page }) => {
    const totalButton = page.getByRole("button", { name: "総資産" });
    const categoryButton = page.getByRole("button", { name: "カテゴリ別" });

    await expect(totalButton).toBeVisible({ timeout: 10000 });
    await expect(categoryButton).toBeVisible({ timeout: 10000 });

    // 「カテゴリ別」に切り替え
    await categoryButton.click();
    await page.waitForTimeout(300);
    await expect(categoryButton).toHaveAttribute("aria-pressed", "true");
    await expect(totalButton).toHaveAttribute("aria-pressed", "false");

    // 「総資産」に戻す
    await totalButton.click();
    await page.waitForTimeout(300);
    await expect(totalButton).toHaveAttribute("aria-pressed", "true");
  });

  test("/income-expense にアクセスすると / にリダイレクトされる（T08）", async ({ page }) => {
    const response = await page.goto("http://localhost:3000/income-expense");
    await page.waitForLoadState("networkidle");
    // リダイレクトされてダッシュボードが表示される
    const finalUrl = page.url();
    // income-expense ページ固有のコンテンツは存在しない
    await expect(page.locator("text=Application error")).not.toBeVisible();
    // ダッシュボードまたはリダイレクト先に遷移していること
    expect(finalUrl).not.toContain("income-expense");
  });
});
