import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const API_KEY = "test";

const API_HEADERS = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

function extractTrpcData(body: unknown): unknown {
  return (body as { result?: { data?: unknown } })?.result?.data;
}

test.describe("認証付き tRPC API テスト", () => {
  test("settings.getAllSettings が 200 で主要フィールドを返す", async ({ request }) => {
    const res = await request.get(`${API_BASE}/trpc/settings.getAllSettings`, {
      headers: API_HEADERS,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const data = extractTrpcData(body) as {
      scrapeSchedule?: { hour?: number; minute?: number };
      discordChannelId?: string;
      secrets?: Record<string, { isSet: boolean; masked: string | null }>;
    };

    expect(typeof data.scrapeSchedule?.hour).toBe("number");
    expect(typeof data.scrapeSchedule?.minute).toBe("number");
    expect(typeof data.discordChannelId).toBe("string");
    expect(typeof data.secrets).toBe("object");
  });

  test("settings.setScrapeSchedule 後に scrapeSchedule が反映される", async ({ request }) => {
    const hour = 7;
    const minute = 30;

    const mutRes = await request.post(`${API_BASE}/trpc/settings.setScrapeSchedule`, {
      headers: API_HEADERS,
      data: { hour, minute },
    });
    expect(mutRes.status()).toBe(200);

    const qRes = await request.get(`${API_BASE}/trpc/settings.scrapeSchedule`, {
      headers: API_HEADERS,
    });
    expect(qRes.status()).toBe(200);

    const body = await qRes.json();
    const data = extractTrpcData(body) as { hour?: number; minute?: number };
    expect(data.hour).toBe(hour);
    expect(data.minute).toBe(minute);
  });

  test("settings.setMf2faCode が 200 を返す", async ({ request }) => {
    const res = await request.post(`${API_BASE}/trpc/settings.setMf2faCode`, {
      headers: API_HEADERS,
      data: { code: "12345678" },
    });
    expect(res.status()).toBe(200);
  });

  test("scrape.status が 200 で status フィールドを返す", async ({ request }) => {
    const res = await request.get(`${API_BASE}/trpc/scrape.status`, {
      headers: API_HEADERS,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const data = extractTrpcData(body) as Record<string, unknown>;
    expect(data).toBeTruthy();
    expect("status" in data).toBe(true);
  });

  test("portfolio.snapshot が 200 で totalJpy を返す", { timeout: 60000 }, async ({ request }) => {
    const res = await request.get(`${API_BASE}/trpc/portfolio.snapshot?input=%7B%7D`, {
      headers: API_HEADERS,
      timeout: 55000,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const data = extractTrpcData(body) as Record<string, unknown>;
    expect(typeof data.totalJpy).toBe("number");
  });

  test("portfolio.holdings が 200 で配列データを返す", async ({ request }) => {
    const input = encodeURIComponent(JSON.stringify({ assetType: "all" }));
    const res = await request.get(`${API_BASE}/trpc/portfolio.holdings?input=${input}`, {
      headers: API_HEADERS,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const data = extractTrpcData(body);
    expect(Array.isArray(data)).toBe(true);
  });

  test("portfolio.history が 200 で配列データを返す", async ({ request }) => {
    const input = encodeURIComponent(JSON.stringify({ days: 7 }));
    const res = await request.get(`${API_BASE}/trpc/portfolio.history?input=${input}`, {
      headers: API_HEADERS,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const data = extractTrpcData(body);
    expect(Array.isArray(data)).toBe(true);
  });

  test("APIキー設定済みの場合、認証ヘッダーなしは 401 を返す", async ({ request }) => {
    // テスト用に一時的に web_api_key を設定
    const setRes = await request.post(`${API_BASE}/trpc/settings.setSecret`, {
      headers: API_HEADERS,
      data: { key: "web_api_key", value: API_KEY },
    });
    expect(setRes.status()).toBe(200);

    try {
      const res = await request.get(`${API_BASE}/trpc/portfolio.snapshot?input=%7B%7D`);
      expect(res.status()).toBe(401);
    } finally {
      // テスト後にAPIキーをクリア（他テストに影響しないよう）
      await request.post(`${API_BASE}/trpc/settings.setSecret`, {
        headers: API_HEADERS,
        data: { key: "web_api_key", value: "" },
      });
    }
  });
});

test.describe("設定UIフロー（現行仕様）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("スクレイプ時刻を変更して『すべて保存』で成功メッセージを表示", async ({ page }) => {
    await page.locator("#sched-hour").selectOption("10");
    await page.locator("#sched-minute").selectOption("15");

    await page.getByRole("button", { name: /すべて(の設定を)?保存/ }).click();
    await expect(page.locator("[role='status']")).toContainText("すべての設定を保存しました", {
      timeout: 10000,
    });
  });

  test.skip("2FAコード入力欄が表示される", async ({ page }) => {
    // MF 2FA 入力欄は要件仕様では実装対象外のためスキップ
    // UIに該当要素（id="2fa-code"）が存在しない
    const codeInput = page.locator('[id="2fa-code"]');
    await expect(codeInput).toBeVisible();

    await codeInput.fill("87654321");
    await expect(codeInput).toHaveValue("87654321");
  });

  test("MoneyForward 即時同期ボタンが表示される", async ({ page }) => {
    await expect(page.getByRole("button", { name: "今すぐ同期" })).toBeVisible();
  });
});
