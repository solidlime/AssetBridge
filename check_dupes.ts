import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

console.log("=== Duplicate assets ===");
const dupes = db.query("SELECT symbol, asset_type, COUNT(*) cnt FROM assets GROUP BY symbol, asset_type HAVING cnt > 1").all() as any[];
if (dupes.length === 0) console.log("(none)");
else dupes.forEach((r) => console.log(r.symbol, r.asset_type, "x", r.cnt));

console.log("\n=== CASH assets ===");
const cash = db.query("SELECT id, symbol, name, asset_type FROM assets WHERE asset_type='CASH'").all() as any[];
cash.forEach((r) => console.log(r.id, "|", r.name));

console.log("\n=== Latest snapshot asset_type count ===");
const snap = db.query(`
  SELECT a.asset_type, COUNT(*) cnt 
  FROM portfolio_snapshots ps 
  JOIN assets a ON ps.asset_id=a.id 
  WHERE ps.date=(SELECT MAX(date) FROM portfolio_snapshots) 
  GROUP BY a.asset_type
`).all() as any[];
snap.forEach((r) => console.log(r.asset_type, r.cnt));

console.log("\n=== portfolio_snapshots date range ===");
const dates = db.query("SELECT date, COUNT(*) cnt FROM portfolio_snapshots GROUP BY date ORDER BY date DESC LIMIT 5").all() as any[];
dates.forEach((r) => console.log(r.date, r.cnt));
