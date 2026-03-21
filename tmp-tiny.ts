import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 全snapshotの最新（MAX(date)以外のものも含む）
const allSnaps = db.query(`
  SELECT a.id, a.name, a.symbol, a.asset_type, a.is_active, ps.date, ps.value_jpy, ps.quantity
  FROM assets a
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id
  WHERE ps.value_jpy BETWEEN 1 AND 50
  ORDER BY ps.value_jpy ASC
`).all();
console.log("1-50円の全スナップショット:");
console.log(JSON.stringify(allSnaps, null, 2));

// nameやsymbolが短い資産（1-3文字）
const shortSymbols = db.query(`
  SELECT id, name, symbol, is_active
  FROM assets
  WHERE length(symbol) <= 5
  ORDER BY id
`).all();
console.log("\n短いシンボル（5文字以下）:");
console.log(JSON.stringify(shortSymbols, null, 2));

// 全assets確認（最新snapshotのvalue_jpy < 100）
const tiny = db.query(`
  SELECT a.id, a.name, a.symbol, a.is_active, ps.value_jpy, ps.quantity
  FROM assets a
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
    AND ps.value_jpy < 100
  ORDER BY ps.value_jpy ASC
`).all();
console.log("\n100円未満の資産（最新スナップショット）:");
console.log(JSON.stringify(tiny, null, 2));

db.close();
