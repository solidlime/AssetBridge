const Database = require('better-sqlite3');
const db = new Database('data/assetbridge_v2.db');

console.log('=== 資産タイプ別集計 ===');
const byType = db.prepare('SELECT assetType, COUNT(*) as count, SUM(currentValueJpy) as totalJpy FROM holdings WHERE isActive=1 GROUP BY assetType ORDER BY totalJpy DESC').all();
console.log(JSON.stringify(byType, null, 2));

console.log('\n=== クレカ件数 ===');
const cwCount = db.prepare('SELECT COUNT(*) as total FROM credit_withdrawals').get();
console.log(JSON.stringify(cwCount));

console.log('\n=== クレカ最新3件 ===');
const cwLatest = db.prepare('SELECT cardName, withdrawalDate, amountJpy, status FROM credit_withdrawals ORDER BY withdrawalDate DESC LIMIT 3').all();
console.log(JSON.stringify(cwLatest, null, 2));

console.log('\n=== 配当（dividendFrequency別） ===');
const divFreq = db.prepare('SELECT ticker, dividendFrequency, COUNT(*) as cnt FROM dividends GROUP BY ticker, dividendFrequency LIMIT 10').all();
console.log(JSON.stringify(divFreq, null, 2));

console.log('\n=== 総資産合計 ===');
const total = db.prepare('SELECT SUM(currentValueJpy) as total FROM holdings WHERE isActive=1').get();
console.log(JSON.stringify(total));

console.log('\n=== holdings 総件数 ===');
const holdCount = db.prepare('SELECT COUNT(*) as cnt FROM holdings WHERE isActive=1').get();
console.log(JSON.stringify(holdCount));

console.log('\n=== PENSION/POINT 取得単価 ===');
const pp = db.prepare('SELECT name, assetType, currentValueJpy, acquisitionPrice FROM holdings WHERE isActive=1 AND assetType IN ("PENSION","POINT") LIMIT 5').all();
console.log(JSON.stringify(pp, null, 2));

db.close();
