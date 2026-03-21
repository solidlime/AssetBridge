import { Database } from "bun:sqlite";
import path from "path";

const dbPath = path.resolve("./data/assetbridge_v2.db");
const sqlite = new Database(dbPath);

const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

sqlite.close();
