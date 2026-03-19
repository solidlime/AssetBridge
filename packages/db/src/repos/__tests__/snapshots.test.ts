import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SnapshotsRepo, DailyTotalsRepo } from "../snapshots";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // assets テーブル（portfolio_snapshots の外部キー依存）
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol     TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      asset_type TEXT    NOT NULL,
      exchange   TEXT,
      currency   TEXT    NOT NULL DEFAULT 'JPY',
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE (symbol, asset_type)
    );
  `);

  // portfolio_snapshots テーブル
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id           INTEGER NOT NULL REFERENCES assets(id),
      date               TEXT    NOT NULL,
      quantity           REAL    NOT NULL DEFAULT 0,
      price_jpy          REAL    NOT NULL DEFAULT 0,
      value_jpy          REAL    NOT NULL DEFAULT 0,
      cost_basis_jpy     REAL    NOT NULL DEFAULT 0,
      cost_per_unit_jpy  REAL    NOT NULL DEFAULT 0,
      unrealized_pnl_jpy REAL    NOT NULL DEFAULT 0,
      unrealized_pnl_pct REAL    NOT NULL DEFAULT 0,
      UNIQUE (asset_id, date)
    );
    CREATE INDEX IF NOT EXISTS ix_snapshot_date ON portfolio_snapshots(date);
  `);

  // daily_totals テーブル
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS daily_totals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT    NOT NULL UNIQUE,
      total_jpy    REAL    NOT NULL DEFAULT 0,
      stock_jp_jpy REAL    NOT NULL DEFAULT 0,
      stock_us_jpy REAL    NOT NULL DEFAULT 0,
      fund_jpy     REAL    NOT NULL DEFAULT 0,
      cash_jpy     REAL    NOT NULL DEFAULT 0,
      pension_jpy  REAL    NOT NULL DEFAULT 0,
      point_jpy    REAL    NOT NULL DEFAULT 0,
      prev_diff_jpy REAL   NOT NULL DEFAULT 0,
      prev_diff_pct REAL   NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_daily_date ON daily_totals(date);
  `);

  // schema import は循環依存を避けるため最小限の inline schema を使う
  const { portfolioSnapshots, dailyTotals, assets } = require("../../schema/index");
  const db = drizzle(sqlite, { schema: { portfolioSnapshots, dailyTotals, assets } });

  return { sqlite, db };
}

// ────────────────────────────────────────────────────────────
// SnapshotsRepo
// ────────────────────────────────────────────────────────────

describe("SnapshotsRepo", () => {
  let repo: SnapshotsRepo;
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database;

  beforeEach(() => {
    const ctx = createTestDb();
    sqlite = ctx.sqlite;
    db = ctx.db as ReturnType<typeof drizzle>;
    repo = new SnapshotsRepo(db as any);

    // テスト用 asset を1件挿入
    sqlite.exec(`
      INSERT INTO assets (symbol, name, asset_type, currency)
      VALUES ('TEST', 'Test Asset', 'stock_jp', 'JPY');
    `);
  });

  it("スナップショットを保存して getLatestByDate で取得できる", () => {
    repo.upsertSnapshot({
      assetId: 1,
      date: "2024-01-01",
      quantity: 100,
      priceJpy: 1500,
      valueJpy: 150000,
      costBasisJpy: 120000,
      costPerUnitJpy: 1200,
      unrealizedPnlJpy: 30000,
      unrealizedPnlPct: 25.0,
    });

    const rows = repo.getLatestByDate("2024-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].portfolio_snapshots.assetId).toBe(1);
    expect(rows[0].portfolio_snapshots.valueJpy).toBe(150000);
    expect(rows[0].assets.symbol).toBe("TEST");
  });

  it("同じ date + assetId で upsert すると値が更新される", () => {
    repo.upsertSnapshot({
      assetId: 1,
      date: "2024-01-01",
      quantity: 100,
      priceJpy: 1500,
      valueJpy: 150000,
      costBasisJpy: 120000,
      costPerUnitJpy: 1200,
      unrealizedPnlJpy: 30000,
      unrealizedPnlPct: 25.0,
    });

    // 同じキーで異なる値を upsert
    repo.upsertSnapshot({
      assetId: 1,
      date: "2024-01-01",
      quantity: 200,
      priceJpy: 1600,
      valueJpy: 320000,
      costBasisJpy: 240000,
      costPerUnitJpy: 1200,
      unrealizedPnlJpy: 80000,
      unrealizedPnlPct: 33.3,
    });

    const rows = repo.getLatestByDate("2024-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].portfolio_snapshots.quantity).toBe(200);
    expect(rows[0].portfolio_snapshots.valueJpy).toBe(320000);
  });

  it("別の date のスナップショットは別レコードとして保存される", () => {
    repo.upsertSnapshot({
      assetId: 1,
      date: "2024-01-01",
      quantity: 100,
      priceJpy: 1500,
      valueJpy: 150000,
      costBasisJpy: 120000,
      costPerUnitJpy: 1200,
      unrealizedPnlJpy: 30000,
      unrealizedPnlPct: 25.0,
    });
    repo.upsertSnapshot({
      assetId: 1,
      date: "2024-01-02",
      quantity: 100,
      priceJpy: 1600,
      valueJpy: 160000,
      costBasisJpy: 120000,
      costPerUnitJpy: 1200,
      unrealizedPnlJpy: 40000,
      unrealizedPnlPct: 33.3,
    });

    const rows1 = repo.getLatestByDate("2024-01-01");
    const rows2 = repo.getLatestByDate("2024-01-02");
    expect(rows1).toHaveLength(1);
    expect(rows2).toHaveLength(1);
    expect(rows1[0].portfolio_snapshots.priceJpy).toBe(1500);
    expect(rows2[0].portfolio_snapshots.priceJpy).toBe(1600);
  });

  it("存在しない date を getLatestByDate すると空配列を返す", () => {
    const rows = repo.getLatestByDate("1900-01-01");
    expect(rows).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// DailyTotalsRepo
// ────────────────────────────────────────────────────────────

describe("DailyTotalsRepo", () => {
  let repo: DailyTotalsRepo;

  beforeEach(() => {
    const { db } = createTestDb();
    repo = new DailyTotalsRepo(db as any);
  });

  const makeTotals = (date: string, totalJpy: number = 0) => ({
    date,
    totalJpy,
    stockJpJpy: 0,
    stockUsJpy: 0,
    fundJpy: 0,
    cashJpy: 0,
    pensionJpy: 0,
    pointJpy: 0,
    prevDiffJpy: 0,
    prevDiffPct: 0,
  });

  it("upsert して getLatest で最新レコードを取得できる", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    const latest = repo.getLatest();
    expect(latest).toBeDefined();
    expect(latest!.date).toBe("2024-01-01");
    expect(latest!.totalJpy).toBe(1_000_000);
  });

  it("複数 upsert 後、getLatest は最新 date のレコードを返す", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    repo.upsert(makeTotals("2024-01-03", 3_000_000));
    repo.upsert(makeTotals("2024-01-02", 2_000_000));

    const latest = repo.getLatest();
    expect(latest!.date).toBe("2024-01-03");
    expect(latest!.totalJpy).toBe(3_000_000);
  });

  it("1件のみのとき getPrev は undefined を返す", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    const prev = repo.getPrev();
    expect(prev).toBeUndefined();
  });

  it("2件以上のとき getPrev は2番目（前日）のレコードを返す", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    repo.upsert(makeTotals("2024-01-02", 2_000_000));

    const prev = repo.getPrev();
    expect(prev).toBeDefined();
    expect(prev!.date).toBe("2024-01-01");
    expect(prev!.totalJpy).toBe(1_000_000);
  });

  it("3件以上のとき getPrev は最新から2番目を返す", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    repo.upsert(makeTotals("2024-01-02", 2_000_000));
    repo.upsert(makeTotals("2024-01-03", 3_000_000));

    const prev = repo.getPrev();
    expect(prev!.date).toBe("2024-01-02");
    expect(prev!.totalJpy).toBe(2_000_000);
  });

  it("同じ date で upsert すると既存レコードが更新される", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    repo.upsert({ ...makeTotals("2024-01-01", 5_000_000), stockJpJpy: 500_000 });

    const latest = repo.getLatest();
    expect(latest!.totalJpy).toBe(5_000_000);
    expect(latest!.stockJpJpy).toBe(500_000);
  });

  it("getHistory(n) は指定件数を古い順に返す", () => {
    repo.upsert(makeTotals("2024-01-01", 1_000_000));
    repo.upsert(makeTotals("2024-01-02", 2_000_000));
    repo.upsert(makeTotals("2024-01-03", 3_000_000));

    const history = repo.getHistory(2);
    expect(history).toHaveLength(2);
    // reverse() されているので古い順
    expect(history[0].date).toBe("2024-01-02");
    expect(history[1].date).toBe("2024-01-03");
  });

  it("レコードなしのとき getLatest は undefined を返す", () => {
    expect(repo.getLatest()).toBeUndefined();
  });

  it("レコードなしのとき getPrev は undefined を返す", () => {
    expect(repo.getPrev()).toBeUndefined();
  });
});
