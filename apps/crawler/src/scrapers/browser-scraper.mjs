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

// MARKER: v2-anchor-based-scraper
process.stderr.write(`[browser-scraper] FILE_PATH=${new URL(import.meta.url).pathname}\n`);

import { chromium } from "playwright";

const BASE_URL = "https://ssnb.x.moneyforward.com";

const CATEGORY_MAP = {
  "預金・現金・暗号資産": "CASH",
  "株式（現物）": "STOCK_JP",
  "投資信託": "FUND",
  "年金": "PENSION",
  "ポイント・マイル": "POINT",
};

function buildColMap(headers) {
  const colMap = {
    name: -1,
    quantity: -1,
    costPerUnit: -1,
    currentPrice: -1,
    value: -1,
    unrealizedPnl: -1,
    unrealizedPnlRate: -1,
  };
  if (!headers || headers.length === 0) return colMap;

  headers.forEach((h, i) => {
    if (!h) return;
    if (h.includes('銘柄') || h.includes('名称')) colMap.name = i;
    if (h.includes('保有数') || h.includes('数量')) colMap.quantity = i;
    if (h.includes('取得単価')) colMap.costPerUnit = i;
    if (h.includes('現在値') || h.includes('現在価格')) colMap.currentPrice = i;
    if (h.includes('評価額') && !h.includes('損益')) colMap.value = i;
    if (h.includes('損益額') || (h.includes('損益') && !h.includes('率') && !h.includes('%'))) colMap.unrealizedPnl = i;
    if (h.includes('損益率') || h.includes('損益(%)')) colMap.unrealizedPnlRate = i;
  });

  return colMap;
}

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

/**
 * クレカ金額専用パーサー。失敗時は null を返す（スキップ用）。
 * parseAmount とは別関数で、scrapePortfolio に影響しない。
 */
export function parseCardAmount(text) {
  if (!text) return null;
  const match = String(text).replace(/[¥円\s]/g, "").match(/-?[\d,]+/);
  if (!match) return null;
  const num = parseInt(match[0].replace(/,/g, ""), 10);
  return isNaN(num) ? null : Math.abs(num);
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
 * カードブロックのテキストをパースして { cardName, withdrawalDate, amountJpy, status } を返す
 * ブロックが有効なカードでなければ null を返す
 */
export function parseCardBlock(blockText) {
  const lines = blockText.split('\n').map(l => l.trim()).filter(l => l);

  // カード名: 「金融機関サービスサイトへ」を含む行から抽出
  let cardName = '不明';
  const cardLine = lines.find(l => l.includes('金融機関サービスサイトへ'));
  if (cardLine) {
    cardName = cardLine.replace('金融機関サービスサイトへ', '').trim();
  }
  if (!cardName || cardName === '') return null;

  // 引き落とし日: 「引き落とし日:(YYYY/MM/DD)」から抽出
  let withdrawalDate = null;
  const dateLine = lines.find(l => l.includes('引き落とし日:'));
  if (dateLine) {
    const dateMatch = dateLine.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (dateMatch) withdrawalDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  // 引き落とし額: 優先順位付きロジック
  let amountJpy = null;
  if (lines.some(l => l.includes('引き落とし額未確定'))) {
    // 未確定: 利用残高から取得 (Math.abs)
    const balanceLine = lines.find(l => l.includes('利用残高:'));
    if (balanceLine) {
      const m = balanceLine.match(/利用残高[:\s]*-?([\d,]+)/);
      if (m) amountJpy = parseCardAmount(m[1]);
    }
  } else {
    // 確定: 引き落とし日の直前の行から金額取得
    const dateIdx = lines.findIndex(l => l.includes('引き落とし日:'));
    if (dateIdx > 0) {
      const amountLine = lines[dateIdx - 1];
      const m = amountLine.match(/-?([\d,]+)円/);
      if (m) amountJpy = parseCardAmount(m[1]);
    }
  }

  if (amountJpy === null) return null; // null なら skip

  return { cardName: cardName.slice(0, 100), withdrawalDate, amountJpy, status: 'scheduled' };
}

/**
 * アンカーリンク経由でクレカ情報を取得 (BASE_URL トップページ専用)
 * 「金融機関サービスサイトへ」アンカーを起点にカードブロックを解析する。
 * @param {import('playwright').Page} page
 * @returns {Promise<{cardName:string, withdrawalDate:string|null, amountJpy:number, status:string}[]>}
 */
export async function scrapeCardsByAnchor(page) {
  const results = [];
  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    process.stderr.write(`[browser-scraper] scrapeCardsByAnchor: URL=${page.url()}\n`);

    const cardBlocks = await page.evaluate(() => {
      // 「金融機関サービスサイトへ」リンクを全て取得 → 各カードの起点
      const anchors = Array.from(document.querySelectorAll('a'));
      const cardAnchors = anchors.filter(a => a.textContent.includes('金融機関サービスサイトへ'));
      return cardAnchors.map(a => {
        // カード名はアンカーの親要素のテキスト or 直前のテキスト
        const wrapper = a.closest('li, .account-item, .card-item, section, div') || a.parentElement;
        return wrapper ? wrapper.innerText : '';
      });
    });

    process.stderr.write(`[browser-scraper] Card anchors found: ${cardBlocks.length}\n`);
    for (let i = 0; i < cardBlocks.length; i++) {
      process.stderr.write(`[browser-scraper] Card block[${i}]: ${cardBlocks[i].slice(0, 300)}\n`);
    }

    for (const blockText of cardBlocks) {
      const parsed = parseCardBlock(blockText);
      if (parsed) {
        process.stderr.write(`[browser-scraper] Parsed card: ${JSON.stringify(parsed)}\n`);
        results.push(parsed);
      } else {
        process.stderr.write(`[browser-scraper] parseCardBlock returned null for block: ${blockText.slice(0, 100)}\n`);
      }
    }

    process.stderr.write(`[browser-scraper] Credit withdrawals found on ${BASE_URL}: ${results.length}\n`);
  } catch (e) {
    process.stderr.write(`[browser-scraper] scrapeCardsByAnchor error: ${e.message}\n`);
  }
  return results;
}

/**
 * dl/dt/dd 構造およびテーブルからクレカ情報を取得 (フォールバック用)
 * /bs/cf → /bs/accounts の順に試みる。
 * @param {import('playwright').Page} page
 * @returns {Promise<{cardName:string, withdrawalDate:string|null, amountJpy:number, status:string}[]>}
 */
export async function scrapeCardsByDl(page) {
  const results = [];
  const fallbackUrls = [`${BASE_URL}/bs/cf`, `${BASE_URL}/bs/accounts`];

  for (const url of fallbackUrls) {
    if (results.length > 0) break;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000));
      process.stderr.write(`[browser-scraper] scrapeCardsByDl: URL=${page.url()}\n`);

      // デバッグ: ページ内テーブル数・行数
      const debugInfo = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const info = { tableCount: tables.length, rows: [] };
        for (const table of tables) {
          for (const tr of table.querySelectorAll('tr')) {
            const text = tr.innerText.trim().slice(0, 200);
            if (text) info.rows.push(text);
          }
        }
        return info;
      });
      process.stderr.write(`[browser-scraper] Tables: ${debugInfo.tableCount}, Rows: ${debugInfo.rows.length}\n`);

      // MF 固有セレクタを優先して試みる
      const mfSpecificData = await page.evaluate(() => {
        const rows = [];
        const selectors = [
          'table.table_credit_card tr',
          '.credit-card-payment',
          '#cf-table tr',
          '[class*="withdrawal"] tr',
          '[class*="payment"] tr',
          '[class*="card"] tr',
          '[class*="credit"] tr',
        ];
        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            const cells = Array.from(el.querySelectorAll('td,th')).map(c => c.innerText.trim());
            if (cells.length > 0) rows.push({ cells, rowClass: el.className, selector: sel });
          }
        }
        return rows;
      });
      process.stderr.write(`[browser-scraper] MF-specific rows: ${mfSpecificData.length}\n`);

      // 汎用テーブル行も取得
      const tableData = await page.evaluate(() => {
        const rows = [];
        for (const tr of document.querySelectorAll('table tr')) {
          const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim());
          rows.push({ cells, rowClass: tr.className });
        }
        return rows;
      });

      const allRows = [...mfSpecificData, ...tableData];
      process.stderr.write(`[browser-scraper] CF total candidate rows: ${allRows.length}\n`);

      const creditKeywords = ['カード', '引き落とし', '引落', 'クレジット', 'VISA', 'Mastercard', 'JCB', 'AMEX'];
      for (const { cells } of allRows) {
        const rowText = cells.join(' ');
        if (creditKeywords.some(kw => rowText.includes(kw))) {
          const dateMatch = rowText.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          const shortDateMatch = rowText.match(/(\d{1,2})[\/\-](\d{1,2})/);
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
              if (month < now.getMonth() + 1) year++;
              withdrawalDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
            const cardName = cells.find(c => creditKeywords.some(kw => c.includes(kw))) || 'クレジットカード';
            const amountJpy = parseCardAmount(amountMatch[0]);
            if (amountJpy === null) continue; // null なら skip
            results.push({
              cardName: cardName.slice(0, 100),
              withdrawalDate,
              amountJpy,
              status: 'scheduled',
            });
          }
        }
      }

      // テーブルで見つからなければ dl/dt/dd パターンも試みる
      if (results.length === 0) {
        const listData = await page.evaluate(() => {
          const items = [];
          for (const dt of document.querySelectorAll('dt, .title, .name, [class*="name"]')) {
            const text = (dt.innerText || '').trim();
            if (text.includes('カード') || text.includes('引落') || text.includes('引き落とし')) {
              const sibling = dt.nextElementSibling;
              const amountText = sibling ? (sibling.innerText || '').trim() : '';
              items.push({ label: text.slice(0, 100), amount: amountText.slice(0, 500) });
            }
          }
          return items;
        });
        process.stderr.write(`[browser-scraper] CF list items: ${JSON.stringify(listData)}\n`);

        for (const item of listData) {
          let amount = 0;
          const balanceMatch = item.amount.match(/利用残高[:\s]*(-?[\d,]+)/);
          if (balanceMatch) {
            const parsed = parseCardAmount(balanceMatch[1]);
            if (parsed === null) continue; // null なら skip
            amount = parsed;
          } else {
            const scheduledMatch = item.amount.match(/引き落とし[^\d]*(-?[\d,]+)/);
            if (scheduledMatch) {
              const parsed = parseCardAmount(scheduledMatch[1]);
              if (parsed === null) continue; // null なら skip
              amount = parsed;
            } else {
              const allNums = (item.amount.replace(/,/g, '')).match(/\d+/g) || [];
              const big = allNums.map(Number).filter(n => n >= 1000);
              amount = big.length > 0 ? big[0] : 0;
            }
          }

          const firstLine = item.amount.split('\n')[0].trim();
          const cardName = firstLine && firstLine.length > 0 && firstLine !== item.label
            ? firstLine
            : (item.label || 'カード');

          const dateMatch = item.label.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/) ||
                            item.amount.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          const shortDateMatch = item.label.match(/(\d{1,2})[\/\-](\d{1,2})/) ||
                                  item.amount.match(/(\d{1,2})[\/\-](\d{1,2})/);

          if (amount > 0) {
            let withdrawalDate;
            if (dateMatch) {
              withdrawalDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
            } else if (shortDateMatch) {
              const now = new Date();
              const month = parseInt(shortDateMatch[1]);
              const day = parseInt(shortDateMatch[2]);
              let year = now.getFullYear();
              if (month < now.getMonth() + 1) year++;
              withdrawalDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            } else {
              const now = new Date();
              withdrawalDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-27`;
            }
            results.push({
              cardName: cardName.slice(0, 100),
              withdrawalDate,
              amountJpy: amount,
              status: 'scheduled',
            });
          }
        }
      }

      process.stderr.write(`[browser-scraper] Credit withdrawals found on ${url}: ${results.length}\n`);
    } catch (e) {
      process.stderr.write(`[browser-scraper] scrapeCardsByDl error on ${url}: ${e.message}\n`);
    }
  }
  return results;
}

/**
 * クレジットカード引き落とし予定情報をスクレイプ (オーケストレーター)
 * scrapeCardsByAnchor を優先し、結果がなければ scrapeCardsByDl にフォールバック。
 * 両ソースの結果を cardName でマージ・重複排除して返す。
 * @param {import('playwright').Page} page
 * @returns {Promise<{cardName:string, withdrawalDate:string|null, amountJpy:number, status:string}[]>}
 */
export async function scrapeCreditCardWithdrawals(page) {
  const anchorResults = await scrapeCardsByAnchor(page);
  // アンカーで取得できた場合はそのまま返す（フォールバック不要）
  const dlResults = anchorResults.length > 0 ? [] : await scrapeCardsByDl(page);

  // cardName をキーに重複排除してマージ
  const seen = new Set();
  return [...anchorResults, ...dlResults].filter(item => {
    if (seen.has(item.cardName)) return false;
    seen.add(item.cardName);
    return true;
  });
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

  // ヘッダー取得 → デバッグ出力 → colMap 構築
  let _headers = [];
  try {
    _headers = await page.$$eval('table.table-portfolio thead th', ths =>
      ths.map(th => th.textContent?.trim())
    );
    process.stderr.write(`[DEBUG HEADERS] ${JSON.stringify(_headers)}\n`);
  } catch (e) {
    try {
      _headers = await page.$$eval('table thead th', ths =>
        ths.map(th => th.textContent?.trim())
      );
      process.stderr.write(`[DEBUG HEADERS fallback] ${JSON.stringify(_headers)}\n`);
    } catch (e2) {
      process.stderr.write(`[DEBUG HEADERS error] ${e2.message}\n`);
    }
  }
  let colMap = buildColMap(_headers);

  // CSS セレクタでヘッダーが取得できなかった場合、tableData の最初の count=13 行をヘッダーとして試みる
  if (colMap.quantity < 0) {
    const headerRow = tableData.find(r => r.cellTexts.length >= 13 && r.cellTexts.some(c => c.includes('保有数') || c.includes('銘柄')));
    if (headerRow) {
      colMap = buildColMap(headerRow.cellTexts);
      process.stderr.write(`[DEBUG HEADERS fallback from tableData] ${JSON.stringify(headerRow.cellTexts)}\n`);
    }
  }

  process.stderr.write(`[DEBUG COLMAP] ${JSON.stringify(colMap)}\n`);

  const quantityIdx = colMap.quantity >= 0 ? colMap.quantity : 2;
  const costPerUnitIdx = colMap.costPerUnit >= 0 ? colMap.costPerUnit : 3;
  const valueIdx = colMap.value >= 0 ? colMap.value : 5;
  const unrealizedPnlIdx = colMap.unrealizedPnl >= 0 ? colMap.unrealizedPnl : 7;

  let stockDebugCount = 0;

  for (const { cellTexts, thAnchorText } of tableData) {
    const count = cellTexts.length;

    if (count === 2 || count === 3) {
      if (holdings.length < 3) {
        process.stderr.write(`[DEBUG] category row: count=${count}, text="${cellTexts[0]}"\n`);
      }
      if (thAnchorText) {
        const catName = thAnchorText;
        // cellTexts[0]=カテゴリ名(th), cellTexts[1]=金額(td), cellTexts[2]=割合(td)
        const tdText = cellTexts[1];
        const assetType = CATEGORY_MAP[catName];
        if (assetType) categories[assetType] = parseAmount(tdText);
      }
    } else if (count >= 13) {
      if (stockDebugCount < 5) {
        process.stderr.write(`[DEBUG STOCK ROW] count=${cellTexts.length}, cells=${JSON.stringify(cellTexts)}\n`);
        stockDebugCount++;
      }
      // MF 株式テーブル構造 (動的インデックス):
      //   td[0]: 銘柄コード（例: "1605", "AMD", "ASTS"）
      //   td[1]: 銘柄名（例: "INPEX", "アドバンスト マイクロ デバイシズ"）
      const codeCandidate = (cellTexts[0] ?? "").replace(/\s/g, "");
      const name = cellTexts[1] ?? "";
      const valueJpy = parseAmount(cellTexts[valueIdx] ?? "0");
      const unrealizedPnlJpy = parseAmount(cellTexts[unrealizedPnlIdx] ?? "0");
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
        const quantity = parseAmount(cellTexts[quantityIdx] ?? "0");
        const costPerUnitJpy = parseAmount(cellTexts[costPerUnitIdx] ?? "0");
        const priceJpy = quantity > 0 ? valueJpy / quantity : 0;
        const costBasisJpy = costPerUnitJpy * quantity;
        holdings.push({
          symbol, name,
          assetType: detectAssetType(symbol),
          valueJpy, unrealizedPnlJpy,
          quantity, priceJpy, costBasisJpy, costPerUnitJpy,
        });
      }
    } else if (count === 5) {
      const name = cellTexts[0] ?? "";
      const balance = parseAmount(cellTexts[1] ?? "0");
      if (holdings.length < 3) {
        process.stderr.write(`[DEBUG] cash row: count=${count}, name="${name}", balance="${cellTexts[1]}"\n`);
      }
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
