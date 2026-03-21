import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";
import path from "path";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // test-results ディレクトリ確認
  const dir = "test-results";

  console.log("=== 検証5: シミュレータページ ===");
  await page.goto("http://localhost:3000/simulator", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${dir}/v5-simulator.png`, fullPage: true });
  
  // 初期資産の値を確認
  const initialAssetInput = await page.locator("input").first().inputValue().catch(() => "N/A");
  console.log("最初のinput値:", initialAssetInput);
  
  // ページ全体のテキストからYen値を探す
  const pageText = await page.textContent("body");
  const yenMatches = pageText?.match(/¥[\d,]+/g) || [];
  console.log("ページ内の¥値:", yenMatches.slice(0, 10).join(", "));

  console.log("=== 検証6,7: 資産一覧ページ ===");
  await page.goto("http://localhost:3000/assets", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${dir}/v6-assets.png`, fullPage: true });
  
  const assetsText = await page.textContent("body");
  
  // 謎の銘柄チェック
  const hasMystery = (assetsText || "").includes("‹") || (assetsText || "").includes("›");
  console.log("謎の銘柄（‹›）存在:", hasMystery);
  
  // 金融機関名列チェック
  const hasInstitution = (assetsText || "").includes("確定拠出年金") || 
                          (assetsText || "").includes("金融機関") ||
                          (assetsText || "").includes("iDeCo");
  console.log("金融機関名あり:", hasInstitution);
  
  // ページ内の金融機関っぽいテキスト
  const institutionMatches = (assetsText || "").match(/(SBI|楽天|確定拠出|iDeCo|SMBC|みずほ|三菱|マネックス)/g) || [];
  console.log("金融機関テキスト:", institutionMatches.slice(0, 10).join(", "));
  
  // バンガード確認（スペース問題）
  const vandCheck = assetsText?.includes("バンガー ド") || false;
  console.log("バンガー ド（スペース問題）:", vandCheck);
  
  console.log("=== ダッシュボードページ ===");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${dir}/v1-dashboard.png`, fullPage: true });
  
  const dashText = await page.textContent("body");
  const dashYen = (dashText || "").match(/¥[\d,]+/g) || [];
  console.log("ダッシュボードの¥値:", dashYen.slice(0, 10).join(", "));
  
  console.log("=== 配当ページ ===");
  await page.goto("http://localhost:3000/dividends", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${dir}/v4-dividends.png`, fullPage: true });
  const divText = await page.textContent("body");
  const divYen = (divText || "").match(/¥[\d,]+/g) || [];
  console.log("配当ページの¥値:", divYen.slice(0, 10).join(", "));
  
  console.log("=== クレカページ ===");
  await page.goto("http://localhost:3000/income-expense", { waitUntil: "networkidle" }).catch(async () => {
    await page.goto("http://localhost:3000/credit-cards", { waitUntil: "networkidle" });
  });
  await page.screenshot({ path: `${dir}/v3-cc.png`, fullPage: true });
  const ccText = await page.textContent("body");
  const ccMatches = (ccText || "").match(/(PayPay|楽天|Amex|VISA|クレジット|カード)/g) || [];
  console.log("クレカページテキスト:", ccMatches.slice(0, 10).join(", "));

  await browser.close();
  console.log("=== スクリーンショット完了 ===");
})();
