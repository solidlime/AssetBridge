import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

console.log('=== STOCK snapshots latest ===');
const stocks = db.query(`
  SELECT a.symbol, a.asset_type, ps.quantity, ps.cost_per_unit_jpy, ps.value_jpy, ps.unrealized_pnl_jpy, ps.date
  FROM portfolio_snapshots ps
  JOIN assets a ON ps.asset_id = a.id
  WHERE a.asset_type IN ('STOCK_US','STOCK_JP','FUND')
  ORDER BY a.asset_type, a.symbol
`).all();
console.log(JSON.stringify(stocks, null, 2));

console.log('\n=== credit_card_withdrawals ===');
const ccs = db.query('SELECT * FROM credit_card_withdrawals').all();
console.log('count:', ccs.length);
console.log(JSON.stringify(ccs, null, 2));

console.log('\n=== daily_totals stats ===');
const cnt = db.query('SELECT COUNT(*) as cnt, MIN(date) as min_date, MAX(date) as max_date FROM daily_totals').get();
console.log(JSON.stringify(cnt));
