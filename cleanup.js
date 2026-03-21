import { Database } from "bun:sqlite";
import path from "path";

const dbPath = path.resolve("./data/assetbridge_v2.db");
console.log("DB Path:", dbPath);
const sqlite = new Database(dbPath);

// 謎の銘柄を確認
const bad = sqlite.query(`SELECT id, name, asset_type FROM assets WHERE name LIKE '%‹%' OR name LIKE '%›%'`).all();
console.log('削除対象:', JSON.stringify(bad, null, 2));

// 関連テーブルから削除
let deletedCount = 0;
for (const a of bad) {
  // portfolio_snapshots から削除
  sqlite.query('DELETE FROM portfolio_snapshots WHERE asset_id = ?').run(a.id);
  sqlite.query('DELETE FROM assets WHERE id = ?').run(a.id);
  console.log('削除:', a.name, '(id:', a.id, ')');
  deletedCount++;
}
console.log('削除完了:', deletedCount, '件');

// クリーンアップ後の確認
const remaining = sqlite.query(`SELECT name FROM assets WHERE name LIKE '%‹%' OR name LIKE '%›%'`).all();
console.log('残存謎銘柄:', remaining.length, '件', JSON.stringify(remaining));
const total = sqlite.query('SELECT COUNT(*) as cnt FROM assets').get();
console.log('総資産数:', total.cnt);

sqlite.close();
