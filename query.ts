import Database from 'bun:sqlite';
const db = new Database('data/assetbridge_v2.db');
// テーブル一覧
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
// credit_card_withdrawals の構造
const info = db.query("PRAGMA table_info(credit_card_withdrawals)").all();
console.log('\ncredit_card_withdrawals columns:');
info.forEach(c => console.log(' ', c.cid, c.name, c.type, c.notnull ? 'NOT NULL' : '', c.dflt_value ? 'DEFAULT ' + c.dflt_value : ''));
// サンプルデータ
const rows = db.query('SELECT * FROM credit_card_withdrawals LIMIT 5').all();
console.log('\nSample data:', JSON.stringify(rows, null, 2));
// app_settings の cc_account_mapping
const setting = db.query("SELECT value FROM app_settings WHERE key = 'cc_account_mapping'").get();
console.log('\ncc_account_mapping:', setting?.value);
