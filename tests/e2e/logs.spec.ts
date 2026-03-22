import { test, expect } from "@playwright/test";

test.describe("/logs ページ（T06）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/logs");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  });

  test("/logs ページが正常に表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("ログ");
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("ソースタブ（スクレイプ/API/MCP/Discord）が全て存在する", async ({ page }) => {
    // 各タブボタンが表示されていること
    await expect(page.getByRole("button", { name: /スクレイプ/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /API/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /MCP/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Discord/ })).toBeVisible({ timeout: 15000 });
  });

  test("「すべて」タブが存在する", async ({ page }) => {
    await expect(page.getByRole("button", { name: /すべて/ })).toBeVisible({ timeout: 15000 });
  });

  test("タブ切り替えができる（スクレイプ → API → MCP → Discord）", async ({ page }) => {
    const scrapeTab = page.getByRole("button", { name: /スクレイプ/ });
    const apiTab = page.getByRole("button", { name: /API/ });
    const mcpTab = page.getByRole("button", { name: /MCP/ });
    const discordTab = page.getByRole("button", { name: /Discord/ });

    await expect(scrapeTab).toBeVisible({ timeout: 10000 });

    // スクレイプタブをクリック
    await scrapeTab.click();
    await page.waitForTimeout(300);
    // ページがクラッシュしていないこと
    await expect(page.locator("text=Application error")).not.toBeVisible();

    // API タブをクリック
    await apiTab.click();
    await page.waitForTimeout(300);
    await expect(page.locator("text=Application error")).not.toBeVisible();

    // MCP タブをクリック
    await mcpTab.click();
    await page.waitForTimeout(300);
    await expect(page.locator("text=Application error")).not.toBeVisible();

    // Discord タブをクリック
    await discordTab.click();
    await page.waitForTimeout(300);
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("ログテーブルが表示される（空でも可）", async ({ page }) => {
    // ログテーブルの table 要素はログがある場合のみ表示される
    // ログが 0 件の場合は「ログがありません」メッセージが表示される
    await page.waitForTimeout(2000); // データ取得待ち

    const table = page.locator("table");
    const emptyMsg = page.locator("text=ログがありません");
    const loadingMsg = page.locator("text=読み込み中");

    // ローディング完了を待つ
    if (await loadingMsg.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(loadingMsg).not.toBeVisible({ timeout: 15000 });
    }

    // テーブルが表示されるか、「ログがありません」が表示されるかどちらか
    const hasTable = await table.isVisible({ timeout: 2000 }).catch(() => false);
    const hasEmptyMsg = await emptyMsg.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasTable || hasEmptyMsg).toBe(true);

    // テーブルがある場合のみヘッダーを検証
    if (hasTable) {
      const thead = page.locator("table thead");
      await expect(thead).toBeVisible();
      await expect(page.locator("table thead th", { hasText: "タイムスタンプ" })).toBeVisible();
      await expect(page.locator("table thead th", { hasText: "メッセージ" })).toBeVisible();
    }
  });

  test("レベルフィルタ（INFO/WARN/ERROR/ALL）が表示される", async ({ page }) => {
    await expect(page.getByRole("button", { name: /ALL/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /INFO/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /WARN/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /ERROR/ })).toBeVisible({ timeout: 10000 });
  });

  test("「すべて」タブに切り替えても正常表示される", async ({ page }) => {
    const allTab = page.getByRole("button", { name: /すべて/ });
    await allTab.click();
    await page.waitForTimeout(1000);
    await expect(page.locator("text=Application error")).not.toBeVisible();
    // テーブルまたは「ログがありません」メッセージが表示されること
    const table = page.locator("table");
    const emptyMsg = page.locator("text=ログがありません");
    const hasTable = await table.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyMsg = await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasEmptyMsg).toBe(true);
  });
});
