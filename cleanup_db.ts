import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 偽POINT（ID 48-98）のスナップショットを削除
db.run("DELETE FROM portfolio_snapshots WHERE asset_id >= 48");

// 偽POINT資産を削除
db.run("DELETE FROM assets WHERE id >= 48");

// 確認
const count = db.query("SELECT COUNT(*) cnt FROM assets").get() as any;
console.log("Remaining assets:", count.cnt); // 47であるべき

const snapCount = db.query("SELECT COUNT(*) cnt FROM portfolio_snapshots WHERE date='2026-03-20'").get() as any;
console.log("2026-03-20 snapshots:", snapCount.cnt); // 47以下になるべき
