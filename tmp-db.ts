import { Database } from "bun:sqlite";

const db = new Database("data/assetbridge_v2.db");

// テーブル一覧
const tables = db.query('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name').all();
console.log("=== テーブル一覧 ===");
console.log(tables.map(t => t.name).join(", "));
db.close();
