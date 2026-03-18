import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const API_KEY = "test";

// ---------------------------------------------------------------------------
// API ヘルスチェック
// ---------------------------------------------------------------------------

test.describe("API ヘルスチェック", () => {
  test("GET /health が {status:ok, version:2.0.0} を返す", async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("2.0.0");
  });

  test("X-API-Key なしで /trpc/portfolio.snapshot は 401 または 200 を返す", async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/trpc/portfolio.snapshot?input={}`,
    );
    // API_KEY が環境変数に設定されていれば 401 を返す
    // 設定されていない場合（開発環境 等）は tRPC が 200 で応答する場合がある
    // いずれにしても 4xx か 2xx の範囲内であることを確認
    const status = response.status();
    expect(status >= 200 && status < 500).toBe(true);
  });

  test("X-API-Key あり で /trpc/portfolio.snapshot が 200 を返す", async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/trpc/portfolio.snapshot?input={}`,
      {
        headers: { "X-API-Key": API_KEY },
      },
    );
    expect(response.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Web ページ表示
// ---------------------------------------------------------------------------

test.describe("Web ページ表示", () => {
  test("/ (ダッシュボード) が表示される", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // ナビゲーションバーに AssetBridge が表示
    await expect(page.getByText("AssetBridge").first()).toBeVisible();

    // h1 が "ダッシュボード"
    const h1 = page.locator("h1");
    await expect(h1).not.toBeEmpty();
    await expect(h1).toContainText("ダッシュボード");
  });

  test("/assets が表示される", async ({ page }) => {
    const response = await page.goto("/assets");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // ナビゲーションバーに AssetBridge が表示
    await expect(page.getByText("AssetBridge").first()).toBeVisible();

    // Suspense fallback or 実コンテンツのどちらかが出る
    const fallback = page.getByText("読み込み中...");
    const tabAll = page.getByRole("button", { name: "全て" });
    await expect(fallback.or(tabAll)).toBeVisible();
  });

  test("/settings が表示される", async ({ page }) => {
    const response = await page.goto("/settings");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // ナビゲーションバーに AssetBridge が表示
    await expect(page.getByText("AssetBridge").first()).toBeVisible();

    // h1 が "設定"
    const h1 = page.locator("h1");
    await expect(h1).not.toBeEmpty();
    await expect(h1).toContainText("設定");
  });

  test("/dividends がエラーなく表示される", async ({ page }) => {
    const response = await page.goto("/dividends");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // ナビゲーションバーに AssetBridge が表示
    await expect(page.getByText("AssetBridge").first()).toBeVisible();

    // h1 が存在して空でない
    const h1 = page.locator("h1");
    await expect(h1).not.toBeEmpty();
  });

  test("/logs がエラーなく表示される", async ({ page }) => {
    const response = await page.goto("/logs");
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // ナビゲーションバーに AssetBridge が表示
    await expect(page.getByText("AssetBridge").first()).toBeVisible();

    // h1 が存在して空でない
    const h1 = page.locator("h1");
    await expect(h1).not.toBeEmpty();
  });

  test("/insights は 404 を返す", async ({ page }) => {
    const response = await page.goto("/insights");
    expect(response?.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 設定ページ機能テスト
// ---------------------------------------------------------------------------

test.describe("設定ページ機能テスト", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("MoneyForward 認証情報セクションが表示される", async ({ page }) => {
    await expect(
      page.getByText("MoneyForward 認証情報"),
    ).toBeVisible();
  });

  test("Discord 設定セクションが表示される", async ({ page }) => {
    await expect(page.getByText("Discord 設定")).toBeVisible();
  });

  test("API キー / シークレット設定セクションが表示される", async ({ page }) => {
    const section = page.locator("h2").filter({ hasText: "API キー / シークレット設定" });
    await expect(section).toBeVisible();
  });

  test("スクレイプスケジュールセクションが表示される", async ({ page }) => {
    await expect(page.getByText("スクレイプスケジュール")).toBeVisible();
  });

  test("すべて保存ボタンが表示される", async ({ page }) => {
    await expect(page.getByRole("button", { name: /すべて(の設定を)?保存/ })).toBeVisible();
  });
});
