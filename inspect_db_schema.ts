import { Database } from 'bun:sqlite';

const db = new Database('data/assetbridge_v2.db');

// すべてのテーブルを確認
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("=== All Tables ===");
tables.forEach(t => console.log(`  ${t.name}`));

// テーブルの構造を確認
console.log("\n=== credit_card_withdrawals structure ===");
try {
  const cols = db.prepare("PRAGMA table_info(credit_card_withdrawals)").all();
  cols.forEach(c => console.log(`  ${c.name}: ${c.type}`));
} catch (e) {
  console.log(`  Error: ${e}`);
}

console.log("\n=== portfolio_snapshots structure ===");
try {
  const cols = db.prepare("PRAGMA table_info(portfolio_snapshots)").all();
  cols.forEach(c => console.log(`  ${c.name}: ${c.type}`));
} catch (e) {
  console.log(`  Error: ${e}`);
}

console.log("\n=== assets structure ===");
try {
  const cols = db.prepare("PRAGMA table_info(assets)").all();
  cols.forEach(c => console.log(`  ${c.name}: ${c.type}`));
} catch (e) {
  console.log(`  Error: ${e}`);
}

db.close();
