/**
 * DB 確認スクリプト
 * portfolio_snapshots, credit_card_withdrawals, 及び STOCK_JP のデータを確認する
 */

import { Database } from 'bun:sqlite';

const db = new Database('data/assetbridge_v2.db');

function checkDatabase() {
  console.log("\n====== DB CHECK ======\n");

  // 1. credit_card_withdrawals を全件確認
  console.log("--- Credit Card Withdrawals (全件) ---");
  try {
    const withdrawals = db.prepare(
      `SELECT id, card_name, amount_jpy, withdrawal_date, status FROM credit_card_withdrawals ORDER BY withdrawal_date DESC`
    ).all();
    
    console.log(`Total records: ${withdrawals.length}`);
    if (withdrawals.length > 0) {
      console.log("\nAll withdrawals:");
      withdrawals.forEach((w) => {
        console.log(
          `  [${w.id}] ${w.card_name}: ¥${w.amount_jpy.toLocaleString('ja-JP')} on ${w.withdrawal_date} (${w.status})`
        );
      });
    } else {
      console.log("  No records found");
    }
  } catch (e) {
    console.log(`  Error: ${e}`);
  }

  // 2. portfolio_snapshots の最新情報を確認
  console.log("\n--- Portfolio Snapshots (最新10件) ---");
  try {
    const snapshots = db.prepare(
      `SELECT ps.id, ps.date, a.symbol, a.asset_type, ps.quantity, ps.price_jpy, ps.value_jpy, ps.cost_per_unit_jpy
       FROM portfolio_snapshots ps
       JOIN assets a ON ps.asset_id = a.id
       ORDER BY ps.date DESC, ps.id DESC
       LIMIT 10`
    ).all();
    
    console.log(`Latest 10 records: ${snapshots.length} found`);
    if (snapshots.length > 0) {
      snapshots.forEach((snap) => {
        console.log(
          `  [${snap.id}] ${snap.date} | ${snap.symbol} (${snap.asset_type}): ${snap.quantity} @ ¥${snap.price_jpy} = ¥${snap.value_jpy.toLocaleString('ja-JP')}`
        );
      });
    } else {
      console.log("  No snapshots found");
    }
  } catch (e) {
    console.log(`  Error: ${e}`);
  }

  // 3. STOCK_JP アセットをサンプル確認
  console.log("\n--- STOCK_JP Assets (サンプル5件) ---");
  try {
    const stockJp = db.prepare(
      `SELECT ps.id, a.symbol, a.name, ps.quantity, ps.cost_per_unit_jpy, ps.date
       FROM portfolio_snapshots ps
       JOIN assets a ON ps.asset_id = a.id
       WHERE a.asset_type = 'STOCK_JP'
       ORDER BY ps.date DESC, a.symbol
       LIMIT 5`
    ).all();
    
    console.log(`Sample records: ${stockJp.length} found`);
    if (stockJp.length > 0) {
      stockJp.forEach((asset) => {
        console.log(
          `  [${asset.id}] ${asset.symbol}: ${asset.quantity} units @ ¥${asset.cost_per_unit_jpy} (${asset.date})`
        );
      });
    } else {
      console.log("  No STOCK_JP records found");
    }
  } catch (e) {
    console.log(`  Error: ${e}`);
  }

  console.log("\n======================\n");
}

// 実行
try {
  checkDatabase();
  db.close();
  process.exit(0);
} catch (e) {
  console.error("[DB Check] Error:", e);
  process.exit(1);
}
