import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');

// 最新のスクレイプイベント
console.log('=== Latest scrape events ===');
const events = db.query('SELECT id, scraped_at, substr(raw_json, 1, 300) as data FROM scrape_events ORDER BY scraped_at DESC LIMIT 5').all();
console.log(JSON.stringify(events, null, 2));

// 最新スナップショット（期間別）
console.log('\n=== Latest snapshots by date ===');
const dates = db.query('SELECT DISTINCT date FROM portfolio_snapshots ORDER BY date DESC LIMIT 3').all();
console.log('Dates:', dates.map(d => d.date).join(', '));

// 最新日付のスナップショット
if (dates.length > 0) {
  const latest = dates[0].date;
  console.log('\n=== Latest snapshots (date=' + latest + ') ===');
  const snaps = db.query('SELECT a.id, a.symbol, a.asset_type, ps.quantity, ps.value_jpy FROM portfolio_snapshots ps JOIN assets a ON ps.asset_id = a.id WHERE ps.date = ? ORDER BY a.asset_type, a.symbol', [latest]).all();
  console.log('Total snapshots:', snaps.length);
  const byType = {};
  for (const s of snaps) {
    byType[s.asset_type] = (byType[s.asset_type] || 0) + 1;
  }
  console.log('Count by type:', JSON.stringify(byType));
  console.log('\nAll snapshots:', JSON.stringify(snaps.slice(0, 20), null, 2));
}
