import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');
console.log('=== All tables ===');
const tables = db.query('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name', ['table']).all();
for (const t of tables) {
  console.log(t.name);
}
console.log('');
console.log('=== assets count ===');
const assetCount = db.query('SELECT COUNT(*) as cnt FROM assets').get();
console.log(JSON.stringify(assetCount));

console.log('');
console.log('=== dividend_histories structure ===');
try {
  const cols = db.query('PRAGMA table_info(dividend_histories)').all();
  console.log(JSON.stringify(cols, null, 2));
} catch(e) {
  console.log('dividend_histories not found');
}

console.log('');
console.log('=== dividend_records structure ===');
try {
  const cols = db.query('PRAGMA table_info(dividend_records)').all();
  console.log(JSON.stringify(cols, null, 2));
} catch(e) {
  console.log('dividend_records not found');
}
