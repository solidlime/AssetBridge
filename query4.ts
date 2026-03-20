import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

// 全スナップショット
console.log('=== All snapshots stats ===');
const stats = db.query('SELECT date, COUNT(*) as cnt FROM portfolio_snapshots GROUP BY date ORDER BY date DESC').all();
console.log(JSON.stringify(stats, null, 2));

// 最初の日付で詳しく
if (stats.length > 0) {
  const targetDate = stats[0].date;
  console.log('\n=== Snapshots for ' + targetDate + ' ===');
  const snaps = db.query('SELECT a.id, a.symbol, a.asset_type, ps.asset_id, ps.date, ps.value_jpy FROM portfolio_snapshots ps JOIN assets a ON ps.asset_id = a.id WHERE ps.date = ? ORDER BY a.asset_type DESC', [targetDate]).all();
  console.log('Count:', snaps.length);
  console.log(JSON.stringify(snaps, null, 2));
}
