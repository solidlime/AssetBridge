import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

const cols = db.query("PRAGMA table_info(assets)").all();
console.log("=== assets テーブルスキーマ ===");
console.log(JSON.stringify(cols, null, 2));

const ccCols = db.query("PRAGMA table_info(credit_card_withdrawals)").all();
console.log("\n=== credit_card_withdrawals スキーマ ===");
console.log(JSON.stringify(ccCols, null, 2));

const snapCols = db.query("PRAGMA table_info(portfolio_snapshots)").all();
console.log("\n=== portfolio_snapshots スキーマ ===");
console.log(JSON.stringify(snapCols, null, 2));

db.close();
