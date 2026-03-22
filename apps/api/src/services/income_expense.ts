import { db, sqlite } from "@assetbridge/db/client";
import { assets, creditCardWithdrawals, portfolioSnapshots } from "@assetbridge/db/schema";
import { SettingsRepo } from "@assetbridge/db/repos/settings";
import { FixedExpenseRepo } from "@assetbridge/db/repos/fixed_expenses";
import { CreditCardDetailRepo } from "@assetbridge/db/repos/credit_card_details";
import { and, desc, eq, like } from "drizzle-orm";

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

// ─── 固定費 CRUD ──────────────────────────────────────────────────────────────

export function getFixedExpenses() {
  const repo = new FixedExpenseRepo(db);
  return repo.findAll();
}

export function addFixedExpense(data: {
  name: string;
  amountJpy: number;
  frequency: "monthly" | "annual" | "quarterly";
  withdrawalDay?: number | null;
  withdrawalMonth?: number | null;
  category?: string | null;
  assetId?: number | null;
  bankAccount?: string | null;
}) {
  const repo = new FixedExpenseRepo(db);
  return repo.create(data);
}

export function updateFixedExpense(
  id: number,
  data: Partial<{
    name: string;
    amountJpy: number;
    frequency: "monthly" | "annual" | "quarterly";
    withdrawalDay: number | null;
    withdrawalMonth: number | null;
    category: string | null;
    assetId: number | null;
    bankAccount: string | null;
  }>
) {
  const repo = new FixedExpenseRepo(db);
  return repo.update(id, data);
}

export function deleteFixedExpense(id: number) {
  const repo = new FixedExpenseRepo(db);
  return repo.delete(id);
}

// ─── 月次引き落としサマリー ───────────────────────────────────────────────────

export interface MonthlyWithdrawalSummary {
  month: string;
  fixedExpenseTotal: number;
  creditCardTotal: number;
  grandTotal: number;
  linkedAssetIds: number[];
}

/**
 * 指定月（"YYYY-MM" 形式、省略時は当月）の引き落とし合計を返す。
 *
 * - fixedExpenseTotal : 固定費の月次換算合計
 * - creditCardTotal   : クレカ引き落とし（credit_card_withdrawals テーブル）当月分合計
 * - grandTotal        : 上記合計
 * - linkedAssetIds    : 固定費に紐づく口座 asset_id 一覧
 */
export function getMonthlyWithdrawalSummary(month?: string): MonthlyWithdrawalSummary {
  const targetMonth = month ?? new Date().toISOString().slice(0, 7);
  const [, monthStr] = targetMonth.split("-");
  const targetMonthNum = parseInt(monthStr, 10);

  // ── 固定費合計（月次換算） ─────────────────────────────────────────────────
  const fixedExpenseRepo = new FixedExpenseRepo(db);
  const expenses = fixedExpenseRepo.findAll();

  let fixedExpenseTotal = 0;
  const linkedAssetIds = new Set<number>();

  for (const exp of expenses) {
    let monthlyAmount = 0;

    if (exp.frequency === "monthly") {
      monthlyAmount = exp.amountJpy;
    } else if (exp.frequency === "annual") {
      // 年次費用は月割り
      monthlyAmount = exp.amountJpy / 12;
    } else if (exp.frequency === "quarterly") {
      // 四半期払い: withdrawalMonth を起点に3ヶ月ごとの当月かチェック
      const startMonth = exp.withdrawalMonth ?? 1;
      const diff = ((targetMonthNum - startMonth) % 3 + 3) % 3;
      monthlyAmount = diff === 0 ? exp.amountJpy : 0;
    }

    fixedExpenseTotal += monthlyAmount;
    if (exp.assetId != null) linkedAssetIds.add(exp.assetId);
  }

  // ── クレカ引き落とし合計（当月の withdrawalDate を持つ全レコード） ──────────
  const ccRows = db
    .select({ amountJpy: creditCardWithdrawals.amountJpy })
    .from(creditCardWithdrawals)
    .where(like(creditCardWithdrawals.withdrawalDate, `${targetMonth}%`))
    .all();

  const creditCardTotal = ccRows.reduce((sum, r) => sum + r.amountJpy, 0);

  return {
    month: targetMonth,
    fixedExpenseTotal,
    creditCardTotal,
    grandTotal: fixedExpenseTotal + creditCardTotal,
    linkedAssetIds: [...linkedAssetIds],
  };
}

// ─── クレジットカード詳細 ─────────────────────────────────────────────────────

/**
 * スクレイプ済みクレジットカード詳細（カード種別・残高・請求予定額等）を返す。
 */
export function getCreditCardDetails() {
  const repo = new CreditCardDetailRepo(db);
  return repo.findAll();
}

export interface MonthlyCashflowItem {
  month: string;      // "YYYY-MM"
  creditJpy: number;
  fixedJpy: number;
  totalJpy: number;
}

export function getMonthlyCashflow(months: number = 6): MonthlyCashflowItem[] {
  // 直近 months ヶ月分の月リストを生成（古い順）
  const monthList: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    monthList.push(`${y}-${m}`);
  }

  // 固定費を全件取得
  const fixedExpenseRepo = new FixedExpenseRepo(db);
  const expenses = fixedExpenseRepo.findAll();

  return monthList.map((targetMonth) => {
    const [, monthStr] = targetMonth.split("-");
    const targetMonthNum = parseInt(monthStr, 10);

    // 固定費月次合計
    let fixedJpy = 0;
    for (const exp of expenses) {
      if (exp.frequency === "monthly") {
        fixedJpy += exp.amountJpy;
      } else if (exp.frequency === "annual") {
        fixedJpy += exp.amountJpy / 12;
      } else if (exp.frequency === "quarterly") {
        const startMonth = exp.withdrawalMonth ?? 1;
        const diff = ((targetMonthNum - startMonth) % 3 + 3) % 3;
        if (diff === 0) fixedJpy += exp.amountJpy;
      }
    }

    // クレカ月次合計
    const ccRows = db
      .select({ amountJpy: creditCardWithdrawals.amountJpy })
      .from(creditCardWithdrawals)
      .where(like(creditCardWithdrawals.withdrawalDate, `${targetMonth}%`))
      .all();
    const creditJpy = ccRows.reduce((sum, r) => sum + r.amountJpy, 0);

    return {
      month: targetMonth,
      creditJpy,
      fixedJpy,
      totalJpy: creditJpy + fixedJpy,
    };
  });
}

// ─── 口座別引き落とし合計サマリー ─────────────────────────────────────────────

export interface AccountWithdrawalSummaryItem {
  accountId: number;
  accountName: string;
  institutionName: string | null;
  balanceJpy: number;
  creditCardTotalJpy: number;
  fixedExpenseTotalJpy: number;
  totalWithdrawalJpy: number;
  shortfallJpy: number;          // balanceJpy - totalWithdrawalJpy (negative = insufficient)
  nextWithdrawalDate: string | null;
}

/**
 * 口座ごとのクレカ引き落とし合計 + 固定費合計 を返す。
 * shortfallJpy < 0 の場合は残高不足。
 */
export function getWithdrawalAccountSummary(): AccountWithdrawalSummaryItem[] {
  const month = new Date().toISOString().slice(0, 7);
  const [, monthStr] = month.split("-");
  const targetMonthNum = parseInt(monthStr, 10);

  // 1. CASH 口座の最新残高を取得
  const latestCashDateRow = db
    .select({ date: portfolioSnapshots.date })
    .from(portfolioSnapshots)
    .innerJoin(assets, eq(portfolioSnapshots.assetId, assets.id))
    .where(eq(assets.assetType, "CASH"))
    .orderBy(desc(portfolioSnapshots.date))
    .limit(1)
    .get();

  if (!latestCashDateRow) return [];

  const cashRows = db
    .select({
      assetId: assets.id,
      name: assets.name,
      institutionName: assets.institutionName,
      balanceJpy: portfolioSnapshots.valueJpy,
    })
    .from(assets)
    .innerJoin(portfolioSnapshots, eq(portfolioSnapshots.assetId, assets.id))
    .where(and(eq(assets.assetType, "CASH"), eq(portfolioSnapshots.date, latestCashDateRow.date)))
    .all();

  // 2. cc_account_mapping を取得（cardName -> assetId）
  const settingsRepo = new SettingsRepo(sqlite);
  const mappingJson = settingsRepo.get("cc_account_mapping");
  const mapping: Record<string, number> = mappingJson ? (JSON.parse(mappingJson) as Record<string, number>) : {};

  // 3. 逆引きマッピング: assetId -> cardNames[]
  const reverseMapping = new Map<number, string[]>();
  for (const [cardName, assetId] of Object.entries(mapping)) {
    if (!reverseMapping.has(assetId)) reverseMapping.set(assetId, []);
    reverseMapping.get(assetId)!.push(cardName);
  }

  // 4. status='scheduled' のクレカ引き落とし全件取得
  const ccRows = db
    .select()
    .from(creditCardWithdrawals)
    .where(eq(creditCardWithdrawals.status, "scheduled"))
    .all();

  // 5. 固定費全件取得
  const fixedExpenseRepo = new FixedExpenseRepo(db);
  const expenses = fixedExpenseRepo.findAll();

  const today = new Date().toISOString().slice(0, 10);

  return cashRows.map((account) => {
    // クレカ合計（この口座に紐づくカードの引き落とし予定合計）
    const cardNames = reverseMapping.get(account.assetId) ?? [];
    const ccForAccount = ccRows.filter((r) => cardNames.includes(r.cardName));
    const creditCardTotalJpy = ccForAccount.reduce((sum, r) => sum + r.amountJpy, 0);

    // 次回引き落とし日（今日以降で最も近い日）
    const futureDates = ccForAccount
      .map((r) => r.withdrawalDate)
      .filter((d) => d >= today)
      .sort();
    const nextWithdrawalDate = futureDates[0] ?? null;

    // 固定費合計（この口座に紐づく固定費の当月換算合計）
    const fixedForAccount = expenses.filter((e) => e.assetId === account.assetId);
    let fixedExpenseTotalJpy = 0;
    for (const exp of fixedForAccount) {
      if (exp.frequency === "monthly") {
        fixedExpenseTotalJpy += exp.amountJpy;
      } else if (exp.frequency === "annual") {
        fixedExpenseTotalJpy += exp.amountJpy / 12;
      } else if (exp.frequency === "quarterly") {
        const startMonth = exp.withdrawalMonth ?? 1;
        const diff = ((targetMonthNum - startMonth) % 3 + 3) % 3;
        fixedExpenseTotalJpy += diff === 0 ? exp.amountJpy : 0;
      }
    }

    const totalWithdrawalJpy = creditCardTotalJpy + fixedExpenseTotalJpy;
    const shortfallJpy = account.balanceJpy - totalWithdrawalJpy;

    return {
      accountId: account.assetId,
      accountName: account.name,
      institutionName: account.institutionName ?? null,
      balanceJpy: account.balanceJpy,
      creditCardTotalJpy,
      fixedExpenseTotalJpy,
      totalWithdrawalJpy,
      shortfallJpy,
      nextWithdrawalDate,
    };
  });
}
