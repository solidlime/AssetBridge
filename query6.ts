import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

console.log('=== Asset 12 check ===');
const asset12 = db.query('SELECT * FROM assets WHERE id = 12').get();
console.log('Asset 12:', JSON.stringify(asset12, null, 2));

console.log('\n=== Assets 10-15 ===');
const assets = db.query('SELECT id, symbol, name, asset_type FROM assets WHERE id BETWEEN 10 AND 15').all();
console.log(JSON.stringify(assets, null, 2));

console.log('\n=== 2026-03-20 Stock snapshots (actual JOIN) ===');
const stocks = db.query('SELECT a.id, a.symbol, a.name, a.asset_type, ps.quantity, ps.value_jpy, ps.date FROM portfolio_snapshots ps INNER JOIN assets a ON ps.asset_id = a.id WHERE ps.date = \"2026-03-20\" AND a.asset_type IN (\"STOCK_JP\", \"STOCK_US\") ORDER BY a.symbol').all();
console.log('Stock count:', stocks.length);
console.log(JSON.stringify(stocks, null, 2));
