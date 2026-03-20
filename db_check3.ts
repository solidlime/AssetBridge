import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// Get all tables
const tables = db.query("SELECT name FROM sqlite_master WHERE type = ?").all("table");
console.log("=== All tables ===");
tables.forEach(t => console.log(t.name));

// Get info for each table
tables.forEach(t => {
  const tableName = t.name;
  console.log("");
  console.log("=== Table: " + tableName + " ===");
  try {
    const info = db.query("PRAGMA table_info(" + tableName + ")").all();
    console.log(JSON.stringify(info, null, 2));
    
    const count = db.query("SELECT COUNT(*) as cnt FROM " + tableName).get();
    console.log("Row count: " + count.cnt);
  } catch(e) {
    console.log("Error: " + e.message);
  }
});
