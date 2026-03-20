import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

console.log("=== Duplicate snapshots (same asset_id + date) ===");
const dupes = db.query(`
  SELECT asset_id, date, COUNT(*) cnt
  FROM portfolio_snapshots
  GROUP BY asset_id, date
  HAVING cnt > 1
  ORDER BY cnt DESC LIMIT 10
`).all() as any[];
if (dupes.length === 0) console.log("(none)");
else dupes.forEach((r) => console.log("asset_id:", r.asset_id, "date:", r.date, "count:", r.cnt));

console.log("\n=== POINT assets sample ===");
const points = db.query(`
  SELECT a.id, a.name, a.asset_type, ps.value_jpy, ps.date
  FROM portfolio_snapshots ps
  JOIN assets a ON ps.asset_id=a.id
  WHERE a.asset_type='POINT' AND ps.date='2026-03-20'
  LIMIT 15
`).all() as any[];
points.forEach((r) => console.log(r.id, "|", r.name, "|", r.value_jpy, "|", r.date));

console.log("\n=== STOCK_US currency in assets ===");
const us = db.query("SELECT symbol, currency FROM assets WHERE asset_type='STOCK_US'").all() as any[];
us.forEach((r) => console.log(r.symbol, r.currency));
