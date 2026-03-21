import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 配当情報（dividend_frequencyが設定されているもの）
const divSample = db.query(`
  SELECT a.name, a.symbol, ps.dividend_frequency, ps.dividend_amount, ps.dividend_rate, ps.value_jpy
  FROM assets a 
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id 
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots) 
    AND ps.dividend_frequency IS NOT NULL 
    AND ps.dividend_frequency != ''
  LIMIT 5
`).all();
console.log("=== 配当情報サンプル（5件）===");
console.log(JSON.stringify(divSample, null, 2));

// 配当総額試算
const divTotal = db.query(`
  SELECT SUM(ps.dividend_amount * ps.quantity) as total_div
  FROM portfolio_snapshots ps 
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
    AND ps.dividend_amount IS NOT NULL
`).get();
console.log("\n=== 配当総額試算 ===", divTotal?.total_div);

// portfolio_snapshots の quantity確認
const snap = db.query(`
  SELECT a.name, ps.quantity, ps.price_jpy, ps.value_jpy, ps.dividend_frequency, ps.dividend_amount
  FROM assets a 
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id 
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
  ORDER BY ps.value_jpy DESC
  LIMIT 5
`).all();
console.log("\n=== スナップショット詳細（TOP5）===");
console.log(JSON.stringify(snap, null, 2));

db.close();
