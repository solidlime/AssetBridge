const Database = require('better-sqlite3');
const db = new Database('data/assetbridge_v2.db');

// 謎の銘柄を確認
const bad = db.prepare("SELECT id, name, asset_type FROM assets WHERE name LIKE '%‹%' OR name LIKE '%›%'").all();
console.log('削除対象:', JSON.stringify(bad, null, 2));

// 関連テーブルから削除
let deletedCount = 0;
for (const a of bad) {
  db.prepare('DELETE FROM holdings WHERE asset_id = ?').run(a.id);
  db.prepare('DELETE FROM portfolio_snapshots WHERE asset_id = ?').run(a.id);
  db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
  console.log('削除:', a.name, '(id:', a.id, ')');
  deletedCount++;
}
console.log('削除完了:', deletedCount, '件');

// クリーンアップ後の確認
const remaining = db.prepare("SELECT name FROM assets WHERE name LIKE '%‹%' OR name LIKE '%›%'").all();
console.log('残存謎銘柄:', remaining.length, '件', JSON.stringify(remaining));
const total = db.prepare('SELECT COUNT(*) as cnt FROM assets WHERE is_active = 1').get();
console.log('有効資産数:', total.cnt);

db.close();
