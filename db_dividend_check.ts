import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

console.log("=== Assets by Type ===");
const assetByType = db.query("SELECT asset_type, COUNT(*) as cnt FROM assets GROUP BY asset_type ORDER BY asset_type").all();
console.log(JSON.stringify(assetByType, null, 2));

console.log("");
console.log("=== Stock Assets (JP & US) ===");
const stocks = db.query("SELECT id, symbol, name, asset_type FROM assets WHERE asset_type IN ('STOCK_JP', 'STOCK_US') ORDER BY symbol").all();
console.log(JSON.stringify(stocks, null, 2));

console.log("");
console.log("=== Portfolio Snapshots Statistics ===");
const snapStats = db.query("SELECT COUNT(DISTINCT asset_id) as unique_assets, COUNT(*) as total_rows, COUNT(DISTINCT date) as unique_dates FROM portfolio_snapshots").get();
console.log(JSON.stringify(snapStats, null, 2));

console.log("");
console.log("=== Latest Portfolio Snapshot Date ===");
const latestDate = db.query("SELECT date, COUNT(*) as asset_count FROM portfolio_snapshots GROUP BY date ORDER BY date DESC LIMIT 1").get();
console.log(JSON.stringify(latestDate, null, 2));

console.log("");
console.log("=== Portfolio Holdings Sample (Latest Date, Stocks Only) ===");
const latestSnapshot = db.query(`
  SELECT ps.asset_id, a.symbol, a.name, a.asset_type, ps.quantity, ps.price_jpy, ps.value_jpy
  FROM portfolio_snapshots ps
  JOIN assets a ON ps.asset_id = a.id
  WHERE a.asset_type IN ('STOCK_JP', 'STOCK_US')
  AND ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
  ORDER BY ps.value_jpy DESC
`).all();
console.log(JSON.stringify(latestSnapshot, null, 2));
