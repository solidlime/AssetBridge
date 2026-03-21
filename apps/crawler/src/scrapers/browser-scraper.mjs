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
import { mkdirSync } from 'fs';
import { join } from 'path';

const SAVE_SNAPSHOTS = process.env.SAVE_SNAPSHOTS === '1';
const snapshotDir = (() => {
  const date = new Date().toISOString().split('T')[0];
  const dir = join(process.cwd(), 'data', 'snapshots', date);
  if (SAVE_SNAPSHOTS) mkdirSync(dir, { recursive: true });
  return dir;
})();

async function saveSnapshot(page, name) {
  if (!SAVE_SNAPSHOTS) return;
  try {
    const filePath = join(snapshotDir, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.error(`[snapshot] saved: ${filePath}`);
  } catch (e) {
    console.error(`[snapshot] failed to save ${name}: ${e.message}`);
  }
}

const BASE_URL = "https://ssnb.x.moneyforward.com";

const CATEGORY_MAP = {
  "預金・現金・暗号資産": "CASH",
  "株式（現物）": "STOCK_JP",
  "外国株式": "STOCK_US",
  "投資信託": "FUND",
  "年金": "PENSION",
  "確定拠出年金": "PENSION", // DC年金・企業型DCに対応
  "iDeCo": "PENSION",       // 個人型確定拠出年金
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
    institution: -1,
  };
  if (!headers || headers.length === 0) return colMap;

  headers.forEach((h, i) => {
    if (!h) return;
    const hn = h.replace(/[\s\u3000\n\r]/g, ''); // 空白・改行を正規化してマッチング精度を上げる
    if (h.includes('銘柄') || h.includes('名称')) colMap.name = i;
    if (h.includes('保有数') || h.includes('数量')) colMap.quantity = i;
    if (h.includes('取得単価')) colMap.costPerUnit = i;
    if (h.includes('現在値') || h.includes('現在価格')) colMap.currentPrice = i;
    if (h.includes('評価額') && !h.includes('損益')) colMap.value = i;
    if (h.includes('損益額') || (h.includes('損益') && !h.includes('率') && !h.includes('%'))) colMap.unrealizedPnl = i;
    if (h.includes('損益率') || h.includes('損益(%)')) colMap.unrealizedPnlRate = i;
    if (hn.includes('保有金融機関') || hn.includes('口座種類') || hn.includes('口座名義') || hn.includes('金融機関名') || hn.includes('機関名')) colMap.institution = i;
  });

  return colMap;
}

function isHeaderRow(cellTexts) {
  const headerKeywords = [
    '銘柄コード', '銘柄名', '保有数', '数量',
    '取得単価', '現在値', '現在価格',
    '評価額', '損益額', '損益率', '保有金融機関',
  ];
  return cellTexts.some(cell => headerKeywords.some(kw => cell.includes(kw)));
}

function isSummaryRow(cellTexts) {
  const summaryKeywords = ['合計', '小計', '合計利益', '評価額合計', '合計金額'];
  // includes() で「ポイント・マイル（合計）」「年金（合計）」等の複合形式も捕捉
  return cellTexts.some(cell =>
    summaryKeywords.some(kw => cell.trim().includes(kw))
  );
}

function detectAssetType(symbol) {
  if (!symbol) return "CASH";
  if (/^\d{4,5}$/.test(symbol)) return "STOCK_JP";
  if (/^[A-Z]{1,6}$/.test(symbol)) return "STOCK_US";
  // 日本ファンドコード: 英数字混在の4〜5文字（例: "314A", "2865B"）
  if (/^[A-Z0-9]{4,5}$/.test(symbol) && /[A-Z]/.test(symbol) && /\d/.test(symbol)) return "FUND";
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
  await saveSnapshot(page, '00_after_login');
}

/**
 * カードブロックのテキストをパースして { cardName, withdrawalDate, amountJpy, status } を返す
 * ブロックが有効なカードでなければ null を返す
 */
export function parseCardBlock(blockText) {
  const lines = blockText.split('\n').map(l => l.trim()).filter(l => l);

  // カード名: 「金融機関サービスサイトへ」を含む行から抽出
  let cardName = '不明';
  // テキストベースでカード名を取得（「金融機関サービスサイトへ」は CSS 非表示で innerText に出ないため）
  // 最初の「意味のある行」= カード名
  const skipPatterns = ['取得日時', 'ステータス', '編集', '更新', '引き落とし', '利用残高', 'ポイント', '未払金'];
  const firstMeaningful = lines.find(l =>
    l.length > 1 &&
    !skipPatterns.some(p => l.includes(p)) &&
    !l.match(/^-?[\d,]+円?$/) &&   // 金額行を除外
    !l.match(/^\*+$/)              // マスク文字列を除外
  );
  if (firstMeaningful) cardName = firstMeaningful;
  const cardLine = lines.find(l => l.includes('金融機関サービスサイトへ'));
  if (cardLine) {
    const sameLine = cardLine.replace('金融機関サービスサイトへ', '').trim();
    if (sameLine) {
      // 同行にカード名が含まれる場合（例: "SBIカード 金融機関サービスサイトへ"）
      cardName = sameLine;
    } else {
      // 「金融機関サービスサイトへ」が単独行の場合、その前の行をカード名として使用
      const anchorIdx = lines.findIndex(l => l.includes('金融機関サービスサイトへ'));
      cardName = anchorIdx > 0 ? lines[anchorIdx - 1] : (lines[0] || '不明');
    }
  }
  if (!cardName || cardName === '') {
    // 後続フォールバックで補完するため、ここでは '不明' にとどめる
    cardName = '不明';
  }

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

  // amountJpy が null の場合、引き落とし日がある行の前後から数値を再試行、それでも取れなければ 0 をデフォルト値として使用
  if (amountJpy === null) {
    if (withdrawalDate) {
      const dateIdx = lines.findIndex(l => l.includes('引き落とし日:'));
      // 前後2行の範囲で数値を探す
      for (const offset of [-1, 1, -2, 2]) {
        const idx = dateIdx + offset;
        if (idx >= 0 && idx < lines.length) {
          const m = lines[idx].match(/-?([\d,]+)/);
          if (m) { amountJpy = parseCardAmount(m[1]); if (amountJpy !== null) break; }
        }
      }
      // 引き落とし額の候補をより広く探す
      if (amountJpy === null) {
        for (const line of lines) {
          if (line.includes('円') || /[\d,]{4,}/.test(line)) {
            const m = line.replace(/,/g, '').match(/-?([\d]+)円?/);
            if (m) {
              const n = parseInt(m[1]);
              if (n >= 100) { amountJpy = n; break; }
            }
          }
        }
      }
      if (amountJpy === null) amountJpy = 0; // 引き落とし日がある場合のデフォルト値
    } else {
      return null; // 引き落とし日もなければスキップ
    }
  }

  // 引き落とし口座: 2段階 regex で抽出（Step3のマスクID取得は削除）
  let bankAccount = undefined;
  const bankStep1 = blockText.match(/引き落とし|ご返済.*?(?:口座|銀行)[\s：:]*([^\n※]+)/i);
  if (bankStep1?.[1]) {
    bankAccount = bankStep1[1].trim() || undefined;
  } else {
    const bankStep2 = blockText.match(/([^\n]*銀行[^\n]*)/i);
    if (bankStep2?.[1]) {
      bankAccount = bankStep2[1].trim() || undefined;
    }
    // Step3（マスクID取得）は削除: bankAccount は undefined のまま
  }

  // 「金融機関サービスサイトへ」が見つからない場合のフォールバック
  if (cardName === '不明') {
    const cardKeywords = ['カード', 'Card', 'VISA', 'Mastercard', 'JCB', 'AMEX', '楽天', '三井住友', 'PayPay', 'Paidy', 'エポス', 'イオン', 'SBI'];
    const cardLine2 = lines.find(l => cardKeywords.some(kw => l.includes(kw)) && !l.includes('引き落とし') && !l.includes('残高'));
    if (cardLine2) {
      cardName = cardLine2.trim();
    } else if (lines.length > 0) {
      const firstMeaningfulLine = lines.find(l =>
        !l.includes('引き落とし') &&
        !l.match(/^\d{4}\/\d{2}\/\d{2}$/) &&
        !l.match(/^[\d,]+円?$/) &&
        l.length > 1
      );
      if (firstMeaningfulLine) cardName = firstMeaningfulLine;
    }
  }
  // それでも取れない場合、引き落とし日がある行があれば null は返さない（カード名不明として記録）
  if (!cardName || cardName === '不明') {
    if (!withdrawalDate) return null; // 日付も名前もなければスキップ
    cardName = '不明のカード';
  }
  return { cardName: cardName.slice(0, 100), withdrawalDate, amountJpy, status: 'scheduled', bankAccount };
}

/**
 * アンカーリンク経由でクレカ情報を取得
 * BASE_URL と /bs/portfolio の左カラムを対象に「金融機関サービスサイトへ」
 * アンカーを起点にカードブロックを解析する。3枚未満の場合は次の URL を試みる。
 * @param {import('playwright').Page} page
 * @returns {Promise<{cardName:string, withdrawalDate:string|null, amountJpy:number, status:string}[]>}
 */
export async function scrapeCardsByAnchor(page) {
  const results = [];
  // BASE_URL と /bs/portfolio の左カラムを順番に試みる
  // /bs/portfolio はすべてのクレカが左カラムに表示される
  const urlsToTry = [BASE_URL];

  for (const url of urlsToTry) {
    if (results.length >= 3) break; // 3枚取得済みなら終了
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000));
      process.stderr.write(`[browser-scraper] scrapeCardsByAnchor: URL=${page.url()}\n`);

      const cardBlocks = await page.evaluate(() => {
        // 「引き落とし日:」はクレカ固有キーワード（銀行口座・年金には存在しない）
        // > li で直接の子要素のみ取得（入れ子の li を除外するため）
        const topLevelLis = document.querySelectorAll('.facilities.accounts-list > li');
        if (topLevelLis.length > 0) {
          const cardLis = Array.from(topLevelLis).filter(li =>
            li.innerText.includes('引き落とし日:')
          );
          if (cardLis.length > 0) {
            return cardLis.map(li => li.innerText.trim());
          }
        }
        // フォールバック: ページ全体で「引き落とし日:」を含む最上位 li を探す
        // closest('li') で祖先に li がないものだけを取得し入れ子を除外する
        const fallbackLis = Array.from(document.querySelectorAll('li')).filter(li =>
          li.innerText.includes('引き落とし日:') &&
          !li.parentElement.closest('li')
        );
        return fallbackLis.map(li => li.innerText.trim()).filter(t => t.length > 10);
      });

      process.stderr.write(`[browser-scraper] Card anchors found: ${cardBlocks.length} on ${url}\n`);
      for (let i = 0; i < cardBlocks.length; i++) {
        process.stderr.write(`[browser-scraper] Card block[${i}]: ${cardBlocks[i].slice(0, 300)}\n`);
      }

      const seen = new Set(results.map(r => r.cardName));
      for (const blockText of cardBlocks) {
        const parsed = parseCardBlock(blockText);
        if (parsed) {
          if (!seen.has(parsed.cardName)) {
            seen.add(parsed.cardName);
            process.stderr.write(`[browser-scraper] Parsed card: ${JSON.stringify(parsed)}\n`);
            results.push(parsed);
          }
        } else {
          process.stderr.write(`[browser-scraper] parseCardBlock returned null for block: ${blockText.slice(0, 100)}\n`);
        }
      }

      process.stderr.write(`[browser-scraper] Credit withdrawals so far: ${results.length} (url=${url})\n`);
    } catch (e) {
      process.stderr.write(`[browser-scraper] scrapeCardsByAnchor error on ${url}: ${e.message}\n`);
    }
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

      const creditKeywords = ['カード', '引き落とし', '引落', 'クレジット', 'VISA', 'Mastercard', 'JCB', 'AMEX', '楽天', '三井住友', 'Paidy'];
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
 * scrapeCardsByAnchor と scrapeCardsByDl の両方を常に実行し、
 * 両ソースの結果を cardName でマージ・重複排除して返す。
 * @param {import('playwright').Page} page
 * @returns {Promise<{cardName:string, withdrawalDate:string|null, amountJpy:number, status:string}[]>}
 */
export async function scrapeCreditCardWithdrawals(page) {
  const anchorResults = await scrapeCardsByAnchor(page);
  await saveSnapshot(page, '02_credit');
  // 両方を常に実行し、cardName で重複排除してマージする
  const dlResults = await scrapeCardsByDl(page);

  // cardName をキーに重複排除してマージ
  const seen = new Set();
  return [...anchorResults, ...dlResults].filter(item => {
    const key = `${item.cardName}|${item.withdrawalDate ?? ""}|${item.amountJpy ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapePortfolio(page) {
  await page.goto(`${BASE_URL}/bs/portfolio`, { waitUntil: "networkidle" });
  await saveSnapshot(page, '01_portfolio');
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
  // NOTE: 旧実装の「全テーブル tr 一括 querySelectorAll」ではなくテーブル単位で走査し、
  //       各テーブルの直前セクション見出しと tableIndex を付与する。
  //       こうすることでサマリーテーブル → 個別保有テーブルの境界を Node.js 側で検知でき、
  //       currentCategory が前テーブルの末尾カテゴリ（POINT 等）に汚染されるバグを防ぐ。
  const tableData = await page.evaluate(() => {
    const results = [];
    const allTables = Array.from(document.querySelectorAll('table'));

    allTables.forEach((table, tableIdx) => {
      // 各テーブルの直前セクション見出し（h2-h6）を複数パターンで探す
      let sectionHeading = null;

      // パターン1: テーブルの直前の兄弟要素を最大5つ遡って見出しを探す
      let el = table.previousElementSibling;
      for (let i = 0; i < 5 && el && !sectionHeading; i++, el = el.previousElementSibling) {
        if (/^H[2-6]$/.test(el.tagName)) {
          sectionHeading = el.innerText.trim();
        }
      }

      // パターン2: テーブルを囲む section / asset系 div の内部見出しを探す
      if (!sectionHeading) {
        const container = table.closest('section, [class*="asset"], [class*="category"], [class*="section"]');
        if (container) {
          const heading = container.querySelector('h2, h3, h4, h5, h6');
          if (heading) sectionHeading = heading.innerText.trim();
        }
      }

      // パターン3: 親要素の直前兄弟を3つ遡って見出しを探す
      if (!sectionHeading && table.parentElement) {
        let pel = table.parentElement.previousElementSibling;
        for (let i = 0; i < 3 && pel && !sectionHeading; i++, pel = pel.previousElementSibling) {
          if (/^H[2-6]$/.test(pel.tagName)) sectionHeading = pel.innerText.trim();
        }
      }

      // パターン4: MF固有 - テーブルを囲む li/div[class*="account"] や [class*="group"] の中の名前要素
      if (!sectionHeading) {
        const accountContainer = table.closest(
          'li[class*="account"], li[class*="group"], div[class*="account"], div[class*="group"], ' +
          '[class*="service"], [class*="institution"]'
        );
        if (accountContainer) {
          const nameEl = accountContainer.querySelector(
            '[class*="name"], [class*="title"], [class*="service-logo"], ' +
            'h2, h3, h4, h5, h6, p'
          );
          if (nameEl) sectionHeading = nameEl.innerText.trim();
        }
      }

      // パターン5: テーブル直前の div/p/span でリンクを含むもの（金融機関リンク行）
      if (!sectionHeading) {
        let el = table.previousElementSibling;
        for (let i = 0; i < 10 && el && !sectionHeading; i++, el = el.previousElementSibling) {
          if (/^(DIV|P|SPAN|LI)$/.test(el.tagName)) {
            const a = el.querySelector('a');
            const text = (a ? a.innerText : el.innerText).trim();
            if (text && text.length > 1 && !text.startsWith('\u2039') && !text.startsWith('\u203A') &&
                !text.startsWith('<') && !text.startsWith('>')) {
              sectionHeading = text;
            }
          }
        }
      }

      for (const row of table.querySelectorAll('tr')) {
        const cells = row.querySelectorAll('td, th');
        const cellTexts = Array.from(cells).map(c => c.innerText.trim());
        // カテゴリ行・金融機関行のリンクテキストを取得
        // th>a を優先し、次に td:first-child>a も確認（MF の一部ページは td にリンクを置く）
        const thAnchor = row.querySelector('th a') || row.querySelector('td:first-child a');
        const thAnchorText = thAnchor ? thAnchor.innerText.trim() : null;
        results.push({ cellTexts, thAnchorText, tableIndex: tableIdx, sectionHeading });
      }
    });

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

  let currentInstitution = "";
  let lastCashInstitution = ""; // CASH専用: POINTセクション通過後の汚染を防ぐ
  let currentCategory = "CASH";
  let lastTableIndex = -1; // テーブル境界検知用

  for (const { cellTexts, thAnchorText, tableIndex, sectionHeading } of tableData) {
    // ── テーブル境界リセット ──────────────────────────────────────────────────
    // 新しいテーブルに入ったとき:
    //   1) currentInstitution / lastCashInstitution をリセット
    //   2) テーブル直前のセクション見出しが CATEGORY_MAP に一致すれば currentCategory を更新
    //      → サマリーテーブルの末尾カテゴリ（POINT 等）が後続の保有テーブルに残留するバグを防ぐ
    if (tableIndex !== lastTableIndex) {
      lastTableIndex = tableIndex;
      currentInstitution = "";
      lastCashInstitution = "";

      if (sectionHeading) {
        // 完全一致を先に試みる
        const catFromHeading = CATEGORY_MAP[sectionHeading];
        if (catFromHeading) {
          currentCategory = catFromHeading;
          process.stderr.write(`[browser-scraper] Table[${tableIndex}] heading="${sectionHeading}" → category=${currentCategory}\n`);
        } else {
          let matched = false;
          for (const [key, val] of Object.entries(CATEGORY_MAP)) {
            if (sectionHeading.includes(key)) {
              currentCategory = val;
              process.stderr.write(`[browser-scraper] Table[${tableIndex}] heading contains "${key}" → category=${currentCategory}\n`);
              matched = true;
              break;
            }
          }
          // CATEGORY_MAP にマッチしない見出し = 金融機関名として扱う
          if (!matched && sectionHeading.length > 0 && 
              !sectionHeading.startsWith('\u2039') && !sectionHeading.startsWith('\u203A')) {
            currentInstitution = sectionHeading;
            lastCashInstitution = sectionHeading;
            process.stderr.write(`[browser-scraper] Table[${tableIndex}] institution from heading="${sectionHeading}"\n`);
          }
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    const count = cellTexts.length;

    if (count >= 1 && count <= 4) {
      // count=1 はカテゴリ行ではなく金融機関名行（colspan行）の可能性が高い
      if (count === 1) {
        const text = (cellTexts[0] ?? "").trim();
        if (text && !text.startsWith('\u2039') && !text.startsWith('\u203A') &&
            !text.startsWith('<') && !text.startsWith('>')) {
          const isCalendarText = (
            /^\d{4}(\d{4}){3,}/.test(text) ||           // 年の連結文字列（"20192020202120222023..."）
            /^(\d{1,2}月\s*){3,}/.test(text) ||         // 月の連結文字列（"1月2月3月..."）
            /^\d+$/.test(text) ||                        // 純粋な数字のみ
            text.length > 80                             // 長すぎるテキスト（金融機関名は通常30文字以下）
          );
          if (!isCalendarText) {
            currentInstitution = text;
            lastCashInstitution = text;
            process.stderr.write(`[browser-scraper] institution(colspan) "${text}"\n`);
          }
        }
        continue;
      }
      // ページネーション行（‹ や › だけのセル）は完全スキップ
      const firstCellText = (cellTexts[0] ?? "").trim();
      if (firstCellText.startsWith('\u2039') || firstCellText.startsWith('\u203A') ||
          firstCellText === '<' || firstCellText === '>') {
        continue;
      }
      // DOM順序デバッグ: カテゴリ行を全て出力
      process.stderr.write(`[DEBUG CAT] count=${count}, anchor="${thAnchorText}", text="${cellTexts[0]}", holdings=${holdings.length}\n`);
      if (thAnchorText) {
        const catName = thAnchorText;
        // cellTexts[0]=カテゴリ名(th), cellTexts[1]=金額(td), cellTexts[2]=割合(td)
        const tdText = cellTexts[1];
        const assetType = CATEGORY_MAP[catName];
        if (assetType) {
          categories[assetType] = parseAmount(tdText);
          currentCategory = assetType;
          currentInstitution = "";
          lastCashInstitution = "";
        } else {
          // CATEGORY_MAP にない th>a（機関名リンクなど）は機関名として追跡
          // ページネーション要素（‹, ›）は機関名として扱わない
          if (!/^[‹›<>]$/.test(thAnchorText.trim())) {
            currentInstitution = catName;
            lastCashInstitution = catName;
          }
        }
      } else {
        const possibleInstitution = (cellTexts[0] ?? "").trim();
        if (possibleInstitution) {
          currentInstitution = possibleInstitution;
          lastCashInstitution = possibleInstitution;
        }
      }
    } else if (count >= 13) {
      if (isHeaderRow(cellTexts)) continue;
      if (isSummaryRow(cellTexts)) continue;
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
      // ゴミ行フィルタ: 銘柄名が意味のある文字列（ページネーション要素などを除外）
      const nameIsValid = name.length > 1 
        && !name.startsWith('\u2039') && !name.startsWith('\u203A')
        && !name.startsWith('<') && !name.startsWith('>')
        && !codeCandidate.startsWith('\u2039') && !codeCandidate.startsWith('\u203A');
      if (name && valueJpy > 0 && nameIsValid) {
        // td[0] が銘柄コードらしい（英数字のみ）場合はそれを優先
        // そうでなければ銘柄名から括弧内シンボルを抽出、最後の手段は銘柄名の先頭10文字
        let symbol;
        if (codeCandidate && /^[A-Z0-9]{1,8}$/.test(codeCandidate)) {
          symbol = codeCandidate;
        } else if (codeCandidate && /^\d{4,5}$/.test(codeCandidate)) {
          symbol = codeCandidate;
        } else {
          const symbolMatch = name.match(/[（(]([A-Z0-9]{1,8})[）)]/);
          const safeCandidate = codeCandidate && !/[\u2039\u203A<>]/.test(codeCandidate)
            ? codeCandidate
            : null;
          symbol = symbolMatch ? symbolMatch[1] : safeCandidate || name.slice(0, 10).replace(/\s/g, "");
        }
        const quantity = parseAmount(cellTexts[quantityIdx] ?? "0");
        const costPerUnitJpy = parseAmount(cellTexts[costPerUnitIdx] ?? "0");
        const priceJpy = quantity > 0 ? valueJpy / quantity : 0;
        const costBasisJpy = costPerUnitJpy * quantity;
        // detectAssetType が CASH を返す場合のみ currentCategory で補正（FUND/PENSION/POINT 対応）
        // STOCK_JP/STOCK_US は detectAssetType(symbol) で確定できるため変更しない
        const detectedType = detectAssetType(symbol);
        const resolvedType = (detectedType === 'CASH' && currentCategory !== 'CASH')
          ? currentCategory
          : detectedType;
        const rowInstitution = (colMap.institution >= 0 && cellTexts[colMap.institution]?.trim())
          ? cellTexts[colMap.institution].trim()
          : null;
        holdings.push({
          symbol, name,
          assetType: resolvedType,
          valueJpy, unrealizedPnlJpy,
          quantity, priceJpy, costBasisJpy, costPerUnitJpy,
          institutionName: rowInstitution || currentInstitution || null,
          dividendFrequency: null,
          dividendAmount: null,
          dividendRate: null,
          exDividendDate: null,
          nextExDividendDate: null,
          distributionType: null,
          lastDividendUpdate: null,
        });
      }
    } else if (count === 5) {
      const name = cellTexts[0] ?? "";
      const balance = parseAmount(cellTexts[1] ?? "0");
      if (holdings.length < 3) {
        process.stderr.write(`[DEBUG] cash row: count=${count}, name="${name}", balance="${cellTexts[1]}"\n`);
      }
      if (name && balance > 0 && !/[\u2039\u203A]/.test(name) && !/^\d+$/.test(name)) {
        // 保有金融機関: colMap で取得できない場合は CASH テーブルの固定位置（index 2）から直接読む
        const cashInstitution = (colMap.institution >= 0 && cellTexts[colMap.institution]?.trim())
          ? cellTexts[colMap.institution].trim()
          : (cellTexts.length > 2 ? (cellTexts[2]?.trim() || null) : null);
        const fullName = lastCashInstitution ? `${lastCashInstitution}[${name}]` : name;
        holdings.push({
          symbol: "", name: fullName, assetType: currentCategory,
          valueJpy: balance, unrealizedPnlJpy: 0,
          quantity: balance, priceJpy: 1, costBasisJpy: balance, costPerUnitJpy: 1,
          institutionName: cashInstitution || currentInstitution || null,
          dividendFrequency: null,
          dividendAmount: null,
          dividendRate: null,
          exDividendDate: null,
          nextExDividendDate: null,
          distributionType: null,
          lastDividendUpdate: null,
        });
      }
    } else if (count >= 6 && count < 13) {
      if (isHeaderRow(cellTexts)) continue;
      if (isSummaryRow(cellTexts)) continue;
      // 投資信託・年金など中間列数の行（cashより多く、株式テーブルより少ない）
      // 評価額は後ろから3列目を想定（損益率・損益額・評価額の並び）
      const name = cellTexts[0] ?? "";
      const valIdx = count - 3;
      const balance = parseAmount(cellTexts[valIdx] ?? cellTexts[1] ?? "0");
      if (holdings.length < 3) {
        process.stderr.write(`[DEBUG] fund/pension row: count=${count}, name="${name}", balance="${cellTexts[valIdx]}"\n`);
      }
      // ゴミ行フィルタ: 名前が意味のある文字列のみ受け付ける
      const isValidName = name.length > 1 
        && !/[\u2039\u203A]/.test(name)  // ‹/› ページネーション要素を除外
        && !name.startsWith('<')
        && !/^\s*$/.test(name)
        && !/^\d+$/.test(name);          // 数字のみの名前を除外（カレンダー月数等）
      if (name && balance > 0 && isValidName) {
        const fullName = currentInstitution ? `${currentInstitution}[${name}]` : name;
        holdings.push({
          symbol: "", name: fullName, assetType: currentCategory,
          valueJpy: balance, unrealizedPnlJpy: 0,
          quantity: balance, priceJpy: 1, costBasisJpy: balance, costPerUnitJpy: 1,
          institutionName: currentInstitution || null,
          dividendFrequency: null,
          dividendAmount: null,
          dividendRate: null,
          exDividendDate: null,
          nextExDividendDate: null,
          distributionType: null,
          lastDividendUpdate: null,
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
