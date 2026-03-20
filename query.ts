import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

console.log('=== portfolio_snapshots by asset_type ===');
const byType = db.query('SELECT a.asset_type, COUNT(*) as cnt, MAX(ps.date) as latest_date FROM portfolio_snapshots ps JOIN assets a ON ps.asset_id = a.id GROUP BY a.asset_type').all();
console.log(JSON.stringify(byType, null, 2));

console.log('\n=== stock snapshots latest ===');
const stocks = db.query('SELECT a.symbol, a.asset_type, ps.quantity, ps.cost_per_unit_jpy, ps.value_jpy, ps.date FROM portfolio_snapshots ps JOIN assets a ON ps.asset_id = a.id WHERE a.asset_type IN (select 1) LIMIT 20').all();
console.log('stock count:', stocks.length);
console.log(JSON.stringify(stocks, null, 2));

console.log('\n=== all assets ===');
const assets = db.query('SELECT id, symbol, name, asset_type FROM assets ORDER BY asset_type').all();
console.log('Total assets:', assets.length);
console.log(JSON.stringify(assets, null, 2));
