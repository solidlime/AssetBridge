#!/usr/bin/env bun
// Bun:sqlite で直接 SQLite マイグレーションを実行するスクリプト
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

function resolveDefaultDbPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // scripts/migrate.ts を基準に、常にリポジトリ直下 data/ を指す。
  return path.resolve(currentDir, "..", "data", "assetbridge_v2.db");
}

const dbPath = path.resolve(
  process.env.ASSETBRIDGE_DB_PATH ?? resolveDefaultDbPath()
);

// data/ ディレクトリを作成
const dataDir = path.dirname(dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// __drizzle_migrations テーブル（適用済み追跡）
db.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    created_at INTEGER
  )
`);

const migrationsDir = path.resolve(process.cwd(), "packages", "db", "drizzle");

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const filename of migrationFiles) {
  const hash = filename.replace(".sql", "");

  // 適用済みチェック
  const applied = db.prepare("SELECT id FROM __drizzle_migrations WHERE hash = ?").get(hash);
  if (applied) {
    console.log(`  skipped (already applied): ${filename}`);
    continue;
  }

  const sql = readFileSync(path.join(migrationsDir, filename), "utf-8");
  // --> statement-breakpoint で分割して個別実行
  const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

  db.transaction(() => {
    for (const stmt of statements) {
      db.exec(stmt);
    }
    db.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, unixepoch())").run(hash);
  })();

  console.log(`  applied: ${filename}`);
}

db.close();
console.log("Migration complete.");
