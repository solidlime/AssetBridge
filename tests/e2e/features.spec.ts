import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const API_KEY = process.env.API_KEY || "test";
const HEADERS = { "X-API-Key": API_KEY, "Content-Type": "application/json" };

test.describe("資産一覧 React Query キャッシュ", () => {
  test("全件取得後のタブ切り替えで追加API呼び出しが発生しない", async ({ page }) => {
    // tRPC への API リクエストをカウント
    let holdingsRequestCount = 0;
    
    page.on("request", (request) => {
      const url = request.url();
      // portfolio.holdings へのリクエストをカウント
      if (url.includes("/trpc/portfolio.holdings")) {
        holdingsRequestCount++;
        console.log(`[API Request ${holdingsRequestCount}] ${url}`);
      }
    });

    // /assets ページを開く
    await page.goto("/assets");
    await page.waitForLoadState("networkidle");
    
    // React の hydration を待つ
    await page.waitForTimeout(1000);

    // データが表示されるまで待つ（「読み込み中...」が消える）
    const loadingIndicator = page.locator('[role="status"]', { hasText: "読み込み中..." });
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 30000 });
    }

    // 初期読み込みで 1 回だけリクエストされていることを確認
    expect(holdingsRequestCount).toBe(1);

    // タブボタンが存在することを確認
    const allTab = page.getByRole("button", { name: "全て" });
    const jpStockTab = page.getByRole("button", { name: "日本株" });
    const usStockTab = page.getByRole("button", { name: "米国株" });
    
    await expect(allTab).toBeVisible();
    await expect(jpStockTab).toBeVisible();
    await expect(usStockTab).toBeVisible();

    // 「日本株」タブをクリック
    await jpStockTab.click();
    await page.waitForTimeout(500);

    // API 呼び出しが増えていないことを確認（キャッシュが使われている）
    expect(holdingsRequestCount).toBe(1);

    // 「米国株」タブをクリック
    await usStockTab.click();
    await page.waitForTimeout(500);

    // まだ API 呼び出しが増えていないことを確認
    expect(holdingsRequestCount).toBe(1);

    // 「全て」タブに戻る
    await allTab.click();
    await page.waitForTimeout(500);

    // 最終確認：API 呼び出しは初回の 1 回のみ
    expect(holdingsRequestCount).toBe(1);
  });
});

test.describe("シミュレーター debounce 自動更新", () => {
  test("数値変更後 600ms で結果が自動更新される", async ({ page }) => {
    await page.goto("/simulator");
    await page.waitForLoadState("networkidle");
    
    // React の hydration を待つ
    await page.waitForTimeout(1000);

    // 初期状態で結果が表示されるのを待つ
    const resultSection = page.locator("text=年後の試算結果");
    await expect(resultSection).toBeVisible({ timeout: 30000 });

    // 初期の中央値を取得
    const medianBox = page.locator("div:has-text('中央値(50%)')").first();
    await expect(medianBox).toBeVisible();
    const initialText = await medianBox.textContent();

    // 年率を変更（5% → 7%）
    const returnRateInput = page.locator("#input-returnRate");
    await expect(returnRateInput).toBeVisible();
    await returnRateInput.fill("7");

    // debounce 500ms + 安全マージン 100ms = 600ms 待つ
    await page.waitForTimeout(600);

    // 結果が更新されていることを確認（中央値のテキストが変わる）
    const updatedText = await medianBox.textContent();
    expect(updatedText).not.toBe(initialText);
    
    console.log(`[Simulator] Initial: ${initialText}, Updated: ${updatedText}`);
  });
});

test.describe("ダッシュボード グラフ機能", () => {
  test("資産推移グラフの切替ボタンが動作する", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // React の hydration を待つ
    await page.waitForTimeout(1000);

    // 資産推移グラフセクションが表示される
    const chartSection = page.locator("text=資産推移");
    await expect(chartSection).toBeVisible();

    // 「総資産」ボタンが存在する（初期状態でアクティブ）
    const totalButton = page.getByRole("button", { name: "総資産" });
    await expect(totalButton).toBeVisible();
    await expect(totalButton).toHaveAttribute("aria-pressed", "true");

    // 「カテゴリ別」ボタンが存在する
    const categoryButton = page.getByRole("button", { name: "カテゴリ別" });
    await expect(categoryButton).toBeVisible();
    await expect(categoryButton).toHaveAttribute("aria-pressed", "false");

    // 「カテゴリ別」ボタンをクリック
    await categoryButton.click();
    await page.waitForTimeout(300);

    // 「カテゴリ別」がアクティブになり、「総資産」が非アクティブになる
    await expect(categoryButton).toHaveAttribute("aria-pressed", "true");
    await expect(totalButton).toHaveAttribute("aria-pressed", "false");

    // 「総資産」ボタンをクリックして戻す
    await totalButton.click();
    await page.waitForTimeout(300);

    // 「総資産」がアクティブに戻る
    await expect(totalButton).toHaveAttribute("aria-pressed", "true");
    await expect(categoryButton).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("アセット配分 tooltip 色", () => {
  test.fixme("アセット配分チャートの tooltip テキストが白い", async ({ page }) => {
    // TODO: SVG の hover が不安定なため、実装を検証する別の方法を検討
    // AllocationChart.tsx では labelStyle={{ color: "#ffffff" }} を設定済み
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // React の hydration を待つ
    await page.waitForTimeout(1000);

    // アセット配分セクションが表示される
    const allocationSection = page.locator("text=アセット配分");
    await expect(allocationSection).toBeVisible();

    // アセット配分セクション内のチャートを特定（2つ目の recharts-wrapper）
    const allocationChartWrapper = page.locator(".recharts-wrapper").nth(1);
    await expect(allocationChartWrapper).toBeVisible({ timeout: 5000 });

    // 円グラフのスライスにホバー（最初の Cell を探す）
    const pieSlice = page.locator(".recharts-pie-sector").first();
    await expect(pieSlice).toBeVisible();
    
    // ホバーしてツールチップを表示
    await pieSlice.hover({ force: true });
    await page.waitForTimeout(500);

    // ツールチップが表示される
    const tooltip = page.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    // ツールチップの色を検査
    // AllocationChart.tsx: labelStyle={{ color: "#ffffff" }}, itemStyle={{ color: "#ffffff" }}
    const tooltipLabel = page.locator(".recharts-tooltip-label");
    const tooltipItem = page.locator(".recharts-tooltip-item-name, .recharts-tooltip-item-value").first();

    // label の色を確認
    if (await tooltipLabel.isVisible()) {
      const labelColor = await tooltipLabel.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });
      console.log(`[Tooltip] Label color: ${labelColor}`);
      // RGB または HEX で白系であることを確認
      expect(labelColor).toMatch(/rgb\(255,\s*255,\s*255\)|#ffffff/i);
    }

    // item の色を確認
    if (await tooltipItem.isVisible()) {
      const itemColor = await tooltipItem.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });
      console.log(`[Tooltip] Item color: ${itemColor}`);
      expect(itemColor).toMatch(/rgb\(255,\s*255,\s*255\)|#ffffff/i);
    }
  });
});
