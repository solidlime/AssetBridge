import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

console.log('=== Direct count ===');
const total = db.query('SELECT COUNT(*) as cnt FROM portfolio_snapshots WHERE date = \"2026-03-20\"').get();
console.log('Total rows in date=2026-03-20:', total.cnt);

console.log('\n=== Sample data ===');
const samples = db.query('SELECT id, asset_id, date, value_jpy FROM portfolio_snapshots WHERE date = \"2026-03-20\" LIMIT 10').all();
console.log(JSON.stringify(samples, null, 2));

console.log('\n=== Check asset_id references ===');
const missingRefs = db.query('SELECT ps.asset_id, COUNT(*) as cnt FROM portfolio_snapshots ps WHERE date = \"2026-03-20\" AND NOT EXISTS(SELECT 1 FROM assets a WHERE a.id = ps.asset_id) GROUP BY ps.asset_id').all();
console.log('Missing asset_id references:');
console.log(JSON.stringify(missingRefs, null, 2));

console.log('\n=== Check assets table ===');
const assetCount = db.query('SELECT COUNT(*) as cnt FROM assets').get();
console.log('Total assets:', assetCount.cnt);

console.log('\n=== Assets for recent snapshots ===');
const recentAssets = db.query('SELECT DISTINCT asset_id FROM portfolio_snapshots WHERE date = \"2026-03-20\" ORDER BY asset_id').all();
console.log('Distinct asset_ids in 2026-03-20:', recentAssets.map(r => r.asset_id).join(', '));
