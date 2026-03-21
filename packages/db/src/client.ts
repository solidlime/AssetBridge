/// <reference types="bun-types" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema/index";

function resolveDefaultDbPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // packages/db/src/client.ts を基準に、常にリポジトリ直下 data/ を指す。
  // process.cwd() 依存だと `pnpm --filter` 実行時に apps/*/data を掴んでしまう。
  return path.resolve(currentDir, "..", "..", "..", "data", "assetbridge_v2.db");
}

const dbPath = path.resolve(process.env.ASSETBRIDGE_DB_PATH ?? resolveDefaultDbPath());

export const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA busy_timeout = 5000;");  // 複数プロセス競合時に最大5秒待機
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
