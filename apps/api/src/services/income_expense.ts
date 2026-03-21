import { db, sqlite } from "@assetbridge/db/client";
import { assets, creditCardWithdrawals, portfolioSnapshots } from "@assetbridge/db/schema";
import { SettingsRepo } from "@assetbridge/db/repos/settings";
import { and, desc, eq } from "drizzle-orm";

export interface CreditWithdrawal {
  id: number;
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
  bankAccount: string | null;
  status: "scheduled" | "withdrawn";
  scrapedAt: string;
}

export interface UpcomingWithdrawalsResult {
  withdrawals: CreditWithdrawal[];
  totalAmountJpy: number;
  count: number;
}

// ─── CC残高管理 型定義 ────────────────────────────────────────────────────────

export interface CcBalanceStatusItem {
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
  status: string;
  accountName: string | null;       // 未紐づけは null
  accountAssetId: number | null;
  accountBalanceJpy: number | null;
  shortfallJpy: number;             // accountBalanceJpy - amountJpy (負値=不足、未紐づけは0)
  isInsufficient: boolean;
}

export interface CcBalanceStatus {
  status: "ok" | "warning";         // いずれかのカードで isInsufficient=true なら "warning"
  totalWithdrawalJpy: number;
  summary: CcBalanceStatusItem[];
}

export interface CcAccountMapping {
  mapping: Record<string, number>;  // card_name → asset_id
  accounts: Array<{ assetId: number; name: string; institutionName: string | null; balanceJpy: number }>;
}

export async function getUpcomingWithdrawals(_days: number): Promise<UpcomingWithdrawalsResult> {
  // status='scheduled' のものは引き落とし日に関わらず全件返す（過去分も確認できるように）
  const rows = db
    .select()
    .from(creditCardWithdrawals)
    .where(eq(creditCardWithdrawals.status, "scheduled"))
    .orderBy(creditCardWithdrawals.withdrawalDate)
    .all();

  const withdrawals: CreditWithdrawal[] = rows.map((r) => ({
    id: r.id,
    cardName: r.cardName,
    withdrawalDate: r.withdrawalDate,
    amountJpy: r.amountJpy,
    bankAccount: r.bankAccount ?? null,
    status: r.status as "scheduled" | "withdrawn",
    scrapedAt: r.scrapedAt,
  }));

  const totalAmountJpy = withdrawals.reduce((sum, w) => sum + w.amountJpy, 0);

  return {
    withdrawals,
    totalAmountJpy,
    count: withdrawals.length,
  };
}

export async function getAllWithdrawals(limit: number): Promise<CreditWithdrawal[]> {
  const rows = db
    .select()
    .from(creditCardWithdrawals)
    .orderBy(desc(creditCardWithdrawals.withdrawalDate))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    cardName: r.cardName,
    withdrawalDate: r.withdrawalDate,
    amountJpy: r.amountJpy,
    bankAccount: r.bankAccount ?? null,
    status: r.status as "scheduled" | "withdrawn",
    scrapedAt: r.scrapedAt,
  }));
}

// ─── CC残高管理 関数 ──────────────────────────────────────────────────────────

/**
 * 各クレジットカードの引き落とし予定と紐づき口座残高を照合し、
 * 残高不足の有無をまとめて返す。
 */
export async function getCcBalanceStatus(): Promise<CcBalanceStatus> {
  // 1. status='scheduled' の引き落とし予定を全件取得
  const rows = db
    .select()
    .from(creditCardWithdrawals)
    .where(eq(creditCardWithdrawals.status, "scheduled"))
    .orderBy(creditCardWithdrawals.withdrawalDate)
    .all();

  // 2. cc_account_mapping を app_settings から取得（未設定なら {}）
  const settingsRepo = new SettingsRepo(sqlite);
  const mappingJson = settingsRepo.get("cc_account_mapping");
  const mapping: Record<string, number> = mappingJson ? (JSON.parse(mappingJson) as Record<string, number>) : {};

  // 3. マッピングに含まれる asset_id ごとの最新残高を一括取得（重複クエリ防止）
  const assetIds = [...new Set(Object.values(mapping))];
  const balanceCache = new Map<number, { name: string; valueJpy: number }>();

  for (const assetId of assetIds) {
    const assetRow = db
      .select({ name: assets.name })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();

    const snapRow = db
      .select({ valueJpy: portfolioSnapshots.valueJpy })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.assetId, assetId))
      .orderBy(desc(portfolioSnapshots.date))
      .limit(1)
      .get();

    if (assetRow) {
      balanceCache.set(assetId, {
        name: assetRow.name,
        valueJpy: snapRow?.valueJpy ?? 0,
      });
    }
  }

  // 4. 引き落とし予定ごとに残高照合アイテムを構築
  const summary: CcBalanceStatusItem[] = rows.map((r) => {
    const assetId = mapping[r.cardName] ?? null;
    const account = assetId !== null ? (balanceCache.get(assetId) ?? null) : null;
    const accountBalanceJpy = account?.valueJpy ?? null;

    let shortfallJpy = 0;
    let isInsufficient = false;

    if (assetId !== null && accountBalanceJpy !== null) {
      shortfallJpy = accountBalanceJpy - r.amountJpy;
      isInsufficient = shortfallJpy < 0;
    }

    return {
      cardName: r.cardName,
      withdrawalDate: r.withdrawalDate,
      amountJpy: r.amountJpy,
      status: r.status,
      accountName: account?.name ?? (r.bankAccount ?? null),
      accountAssetId: assetId,
      accountBalanceJpy,
      shortfallJpy,
      isInsufficient,
    };
  });

  const totalWithdrawalJpy = summary.reduce((sum, s) => sum + s.amountJpy, 0);
  const overallStatus: "ok" | "warning" = summary.some((s) => s.isInsufficient) ? "warning" : "ok";

  return { status: overallStatus, totalWithdrawalJpy, summary };
}

/**
 * カード名→口座 asset_id のマッピングと、CASH 口座の最新残高一覧を返す。
 */
export async function getCcAccountMapping(): Promise<CcAccountMapping> {
  // 1. 現在のマッピングを取得
  const settingsRepo = new SettingsRepo(sqlite);
  const mappingJson = settingsRepo.get("cc_account_mapping");
  const mapping: Record<string, number> = mappingJson ? (JSON.parse(mappingJson) as Record<string, number>) : {};

  // 2. CASH 資産の中で最新のスナップショット日付を取得（全体の最新日とは異なる場合がある）
  const latestCashDateRow = db
    .select({ date: portfolioSnapshots.date })
    .from(portfolioSnapshots)
    .innerJoin(assets, eq(portfolioSnapshots.assetId, assets.id))
    .where(eq(assets.assetType, "CASH"))
    .orderBy(desc(portfolioSnapshots.date))
    .limit(1)
    .get();

  let accounts: Array<{ assetId: number; name: string; institutionName: string | null; balanceJpy: number }> = [];

  if (latestCashDateRow) {
    const cashRows = db
      .select({
        assetId: assets.id,
        name: assets.name,
        institutionName: assets.institutionName,
        valueJpy: portfolioSnapshots.valueJpy,
      })
      .from(assets)
      .innerJoin(portfolioSnapshots, eq(portfolioSnapshots.assetId, assets.id))
      .where(and(eq(assets.assetType, "CASH"), eq(portfolioSnapshots.date, latestCashDateRow.date)))
      .all();

    accounts = cashRows.map((r) => ({
      assetId: r.assetId,
      name: r.name,
      institutionName: r.institutionName ?? null,
      balanceJpy: r.valueJpy,
    }));
  }

  return { mapping, accounts };
}

/**
 * カード名→口座 asset_id のマッピングを app_settings に保存する。
 */
export async function setCcAccountMapping(mapping: Record<string, number>): Promise<void> {
  const settingsRepo = new SettingsRepo(sqlite);
  settingsRepo.set("cc_account_mapping", JSON.stringify(mapping));
}
