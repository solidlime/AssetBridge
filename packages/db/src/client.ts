import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import path from "path";
import * as schema from "./schema/index";

// プロジェクトルートから data/assetbridge.db
const dbPath = path.resolve(
  process.env.ASSETBRIDGE_DB_PATH ??
  path.join(process.cwd(), "data", "assetbridge_v2.db")
);

export const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
