import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 総資産（assets テーブル）
const total = db.query("SELECT SUM(current_value_jpy) as total FROM assets WHERE is_active = 1").get();
console.log("=== 総資産 ===");
console.log(JSON.stringify(total));

// 資産TOP10
const assets = db.query("SELECT name, asset_type, institution_name, current_value_jpy FROM assets WHERE is_active = 1 ORDER BY current_value_jpy DESC LIMIT 10").all();
console.log("\n=== 資産TOP10 ===");
console.log(JSON.stringify(assets, null, 2));

// 謎の銘柄
const mystery = db.query("SELECT name FROM assets WHERE name GLOB '*[<>]*' OR name LIKE '%?%' LIMIT 5").all();
console.log("\n=== 特殊文字銘柄 ===", mystery.length, "件");
if(mystery.length > 0) console.log(JSON.stringify(mystery, null, 2));

// クレカ関連
const ccTables = db.query("SELECT COUNT(*) as cnt FROM credit_card_withdrawals").get();
console.log("\n=== クレカ引き落とし件数 ===", JSON.stringify(ccTables));

const cc = db.query("SELECT * FROM credit_card_withdrawals LIMIT 5").all();
console.log("=== クレカ引き落とし ===");
console.log(JSON.stringify(cc, null, 2));

// daily_totals
const dt = db.query("SELECT * FROM daily_totals ORDER BY date DESC LIMIT 3").all();
console.log("\n=== daily_totals（最新3件）===");
console.log(JSON.stringify(dt, null, 2));

// app_settings
const settings = db.query("SELECT * FROM app_settings LIMIT 10").all();
console.log("\n=== app_settings ===");
console.log(JSON.stringify(settings, null, 2));

db.close();
