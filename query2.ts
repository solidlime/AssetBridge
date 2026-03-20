import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

// 最新のスクレイプイベント
console.log('=== Latest scrape events ===');
const events = db.query('SELECT id, scrapedAt, substr(rawJson, 1, 300) as data FROM scrape_events ORDER BY scrapedAt DESC LIMIT 5').all();
console.log(JSON.stringify(events, null, 2));

// 最新スナップショット（期間別）
console.log('\n=== Latest snapshots by date ===');
const dates = db.query('SELECT DISTINCT date FROM portfolio_snapshots ORDER BY date DESC LIMIT 3').all();
console.log('Dates:', dates);

// 最新日付のスナップショット
if (dates.length > 0) {
  const latest = dates[0].date;
  console.log('\n=== Latest snapshots (date=' + latest + ') ===');
  const snaps = db.query('SELECT a.symbol, a.asset_type, ps.quantity, ps.value_jpy FROM portfolio_snapshots ps JOIN assets a ON ps.asset_id = a.id WHERE ps.date = ? ORDER BY a.asset_type, a.symbol', [latest]).all();
  console.log('Count by type:');
  const byType = {};
  for (const s of snaps) {
    byType[s.asset_type] = (byType[s.asset_type] || 0) + 1;
  }
  console.log(JSON.stringify(byType, null, 2));
  console.log('\nFull list:');
  console.log(JSON.stringify(snaps, null, 2));
}
