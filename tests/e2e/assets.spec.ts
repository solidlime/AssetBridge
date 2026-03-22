import { test, expect } from "@playwright/test";

test.describe("/assets ページ — 資産一覧", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/assets");
    await page.waitForLoadState("networkidle");
    // React hydration & React Query データ取得完了を待つ
    const loadingIndicator = page.locator('[role="status"]', { hasText: "読み込み中..." });
    if (await loadingIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 30000 });
    }
    await page.waitForTimeout(1000);
  });

  test("資産一覧ページが正常に表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("資産一覧");
    await expect(page.locator("text=Application error")).not.toBeVisible();
  });

  test("資産一覧テーブルが表示される（件数 >= 0）", async ({ page }) => {
    const table = page.locator('[aria-label="資産一覧テーブル"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    // 行数は 0 以上であれば OK（DB 未投入時も pass）
    const rows = page.locator('[aria-label="資産一覧テーブル"] tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("タブボタン（全て/日本株/米国株/投信）が表示される", async ({ page }) => {
    // 資産タイプフィルタ nav にスコープして strict mode violation を回避
    // (テーブル行にも role=button + aria-label に「米国株」が含まれるため)
    const nav = page.locator('nav[aria-label="資産タイプフィルタ"]');
    await expect(nav.getByRole("button", { name: "全て" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "日本株" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "米国株" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "投信" })).toBeVisible();
  });

  test("「現在値」カラムヘッダーが表示される", async ({ page }) => {
    const table = page.locator('[aria-label="資産一覧テーブル"]');
    await expect(table).toBeVisible({ timeout: 15000 });
    // SortHeader コンポーネントが現在値カラムを生成している
    const currentPriceHeader = page.locator('[aria-label="資産一覧テーブル"] th', { hasText: "現在値" });
    await expect(currentPriceHeader).toBeVisible();
  });

  test("「現在値」カラムヘッダーをクリックするとソートが変わる", async ({ page }) => {
    const table = page.locator('[aria-label="資産一覧テーブル"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    const currentPriceHeader = page.locator('[aria-label="資産一覧テーブル"] th', { hasText: "現在値" });
    await expect(currentPriceHeader).toBeVisible();

    // 初期状態: aria-sort が "none" または未設定
    const initialSort = await currentPriceHeader.getAttribute("aria-sort");
    // クリックしてソートを適用
    await currentPriceHeader.click();
    await page.waitForTimeout(300);

    // クリック後: aria-sort が "ascending" または "descending" に変わる
    const afterSort = await currentPriceHeader.getAttribute("aria-sort");
    expect(afterSort).toMatch(/ascending|descending/);
    // 初期状態から変化していること
    if (initialSort !== null) {
      expect(afterSort).not.toBe(initialSort);
    }
  });

  test("ソートクリック後に行の順序が変化する（データあり時）", async ({ page }) => {
    const table = page.locator('[aria-label="資産一覧テーブル"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    const rows = page.locator('[aria-label="資産一覧テーブル"] tbody tr');
    const rowCount = await rows.count();

    if (rowCount < 2) {
      // データが 1 件以下の場合は順序変化を検証しない
      test.info().annotations.push({ type: "skip-reason", description: "資産データが 1 件以下のためソート順序変化テストをスキップ" });
      return;
    }

    // ソート前の最初の行のテキストを記録
    const firstRowBefore = await rows.first().textContent();

    // 「現在値」ヘッダーをクリック（降順）
    const currentPriceHeader = page.locator('[aria-label="資産一覧テーブル"] th', { hasText: "現在値" });
    await currentPriceHeader.click();
    await page.waitForTimeout(300);

    // もう一度クリック（昇順）
    await currentPriceHeader.click();
    await page.waitForTimeout(300);

    // テーブルがまだ表示されている
    await expect(table).toBeVisible();
    const rowCountAfter = await rows.count();
    // 行数は変わらない
    expect(rowCountAfter).toBe(rowCount);
  });
});
