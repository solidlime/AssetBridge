import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

const all = db.query(`
  SELECT a.id, a.name, a.symbol, a.asset_type, ps.value_jpy, ps.quantity, ps.price_jpy
  FROM assets a
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
  ORDER BY ps.value_jpy DESC
`).all();
console.log("全資産一覧（最新）", all.length, "件:");
console.log(JSON.stringify(all, null, 2));

db.close();
