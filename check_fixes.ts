import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

console.log("=== CASH assets (institution name) ===");
const cash = db.query("SELECT name, currency FROM assets WHERE asset_type='CASH' LIMIT 10").all() as any[];
cash.forEach((r) => console.log(r.name, "|", r.currency));

console.log("\n=== STOCK_US currency ===");
const stocks = db.query("SELECT symbol, currency FROM assets WHERE asset_type='STOCK_US'").all() as any[];
stocks.forEach((r) => console.log(r.symbol, "|", r.currency));

console.log("\n=== asset_type distribution (latest snapshot) ===");
const snap = db.query(`
  SELECT a.asset_type, COUNT(*) cnt 
  FROM portfolio_snapshots ps 
  JOIN assets a ON ps.asset_id=a.id 
  WHERE ps.date=(SELECT MAX(date) FROM portfolio_snapshots) 
  GROUP BY a.asset_type
`).all() as any[];
snap.forEach((r) => console.log(r.asset_type, "|", r.cnt));

console.log("\n=== credit cards ===");
const cc = db.query("SELECT card_name, amount_jpy, withdrawal_date FROM credit_card_withdrawals").all() as any[];
if (cc.length === 0) console.log("(none)");
cc.forEach((r) => console.log(r.card_name, "|", r.amount_jpy, "|", r.withdrawal_date));
