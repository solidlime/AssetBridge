import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

// 全テーブル取得
const tables = db.query('SELECT name FROM sqlite_master WHERE type = ?').all('table');
console.log('=== All tables ===');
tables.forEach(t => console.log(t.name));

// 各テーブルの情報
tables.forEach(t => {
  console.log(\n=== Table:  ===);
  const info = db.query(PRAGMA table_info()).all();
  console.log(JSON.stringify(info, null, 2));
  
  const count = db.query(SELECT COUNT(*) as cnt FROM ).get();
  console.log(Row count: );
});
