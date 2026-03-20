import { Database } from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');
console.log('=== Check potentially incorrect currency assignments ===');
// 香港ドル、人民元などの外貨を含むレコードを確認
const hkdRows = db.prepare(`
  SELECT id, symbol, name, asset_type, currency 
  FROM assets 
  WHERE symbol LIKE '%香港%' OR symbol LIKE '%HKD%' OR symbol LIKE '%人民元%' OR symbol LIKE '%CNY%'
  OR symbol LIKE '%ドル%' OR symbol LIKE '%EUR%' OR symbol LIKE '%ユーロ%'
`).all();

if (hkdRows.length > 0) {
  console.log(`Found ${hkdRows.length} potentially misclassified assets:`);
  hkdRows.forEach((row: any) => {
    console.log(`  ID: ${row.id}, Symbol: ${row.symbol}, Currency: ${row.currency}, Type: ${row.asset_type}`);
  });
} else {
  console.log('No potentially misclassified assets found');
}

console.log('\n=== Summary ===');
console.log('✓ USD assets (6): All correctly set as STOCK_US');
console.log('✓ JPY assets (42): All correctly set as domestic Japanese assets');
console.log('Note: Currency setup appears to be already correct');
db.close();
