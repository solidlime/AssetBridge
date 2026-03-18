/**
 * browser-scraper.mjs — Node.js で動作する MF スクレイパー
 * Bun から Bun.spawn() で呼び出し、stdout で JSON 通信する
 *
 * Protocol (stdout, line-delimited):
 *   REQUIRES_2FA              → Bun に 2FA コード入力を要求
 *   DONE:<JSON>               → ScrapedData + cookies を返して終了
 *   ERROR:<message>           → エラー終了
 *
 * Protocol (stdin):
 *   CODE:<6〜8桁の数字>\n    → Bun から 2FA コードを受け取る
 */

import { chromium } from "playwright";

const BASE_URL = "https://ssnb.x.moneyforward.com";

const CATEGORY_MAP = {
  "預金・現金・暗号資産": "CASH",
  "株式（現物）": "STOCK_JP",
  "投資信託": "FUND",
  "年金": "PENSION",
  "ポイント・マイル": "POINT",
};

function detectAssetType(symbol) {
  if (!symbol) return "CASH";
  if (/^\d{4,5}$/.test(symbol)) return "STOCK_JP";
  if (/^[A-Z]{1,6}$/.test(symbol)) return "STOCK_US";
  if (/[A-Z0-9]{6,}/.test(symbol)) return "FUND";
  return "CASH";
}

function parseAmount(text) {
  const match = String(text).replace(/,/g, "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function send(line) {
  process.stdout.write(line + "\n");
}

/** stdin から 1行読む（2FAコード待機用） */
async function readStdinLine(timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("2FA timeout: no code received within 5 minutes"));
    }, timeoutMs);

    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    const onData = (chunk) => {
      buf += chunk;
      const idx = buf.indexOf("\n");
      if (idx >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        clearTimeout(timer);
        process.stdin.removeListener("data", onData);
        resolve(line);
      }
    };
    process.stdin.on("data", onData);
  });
}

async function login(page) {
  const email = process.env.MF_EMAIL ?? "";
  const password = process.env.MF_PASSWORD ?? "";

  await page.goto(`${BASE_URL}/users/sign_in`, { waitUntil: "networkidle" });
  await page.fill('input[name="sign_in_session_service[email]"]', email);
  await page.fill('input[name="sign_in_session_service[password]"]', password);
  await page.click('input[type="submit"]');
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/two_step_verifications")) {
    process.stderr.write("[browser-scraper] 2FA required, waiting for code...\n");
    send("REQUIRES_2FA");

    const line = await readStdinLine();
    if (!line.startsWith("CODE:")) throw new Error("Invalid 2FA input: " + line);
    const code = line.slice(5).trim();

    await page.goto(
      `${BASE_URL}/users/two_step_verifications/verify/${code}`,
      { waitUntil: "networkidle" }
    );

    // 2FA 後に sign_in やエラーページでないことを確認
    const urlAfter2fa = page.url();
    if (urlAfter2fa.includes("sign_in") || urlAfter2fa.includes("two_step_verifications")) {
      throw new Error(`2FA failed or code was invalid (landed on: ${urlAfter2fa})`);
    }
  }

  // ログイン後に sign_in ページでないことを確認
  if (page.url().includes("sign_in")) {
    throw new Error(`Login failed (still on sign_in page: ${page.url()})`);
  }

  process.stderr.write("[browser-scraper] Login successful, URL: " + page.url() + "\n");
}

/**
 * クレジットカード引き落とし予定情報をスクレイプ
 * MF のキャッシュフロー画面 (/bs/cf) または入出金ページから取得する
 */
async function scrapeCreditCardWithdrawals(page) {
  const results = [];
  try {
    await page.goto(`${BASE_URL}/bs/cf`, { waitUntil: "networkidle", timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    process.stderr.write(`[browser-scraper] scrapeCreditCardWithdrawals: URL=${page.url()}\n`);

    // テーブル行からクレカ引き落とし関連データを取得
    const tableData = await page.evaluate(() => {
      const rows = [];
      for (const tr of document.querySelectorAll('table tr')) {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim());
        rows.push({ cells, rowClass: tr.className });
      }
      return rows;
    });

    process.stderr.write(`[browser-scraper] CF table rows: ${tableData.length}\n`);

    // クレカ引き落とし関連キーワードでフィルタ
    const creditKeywords = ['カード', '引き落とし', '引落', 'クレジット', 'VISA', 'Mastercard', 'JCB', 'AMEX'];
    for (const { cells } of tableData) {
      const rowText = cells.join(' ');
      if (creditKeywords.some(kw => rowText.includes(kw))) {
        process.stderr.write(`[browser-scraper] Credit row: ${JSON.stringify(cells)}\n`);
        // 日付パターン (YYYY/MM/DD または MM/DD) を探す
        const dateMatch = rowText.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        const shortDateMatch = rowText.match(/(\d{1,2})[\/\-](\d{1,2})/);
        // 金額パターン
        const amountCell = cells.find(c => c.replace(/,/g, '').match(/^\d{3,}/));
        const amountMatch = amountCell ? amountCell.replace(/,/g, '').match(/[\d.]+/) : null;

        if (amountMatch && (dateMatch || shortDateMatch)) {
          let withdrawalDate;
          if (dateMatch) {
            withdrawalDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
          } else {
            const now = new Date();
            const month = parseInt(shortDateMatch[1]);
            const day = parseInt(shortDateMatch[2]);
            let year = now.getFullYear();
            // 月が現在より前なら来年
            if (month < now.getMonth() + 1) year++;
            withdrawalDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
          const cardName = cells.find(c => creditKeywords.some(kw => c.includes(kw))) || 'クレジットカード';
          results.push({
            cardName: cardName.slice(0, 100),
            withdrawalDate,
            amountJpy: parseFloat(amountMatch[0]),
            status: 'scheduled',
          });
        }
      }
    }

    // テーブル以外のリスト要素でも探す
    if (results.length === 0) {
      const listData = await page.evaluate(() => {
        const items = [];
        // dl/dt/dd パターン
        for (const dt of document.querySelectorAll('dt, .title, .name, [class*="name"]')) {
          const text = (dt.innerText || '').trim();
          if (text.includes('カード') || text.includes('引落') || text.includes('引き落とし')) {
            const sibling = dt.nextElementSibling;
            const amount = sibling ? (sibling.innerText || '').trim() : '';
            items.push({ label: text.slice(0, 100), amount: amount.slice(0, 50) });
          }
        }
        return items;
      });
      process.stderr.write(`[browser-scraper] CF list items: ${JSON.stringify(listData)}\n`);
    }

    process.stderr.write(`[browser-scraper] Credit withdrawals found: ${results.length}\n`);
  } catch (e) {
    process.stderr.write(`[browser-scraper] scrapeCreditCardWithdrawals error: ${e.message}\n`);
  }
  return results;
}

async function scrapePortfolio(page) {
  await page.goto(`${BASE_URL}/bs/portfolio`, { waitUntil: "networkidle" });
  await new Promise(r => setTimeout(r, 3000)); // JS render wait
  process.stderr.write(`[browser-scraper] scrapePortfolio: URL=${page.url()}\n`);

  let totalText = "0";
  try {
    await page.waitForSelector("div.heading-radius-box", { timeout: 15_000 });
    totalText = await page.locator("div.heading-radius-box").first().innerText();
    process.stderr.write(`[browser-scraper] heading text: ${totalText.slice(0, 100)}\n`);
  } catch (e) {
    process.stderr.write(`[browser-scraper] WARN: heading-radius-box not found: ${e.message}\n`);
  }
  const totalMatch = totalText.replace(/,/g, "").match(/[\d.]+/);
  const totalJpy = totalMatch ? parseFloat(totalMatch[0]) : 0;

  const categories = {};
  const holdings = [];

  // page.evaluate() で全テーブルデータを一括取得（IPC ラウンドトリップを最小化）
  const tableData = await page.evaluate(() => {
    const results = [];
    const rows = document.querySelectorAll("table tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td, th");
      const cellTexts = Array.from(cells).map(c => c.innerText.trim());
      // カテゴリ行（th>a）のリンクテキストも取得
      const thAnchor = row.querySelector("th a");
      const thAnchorText = thAnchor ? thAnchor.innerText.trim() : null;
      results.push({ cellTexts, thAnchorText });
    }
    return results;
  });

  process.stderr.write(`[browser-scraper] table rows: ${tableData.length}\n`);
  if (tableData.length > 0) {
    process.stderr.write(`[browser-scraper] first 3 rows: ${JSON.stringify(tableData.slice(0, 3))}\n`);
  }

  for (const { cellTexts, thAnchorText } of tableData) {
    const count = cellTexts.length;

    if (count === 2 || count === 3) {
      if (thAnchorText) {
        const catName = thAnchorText;
        // cellTexts[0]=カテゴリ名(th), cellTexts[1]=金額(td), cellTexts[2]=割合(td)
        const tdText = cellTexts[1];
        const assetType = CATEGORY_MAP[catName];
        if (assetType) categories[assetType] = parseAmount(tdText);
      }
    } else if (count >= 13) {
      // MF 株式テーブル構造:
      //   td[0]: 銘柄コード（例: "1605", "AMD", "ASTS"）
      //   td[1]: 銘柄名（例: "INPEX", "アドバンスト マイクロ デバイシズ"）
      //   td[4]: 保有数, td[5]: 評価額, td[6]: 取得単価, td[7]: 含み損益額
      const codeCandidate = (cellTexts[0] ?? "").replace(/\s/g, "");
      const name = cellTexts[1] ?? "";
      const valueJpy = parseAmount(cellTexts[5] ?? "0");
      const unrealizedPnlJpy = parseAmount(cellTexts[7] ?? "0");
      if (name && valueJpy > 0) {
        // td[0] が銘柄コードらしい（英数字のみ）場合はそれを優先
        // そうでなければ銘柄名から括弧内シンボルを抽出、最後の手段は銘柄名の先頭10文字
        let symbol;
        if (codeCandidate && /^[A-Z0-9]{1,8}$/.test(codeCandidate)) {
          symbol = codeCandidate;
        } else if (codeCandidate && /^\d{4,5}$/.test(codeCandidate)) {
          symbol = codeCandidate;
        } else {
          const symbolMatch = name.match(/[（(]([A-Z0-9]{1,8})[）)]/);
          symbol = symbolMatch ? symbolMatch[1] : codeCandidate || name.slice(0, 10).replace(/\s/g, "");
        }
        holdings.push({
          symbol, name,
          assetType: detectAssetType(symbol),
          valueJpy, unrealizedPnlJpy,
          quantity: 0, priceJpy: 0, costBasisJpy: 0, costPerUnitJpy: 0,
        });
      }
    } else if (count === 5) {
      const name = cellTexts[0] ?? "";
      const balance = parseAmount(cellTexts[1] ?? "0");
      if (name && balance > 0) {
        holdings.push({
          symbol: "", name, assetType: "CASH",
          valueJpy: balance, unrealizedPnlJpy: 0,
          quantity: balance, priceJpy: 1, costBasisJpy: balance, costPerUnitJpy: 1,
        });
      }
    }
  }

  return { totalJpy, categories, holdings };
}

async function main() {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const browser = await chromium.launch({ headless, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });

  try {
    // セッション Cookie の復元
    const cookiesJson = process.env.MF_COOKIES_JSON;
    let sessionLoaded = false;
    if (cookiesJson) {
      try {
        const cookies = JSON.parse(cookiesJson);
        if (Array.isArray(cookies) && cookies.length > 0) {
          await context.addCookies(cookies);
          sessionLoaded = true;
        }
      } catch { /* 無視 */ }
    }

    const page = await context.newPage();

    if (sessionLoaded) {
      await page.goto(`${BASE_URL}/accounts`, { waitUntil: "networkidle" });
      if (page.url().includes("sign_in")) {
        process.stderr.write("[browser-scraper] Session expired, re-login\n");
        await login(page);
      }
    } else {
      await login(page);
    }

    // 一括更新ボタン
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
      const refreshBtn = page.locator("a.refresh, a[href*='aggregation_queue']").first();
      if (await refreshBtn.isVisible({ timeout: 3_000 })) {
        await refreshBtn.click();
        process.stderr.write("[browser-scraper] Bulk update triggered\n");
        await new Promise((r) => setTimeout(r, 10_000));
      }
    } catch { /* ボタンなし */ }

    const data = await scrapePortfolio(page);
    const creditCardWithdrawals = await scrapeCreditCardWithdrawals(page);
    const cookies = await context.cookies();

    process.stderr.write(`[browser-scraper] Scrape complete: ¥${data.totalJpy.toLocaleString()}, credit withdrawals: ${creditCardWithdrawals.length}\n`);
    send("DONE:" + JSON.stringify({ data: { ...data, creditCardWithdrawals }, cookies }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write("[browser-scraper] ERROR: " + msg + "\n");
    send("ERROR:" + msg);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write("[browser-scraper] Fatal: " + String(e) + "\n");
  send("ERROR:" + String(e));
  process.exit(1);
});
