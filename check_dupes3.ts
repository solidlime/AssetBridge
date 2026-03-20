import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 問題の全容確認
console.log("=== All assets with type ===");
const all = db.query("SELECT id, symbol, name, asset_type FROM assets ORDER BY id").all() as any[];
all.forEach((r) => console.log(r.id, r.asset_type, "|", r.name));

console.log("\n=== portfolio_snapshots for 2026-03-20 - wrong POINT assets ===");
const wrong = db.query(`
  SELECT ps.id, ps.asset_id, a.name, a.asset_type, ps.value_jpy
  FROM portfolio_snapshots ps
  JOIN assets a ON ps.asset_id=a.id
  WHERE a.asset_type='POINT' AND ps.date='2026-03-20'
  AND a.name IN ('Kyash残高','Suica','楽天キャッシュ','SBIハイパー預金','七尾支店 普通')
`).all() as any[];
wrong.forEach((r) => console.log(r.id, r.asset_id, r.asset_type, "|", r.name, r.value_jpy));
