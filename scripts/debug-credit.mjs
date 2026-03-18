/**
 * debug-credit.mjs — クレジットカード引き落とし情報の HTML 構造調査スクリプト
 * Usage: node scripts/debug-credit.mjs
 */

import { chromium } from 'playwright';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';

const BASE_URL = 'https://ssnb.x.moneyforward.com';
const DB_PATH = resolve('data/assetbridge_v2.db');

async function main() {
  const db = new Database(DB_PATH);
  const sessionRow = db.prepare("SELECT cookies_json as value FROM crawler_sessions WHERE name = 'mf_sbi_bank'").get();
  if (!sessionRow) {
    console.error('No session found in DB. Run a scrape first.');
    process.exit(1);
  }

  const cookies = JSON.parse(sessionRow.value);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  // ホームページ確認
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));
  console.log('=== Home URL:', page.url(), '===');

  // 引き落とし関連テキストを探す
  const creditItems = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const t = (el.innerText || '').trim();
      if (t && (t.includes('引き落とし') || t.includes('口座引落') || t.includes('クレジット') || t.includes('引落') || t.includes('予定') || t.includes('カード'))) {
        results.push({
          tag: el.tagName,
          class: el.className,
          text: t.slice(0, 100),
          parentClass: el.parentElement?.className,
          grandParentClass: el.parentElement?.parentElement?.className,
        });
      }
    }
    return results.slice(0, 30);
  });

  console.log('=== Credit items on home page ===');
  console.log(JSON.stringify(creditItems, null, 2));

  // /bs/cf (キャッシュフロー) を確認
  try {
    await page.goto(BASE_URL + '/bs/cf', { waitUntil: 'networkidle', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    console.log('\n=== /bs/cf URL:', page.url(), '===');

    const cfItems = await page.evaluate(() => {
      const rows = [];
      for (const tr of document.querySelectorAll('table tr')) {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim());
        if (cells.length > 0 && cells.some(c => c.includes('カード') || c.includes('引き落') || c.includes('引落'))) {
          rows.push({ cells, rowClass: tr.className });
        }
      }
      return rows.slice(0, 20);
    });
    console.log('CF credit items:', JSON.stringify(cfItems, null, 2));

    // ページ全体のテキスト（最初の5000文字）
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 5000));
    console.log('\n=== /bs/cf Body text (first 5000 chars) ===');
    console.log(bodyText);

    // テーブル構造全体
    const allRows = await page.evaluate(() => {
      const rows = [];
      for (const tr of document.querySelectorAll('table tr')) {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim());
        if (cells.length > 0) rows.push({ cells: cells.slice(0, 6), rowClass: tr.className });
      }
      return rows.slice(0, 50);
    });
    console.log('\n=== /bs/cf All table rows (first 50) ===');
    console.log(JSON.stringify(allRows, null, 2));

  } catch (e) {
    console.log('/bs/cf error:', e.message);
  }

  // /cf (キャッシュフロー別URL) を確認
  try {
    await page.goto(BASE_URL + '/cf', { waitUntil: 'networkidle', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    console.log('\n=== /cf URL:', page.url(), '===');
    const bodyText2 = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log(bodyText2);
  } catch (e) {
    console.log('/cf error:', e.message);
  }

  // /accounts (口座一覧) も確認
  try {
    await page.goto(BASE_URL + '/accounts', { waitUntil: 'networkidle', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    console.log('\n=== /accounts URL:', page.url(), '===');

    const accountCreditItems = await page.evaluate(() => {
      const results = [];
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length > 0) continue;
        const t = (el.innerText || '').trim();
        if (t && (t.includes('引き落とし') || t.includes('クレジット') || t.includes('引落') || t.includes('カード'))) {
          results.push({
            tag: el.tagName,
            text: t.slice(0, 100),
            parentClass: el.parentElement?.className,
          });
        }
      }
      return results.slice(0, 20);
    });
    console.log('Accounts credit items:', JSON.stringify(accountCreditItems, null, 2));
  } catch (e) {
    console.log('/accounts error:', e.message);
  }

  await browser.close();
  db.close();
}

main().catch(console.error);
