"use client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DashboardBlock } from "@/components/DashboardBlock";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import AssetHistoryChart from "@/components/charts/AssetHistoryChart";
import AllocationChart from "@/components/charts/AllocationChart";
import MonthlyExpenseChart from "@/components/charts/MonthlyExpenseChart";
import { formatJpy, formatPct, diffColor } from "@/lib/format";

// ─── 型定義 ────────────────────────────────────────────────────────────────

type SnapshotData = {
  totalJpy: number;
  prevDiffJpy?: number | null;
  prevDiffPct?: number | null;
  prevMonthDiffJpy?: number | null;
  prevMonthDiffPct?: number | null;
  prevYearDiffJpy?: number | null;
  prevYearDiffPct?: number | null;
  breakdown?: Record<string, number>;
  allocationPct?: Record<string, number>;
  stockJpPrevDiffJpy?: number | null;
  stockJpPrevDiffPct?: number | null;
  stockUsPrevDiffJpy?: number | null;
  stockUsPrevDiffPct?: number | null;
  fundPrevDiffJpy?: number | null;
  fundPrevDiffPct?: number | null;
  cashPrevDiffJpy?: number | null;
  cashPrevDiffPct?: number | null;
  pensionPrevDiffJpy?: number | null;
  pensionPrevDiffPct?: number | null;
  pointPrevDiffJpy?: number | null;
  pointPrevDiffPct?: number | null;
};

type CreditWithdrawal = {
  id: number;
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
  status: "scheduled" | "withdrawn";
  scrapedAt: string;
};

type UpcomingWithdrawalsResult = {
  withdrawals: CreditWithdrawal[];
  totalAmountJpy: number;
  count: number;
};

type FixedExpenseItem = {
  id: number;
  name: string;
  amountJpy: number;
  frequency: "monthly" | "annual" | "quarterly";
};

type MonthlyWithdrawalSummary = {
  month: string;
  fixedExpenseTotal: number;
  creditCardTotal: number;
  grandTotal: number;
  linkedAssetIds: number[];
};

type AccountWithdrawalSummaryItem = {
  accountId: number;
  accountName: string;
  institutionName: string | null;
  balanceJpy: number;
  totalWithdrawalJpy: number;
  shortfallJpy: number;
  nextWithdrawalDate: string | null;
};

type AllocationItem = {
  asset_type: string;
  name: string;
  value_jpy: number;
  pct: number;
  percentage: number;
};

export interface DashboardClientProps {
  snapshot: SnapshotData | null;
  upcomingResult: UpcomingWithdrawalsResult;
  monthlySummaryData: MonthlyWithdrawalSummary | null;
  fixedExpenseItems: FixedExpenseItem[];
  accountSummaryItems: AccountWithdrawalSummaryItem[];
  summaryMonth: string;
  allocations: AllocationItem[];
  totalJpy: number;
  diffJpy: number;
  diffPct: number;
}

// ─── ユーティリティ ────────────────────────────────────────────────────────

const ALLOC_LABEL_MAP: Record<string, string> = {
  stockJpJpy: "日本株",
  stockUsJpy: "米国株",
  fundJpy: "投資信託",
  cashJpy: "現金",
  pensionJpy: "年金",
  pointJpy: "ポイント",
};

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(5, 7);
  const d = dateStr.slice(8, 10);
  return `${y}/${m}/${d}`;
}

function fmtDiffPct(pct: number | null | undefined): string {
  if (pct == null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400_000);
}

// ─── メインコンポーネント ──────────────────────────────────────────────────

export function DashboardClient({
  snapshot,
  upcomingResult,
  monthlySummaryData,
  fixedExpenseItems,
  accountSummaryItems,
  summaryMonth,
  allocations,
  totalJpy,
  diffJpy,
  diffPct,
}: DashboardClientProps) {
  const { blockIds, handleDragEnd } = useDashboardLayout();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sign = diffJpy >= 0 ? "+" : "";

  // ─── ブロック定義 ──────────────────────────────────────────────────────

  const renderBlock = (id: string) => {
    switch (id) {
      // 資産推移グラフ
      case "asset-history":
        return (
          <div
            style={{
              background: "#1e293b",
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              資産推移
            </h2>
            <AssetHistoryChart />
          </div>
        );

      // アセット配分
      case "category-allocation":
        return (
          <div
            style={{
              background: "#1e293b",
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              アセット配分
            </h2>
            {allocations.length > 0 ? (
              <AllocationChart
                allocations={allocations}
                totalJpy={totalJpy}
              />
            ) : (
              <p style={{ color: "#94a3b8", textAlign: "center" }}>
                データがありません
              </p>
            )}
          </div>
        );

      // 月別支出予定グラフ
      case "monthly-expense":
        return (
          <div
            style={{
              background: "#1e293b",
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              📅 月別支出予定
            </h2>
            <MonthlyExpenseChart />
          </div>
        );

      // クレジットカード引き落とし管理
      case "credit-card":
        return (
          <div style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 16,
                color: "#e2e8f0",
              }}
            >
              🏦 引き落とし管理
            </h2>

            {/* 月次支出サマリーカード（横並び3枚） */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 12,
                  padding: 18,
                }}
              >
                <div
                  style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}
                >
                  💳 クレカ小計
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#f87171",
                    fontFamily: "monospace",
                  }}
                >
                  {formatJpy(
                    monthlySummaryData?.creditCardTotal ??
                      upcomingResult.totalAmountJpy
                  )}
                </div>
              </div>
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 12,
                  padding: 18,
                }}
              >
                <div
                  style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}
                >
                  🏠 固定費小計（月次換算）
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#fbbf24",
                    fontFamily: "monospace",
                  }}
                >
                  {formatJpy(monthlySummaryData?.fixedExpenseTotal ?? 0)}
                </div>
              </div>
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 12,
                  padding: 18,
                  borderLeft: "3px solid #3b82f6",
                }}
              >
                <div
                  style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}
                >
                  📊 総支出予定
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: "monospace",
                  }}
                >
                  {formatJpy(
                    monthlySummaryData?.grandTotal ??
                      upcomingResult.totalAmountJpy
                  )}
                </div>
                <div
                  style={{ fontSize: 11, color: "#475569", marginTop: 4 }}
                >
                  {summaryMonth}
                </div>
              </div>
            </div>

            {upcomingResult && upcomingResult.withdrawals.length > 0 ? (
              <>
                {/* 引き落とし一覧テーブル */}
                <div
                  style={{
                    background: "#1e293b",
                    borderRadius: 12,
                    padding: 24,
                    overflowX: "auto",
                    marginBottom: 16,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#94a3b8",
                      marginBottom: 12,
                      marginTop: 0,
                    }}
                  >
                    クレジットカード引き落とし予定（直近・今後）
                  </h3>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 14,
                    }}
                    aria-label="クレジットカード引き落とし予定テーブル"
                  >
                    <thead>
                      <tr
                        style={{
                          color: "#94a3b8",
                          borderBottom: "1px solid #334155",
                        }}
                      >
                        <th style={{ textAlign: "left", padding: "8px 0" }}>
                          カード名
                        </th>
                        <th
                          style={{ textAlign: "center", padding: "8px 0" }}
                        >
                          引き落とし日
                        </th>
                        <th
                          style={{ textAlign: "center", padding: "8px 0" }}
                        >
                          残り日数
                        </th>
                        <th style={{ textAlign: "right", padding: "8px 0" }}>
                          金額
                        </th>
                        <th
                          style={{ textAlign: "center", padding: "8px 0" }}
                        >
                          状態
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingResult.withdrawals.map((w) => {
                        const days = daysUntil(w.withdrawalDate);
                        const urgentColor =
                          days <= 7
                            ? "#f87171"
                            : days <= 14
                            ? "#fbbf24"
                            : "#94a3b8";
                        return (
                          <tr
                            key={w.id}
                            style={{ borderBottom: "1px solid #0f172a" }}
                          >
                            <td
                              style={{ padding: "10px 0", fontWeight: 600 }}
                            >
                              {w.cardName}
                            </td>
                            <td
                              style={{
                                textAlign: "center",
                                padding: "10px 0",
                              }}
                            >
                              {formatDate(w.withdrawalDate)}
                            </td>
                            <td
                              style={{
                                textAlign: "center",
                                padding: "10px 0",
                                color: urgentColor,
                              }}
                            >
                              {days === 0
                                ? "今日"
                                : days > 0
                                ? `${days}日後`
                                : `${Math.abs(days)}日前`}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                padding: "10px 0",
                                color: "#f87171",
                                fontWeight: 600,
                              }}
                            >
                              {formatJpy(w.amountJpy)}
                            </td>
                            <td
                              style={{
                                textAlign: "center",
                                padding: "10px 0",
                              }}
                            >
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontSize: 12,
                                  background:
                                    w.status === "withdrawn"
                                      ? "#1e3a2f"
                                      : "#1e293b",
                                  color:
                                    w.status === "withdrawn"
                                      ? "#4ade80"
                                      : "#fbbf24",
                                  border: `1px solid ${
                                    w.status === "withdrawn"
                                      ? "#4ade80"
                                      : "#fbbf24"
                                  }`,
                                }}
                              >
                                {w.status === "withdrawn"
                                  ? "引き落とし済"
                                  : "予定"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 16,
                }}
              >
                <p
                  style={{
                    color: "#475569",
                    fontSize: 13,
                    textAlign: "center",
                    padding: "16px 0",
                    margin: 0,
                  }}
                >
                  引き落とし予定データがありません。スクレイプを実行してデータを取得してください。
                </p>
              </div>
            )}

            {/* 固定費簡略表示 */}
            {fixedExpenseItems.length > 0 && (
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 12,
                  padding: 24,
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#94a3b8",
                    marginBottom: 12,
                    marginTop: 0,
                  }}
                >
                  🏠 固定費一覧
                </h3>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 14,
                  }}
                  aria-label="固定費一覧テーブル"
                >
                  <thead>
                    <tr
                      style={{
                        color: "#94a3b8",
                        borderBottom: "1px solid #334155",
                      }}
                    >
                      <th style={{ textAlign: "left", padding: "8px 0" }}>
                        名称
                      </th>
                      <th
                        style={{ textAlign: "center", padding: "8px 0" }}
                      >
                        頻度
                      </th>
                      <th style={{ textAlign: "right", padding: "8px 0" }}>
                        金額
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedExpenseItems.map((fe) => (
                      <tr
                        key={fe.id}
                        style={{ borderBottom: "1px solid #0f172a" }}
                      >
                        <td style={{ padding: "8px 0", fontWeight: 500 }}>
                          {fe.name}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            padding: "8px 0",
                            color: "#94a3b8",
                            fontSize: 12,
                          }}
                        >
                          {fe.frequency === "monthly"
                            ? "毎月"
                            : fe.frequency === "annual"
                            ? "年1回"
                            : "四半期"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            padding: "8px 0",
                            fontFamily: "monospace",
                            color: "#fbbf24",
                          }}
                        >
                          {formatJpy(fe.amountJpy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      // 残高不足口座アラート
      case "balance-warning": {
        const shortfallAccounts = accountSummaryItems.filter(
          (a) => a.shortfallJpy < 0
        );
        return (
          <div style={{ marginBottom: 16 }}>
            {shortfallAccounts.length > 0 ? (
              shortfallAccounts.map((item) => {
                const shortage = Math.abs(item.shortfallJpy);
                const accountLabel = item.institutionName
                  ? `${item.institutionName} - ${item.accountName}`
                  : item.accountName;
                return (
                  <div
                    key={item.accountId}
                    style={{
                      background: "#450a0a",
                      border: "1px solid #f87171",
                      borderRadius: 10,
                      padding: "10px 16px",
                      marginBottom: 12,
                      fontSize: 14,
                      color: "#fca5a5",
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {accountLabel}:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      ¥{shortage.toLocaleString("ja-JP")}
                    </span>
                    円不足
                    {item.nextWithdrawalDate && (
                      <span
                        style={{
                          fontWeight: 400,
                          marginLeft: 8,
                          color: "#f87171",
                        }}
                      >
                        （引き落とし日: {item.nextWithdrawalDate}）
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 10,
                  padding: "10px 16px",
                  marginBottom: 12,
                  fontSize: 14,
                  color: "#4ade80",
                }}
              >
                ✅ 残高不足の口座はありません
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ─── 総資産カード（固定ヘッダー、ドラッグ対象外） ─────────────────────

  const cats: Array<{
    name: string;
    valueKey: string;
    diffJpy: number | null | undefined;
    diffPct: number | null | undefined;
  }> = [
    {
      name: "日本株",
      valueKey: "stockJpJpy",
      diffJpy: snapshot?.stockJpPrevDiffJpy,
      diffPct: snapshot?.stockJpPrevDiffPct,
    },
    {
      name: "米国株",
      valueKey: "stockUsJpy",
      diffJpy: snapshot?.stockUsPrevDiffJpy,
      diffPct: snapshot?.stockUsPrevDiffPct,
    },
    {
      name: "投資信託",
      valueKey: "fundJpy",
      diffJpy: snapshot?.fundPrevDiffJpy,
      diffPct: snapshot?.fundPrevDiffPct,
    },
    {
      name: "現金",
      valueKey: "cashJpy",
      diffJpy: snapshot?.cashPrevDiffJpy,
      diffPct: snapshot?.cashPrevDiffPct,
    },
    {
      name: "年金",
      valueKey: "pensionJpy",
      diffJpy: snapshot?.pensionPrevDiffJpy,
      diffPct: snapshot?.pensionPrevDiffPct,
    },
    {
      name: "ポイント",
      valueKey: "pointJpy",
      diffJpy: snapshot?.pointPrevDiffJpy,
      diffPct: snapshot?.pointPrevDiffPct,
    },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        ダッシュボード
      </h1>

      {/* 総資産カード（固定 - ドラッグ対象外） */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
            総資産
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {formatJpy(snapshot?.totalJpy ?? 0)}
          </div>
          <div
            style={{
              fontSize: 14,
              color: diffColor(diffJpy),
              marginTop: 4,
            }}
          >
            {sign}
            {formatJpy(Math.abs(diffJpy))} ({formatPct(diffPct)})
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 6,
              fontSize: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#64748b" }}>
              前月比:{" "}
              <span
                style={{
                  color:
                    snapshot?.prevMonthDiffJpy != null
                      ? diffColor(snapshot.prevMonthDiffJpy)
                      : "#64748b",
                }}
              >
                {fmtDiffPct(snapshot?.prevMonthDiffPct)}
              </span>
            </span>
            <span style={{ color: "#64748b" }}>
              前年比:{" "}
              <span
                style={{
                  color:
                    snapshot?.prevYearDiffJpy != null
                      ? diffColor(snapshot.prevYearDiffJpy)
                      : "#64748b",
                }}
              >
                {fmtDiffPct(snapshot?.prevYearDiffPct)}
              </span>
            </span>
          </div>
        </div>

        {/* カテゴリ別内訳 */}
        {snapshot?.breakdown &&
          cats.map(({ name, valueKey, diffJpy: catDiffJpy, diffPct: catDiffPct }) => {
            const value =
              (snapshot.breakdown as Record<string, number>)[valueKey] ?? 0;
            const catSign = (catDiffJpy ?? 0) >= 0 ? "+" : "";
            const catDiffColor =
              catDiffJpy == null
                ? "#64748b"
                : catDiffJpy >= 0
                ? "#4ade80"
                : "#f87171";
            return (
              <div
                key={name}
                style={{
                  background: "#1e293b",
                  borderRadius: 12,
                  padding: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#94a3b8",
                    marginBottom: 8,
                  }}
                >
                  {name}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {formatJpy(value)}
                </div>
                {catDiffJpy != null && (
                  <div
                    style={{
                      fontSize: 12,
                      color: catDiffColor,
                      marginTop: 4,
                    }}
                  >
                    {catSign}
                    {formatJpy(Math.abs(catDiffJpy))}
                    {catDiffPct != null &&
                      ` / ${catSign}${Math.abs(catDiffPct).toFixed(1)}%`}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* ドラッグ可能なブロック群 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blockIds}
          strategy={verticalListSortingStrategy}
        >
          {blockIds.map((id) => {
            const content = renderBlock(id);
            if (!content) return null;
            return (
              <DashboardBlock key={id} id={id}>
                {content}
              </DashboardBlock>
            );
          })}
        </SortableContext>
      </DndContext>

      {!snapshot && (
        <div
          style={{
            background: "#1e293b",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          データがありません。スクレイパーを実行してデータを取得してください。
        </div>
      )}
    </div>
  );
}
