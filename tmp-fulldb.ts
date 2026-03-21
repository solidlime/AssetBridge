import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 最新スナップショット日付
const latestDate = db.query("SELECT MAX(date) as latest FROM portfolio_snapshots").get();
console.log("=== 最新スナップショット日 ===", latestDate?.latest);

// 最新日の総資産
const total = db.query("SELECT SUM(value_jpy) as total FROM portfolio_snapshots WHERE date = (SELECT MAX(date) FROM portfolio_snapshots)").get();
console.log("=== 総資産（最新）===", total?.total);

// 資産TOP10（assets JOIN portfolio_snapshots）
const assets = db.query(`
  SELECT a.name, a.asset_type, a.institution_name, ps.value_jpy 
  FROM assets a 
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id 
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
  ORDER BY ps.value_jpy DESC LIMIT 10
`).all();
console.log("\n=== 資産TOP10 ===");
console.log(JSON.stringify(assets, null, 2));

// 謎の銘柄（特殊文字）
const special = db.query("SELECT id, name, symbol FROM assets WHERE name LIKE '%<%' OR name LIKE '%>%' OR symbol LIKE '%<%' OR symbol LIKE '%>%'").all();
console.log("\n=== 特殊文字銘柄 ===", special.length, "件");
if (special.length > 0) console.log(JSON.stringify(special, null, 2));

// クレカ引き落とし
const ccCount = db.query("SELECT COUNT(*) as cnt FROM credit_card_withdrawals").get();
console.log("\n=== クレカ引き落とし件数 ===", ccCount?.cnt);
const ccSample = db.query("SELECT card_name, withdrawal_date, amount_jpy, status, bank_account FROM credit_card_withdrawals ORDER BY withdrawal_date DESC LIMIT 5").all();
console.log("=== クレカ引き落とし一覧 ===");
console.log(JSON.stringify(ccSample, null, 2));

// app_settings でAPIキー確認
const apiKey = db.query("SELECT * FROM app_settings WHERE key LIKE '%api%' OR key LIKE '%key%'").all();
console.log("\n=== APIキー設定 ===");
console.log(JSON.stringify(apiKey, null, 2));

// 配当情報
const divCount = db.query("SELECT COUNT(*) as cnt FROM portfolio_snapshots WHERE dividend_frequency IS NOT NULL AND dividend_frequency != ''").get();
console.log("\n=== 配当設定済み ===", divCount?.cnt, "件");
const divSample = db.query("SELECT a.name, a.symbol, ps.dividend_frequency, ps.dividend_amount, ps.dividend_rate FROM assets a JOIN portfolio_snapshots ps ON a.id = ps.asset_id WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots) AND ps.dividend_frequency IS NOT NULL LIMIT 5").all();
console.log("=== 配当サンプル ===");
console.log(JSON.stringify(divSample, null, 2));

// daily_totals
const dt = db.query("SELECT * FROM daily_totals ORDER BY date DESC LIMIT 3").all();
console.log("\n=== daily_totals（最新3件）===");
console.log(JSON.stringify(dt, null, 2));

db.close();
