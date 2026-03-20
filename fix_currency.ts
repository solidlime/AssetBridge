import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

console.log('=== Currency Correction ===');

// 修正前を確認
const before = db.prepare('SELECT id, symbol, currency FROM assets WHERE id = 11').get();
console.log(`Before: ID=${before.id}, Symbol=${before.symbol}, Currency=${before.currency}`);

// 修正を実行
const result = db.prepare('UPDATE assets SET currency = ? WHERE id = ?').run('HKD', 11);
console.log(`\nUpdated ${result.changes} record(s)`);

// 修正後を確認
const after = db.prepare('SELECT id, symbol, currency FROM assets WHERE id = 11').get();
console.log(`After: ID=${after.id}, Symbol=${after.symbol}, Currency=${after.currency}`);

db.close();
console.log('\n✓ Database update completed successfully');
