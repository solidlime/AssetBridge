import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');
console.log('=== All Assets by Currency ===');
const rows = db.prepare('SELECT id, symbol, name, asset_type, currency FROM assets ORDER BY currency, asset_type, symbol').all();
console.log(`Total assets: ${rows.length}`);
console.log('\nGrouped by Currency:');
const grouped: Record<string, any[]> = {};
rows.forEach((row: any) => {
  if (!grouped[row.currency]) grouped[row.currency] = [];
  grouped[row.currency].push(row);
});
Object.entries(grouped).forEach(([currency, items]) => {
  console.log(`\n${currency}: ${items.length} records`);
  items.forEach((row: any) => {
    console.log(`  [${row.asset_type}] ${row.symbol}: ${row.name}`);
  });
});
db.close();
