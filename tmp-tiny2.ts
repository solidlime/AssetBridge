import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

const cols = db.query("PRAGMA table_info(assets)").all();
console.log("assetsカラム:", cols.map(c => c.name).join(", "));

// 全assets確認（最新snapshotのvalue_jpy < 100）
const tiny = db.query(`
  SELECT a.id, a.name, a.symbol, ps.value_jpy, ps.quantity
  FROM assets a
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
    AND ps.value_jpy < 100
  ORDER BY ps.value_jpy ASC
`).all();
console.log("\n100円未満の資産（最新スナップショット）:");
console.log(JSON.stringify(tiny, null, 2));

// 全資産（最新）の件数
const total = db.query("SELECT COUNT(*) as cnt FROM portfolio_snapshots WHERE date = (SELECT MAX(date) FROM portfolio_snapshots)").get();
console.log("\n最新スナップショット件数:", total?.cnt);

// symbolで‹ U+003C以外の全文字を確認
const allSymbols = db.query("SELECT id, name, symbol FROM assets ORDER BY id").all();
console.log("\n全シンボル一覧（最初の20件）:");
allSymbols.slice(0, 20).forEach(a => {
  const bytes = Buffer.from(a.symbol || "", 'utf8');
  console.log(`id=${a.id} symbol="${a.symbol}" bytes=[${Array.from(bytes.slice(0,6)).map(b => '0x'+b.toString(16))}]`);
});

db.close();
