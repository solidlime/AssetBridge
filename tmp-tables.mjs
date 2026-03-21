const Database = require('better-sqlite3');
const db = new Database('data/assetbridge_v2.db');
const tables = db.prepare('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name').all();
console.log('テーブル一覧:', JSON.stringify(tables.map(t => t.name)));
