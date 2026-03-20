import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');
console.log('=== Assets with JPY currency that might be foreign assets ===');
const rows = db.prepare('SELECT id, symbol, name, asset_type, currency FROM assets WHERE currency = "JPY" ORDER BY asset_type, symbol').all();
console.log(`Total records with currency='JPY': ${rows.length}`);
console.log('\nDetails:');
rows.forEach((row: any) => {
  console.log(`  ID: ${row.id}, Symbol: ${row.symbol}, AssetType: ${row.asset_type}, Currency: ${row.currency}, Name: ${row.name}`);
});
db.close();
