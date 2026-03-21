import { test } from "@playwright/test";

test("残りスクリーンショット", async ({ page }) => {
  test.setTimeout(60000);
  const dir = "D:/VSCode/AssetBridge/test-results";
  
  // 配当
  await page.goto("http://localhost:3000/dividends", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${dir}/v4-dividends.png`, fullPage: true });
  console.log("v4-dividends.png 保存");
  
  // income-expense
  await page.goto("http://localhost:3000/income-expense", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/v3-income.png`, fullPage: true });
  console.log("v3-income.png 保存");
  
  // assets 全体（fullPage）
  await page.goto("http://localhost:3000/assets", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/v6-assets-full.png`, fullPage: true });
  console.log("v6-assets-full.png 保存");
  
  // DB直接クエリで謎の銘柄を確認（‹文字: U+2039）
  const bodyText = await page.textContent("body");
  const laq = "\u2039"; // ‹
  const raq = "\u203A"; // ›
  const haslaq = (bodyText || "").includes(laq);
  const hasraq = (bodyText || "").includes(raq);
  console.log("‹(U+2039)含む:", haslaq);
  console.log("›(U+203A)含む:", hasraq);
  
  // 謎の銘柄行を特定
  const rows = await page.locator("tr").allTextContents();
  const mysteryRows = rows.filter(r => r.includes(laq) || r.includes(raq));
  console.log("謎の銘柄行:", mysteryRows.length, "件");
  mysteryRows.forEach((r, i) => console.log(`[${i}]:`, r.substring(0, 80)));
});
