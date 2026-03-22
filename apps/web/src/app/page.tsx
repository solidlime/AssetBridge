import { trpc } from "@/lib/trpc";
import { formatJpy, formatPct, diffColor } from "@/lib/format";
import AssetHistoryChart from "@/components/charts/AssetHistoryChart";
import AllocationChart from "@/components/charts/AllocationChart";
import MonthlyExpenseChart from "@/components/charts/MonthlyExpenseChart";

const ALLOC_LABEL_MAP: Record<string, string> = {
  stockJpJpy: "日本株",
  stockUsJpy: "米国株",
  fundJpy: "投資信託",
  cashJpy: "現金",
  pensionJpy: "年金",
  pointJpy: "ポイント",
};

export const dynamic = 'force-dynamic';

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

async function getData() {
  const summaryMonth = new Date().toISOString().slice(0, 7);
  const [snapshot, withdrawals, monthlySummary, fixedExpenses, accountSummary] = await Promise.allSettled([
    trpc.portfolio.snapshot.query({}),
    trpc.incomeExpense.upcomingWithdrawals.query({ days: 60 }),
    trpc.incomeExpense.getMonthlyWithdrawalSummary.query({ month: summaryMonth }),
    trpc.incomeExpense.getFixedExpenses.query(),
    trpc.incomeExpense.getWithdrawalAccountSummary.query(),
  ]);

  return {
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    withdrawals:
      withdrawals.status === "fulfilled"
        ? withdrawals.value
        : { withdrawals: [], totalAmountJpy: 0, count: 0 },
    monthlySummary: monthlySummary.status === "fulfilled" ? monthlySummary.value : null,
    fixedExpenses: fixedExpenses.status === "fulfilled" ? fixedExpenses.value : [],
    accountSummary: accountSummary.status === "fulfilled" ? accountSummary.value : [],
    summaryMonth,
  };
}

export default async function DashboardPage() {
  const { snapshot, withdrawals, monthlySummary, fixedExpenses, accountSummary, summaryMonth } = await getData();
  const diffJpy = snapshot?.prevDiffJpy ?? 0;
  const diffPct = snapshot?.prevDiffPct ?? 0;
  const sign = diffJpy >= 0 ? "+" : "";
  
  const upcomingResult = withdrawals as unknown as UpcomingWithdrawalsResult;
  const monthlySummaryData = monthlySummary as MonthlyWithdrawalSummary | null;
  const fixedExpenseItems = fixedExpenses as FixedExpenseItem[];
  const accountSummaryItems = accountSummary as AccountWithdrawalSummaryItem[];

  const allocations = snapshot?.allocationPct
    ? Object.entries(snapshot.allocationPct)
        .filter(([, pct]) => (pct as number) > 0)
        .map(([key, pct]) => ({
          asset_type: ALLOC_LABEL_MAP[key] ?? key,
          name: ALLOC_LABEL_MAP[key] ?? key,
          value_jpy: snapshot.breakdown
            ? ((snapshot.breakdown as Record<string, number>)[key] ?? 0)
            : 0,
          pct: pct as number,
          percentage: pct as number,
        }))
    : [];

  const totalJpy = snapshot?.totalJpy ?? 0;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>ダッシュボード</h1>

      {/* 総資産カード */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>総資産</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {formatJpy(snapshot?.totalJpy ?? 0)}
          </div>
          <div style={{ fontSize: 14, color: diffColor(diffJpy), marginTop: 4 }}>
            {sign}{formatJpy(Math.abs(diffJpy))} ({formatPct(diffPct)})
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
            <span style={{ color: "#64748b" }}>
              前月比:{" "}
              <span style={{ color: snapshot?.prevMonthDiffJpy != null ? diffColor(snapshot.prevMonthDiffJpy) : "#64748b" }}>
                {fmtDiffPct(snapshot?.prevMonthDiffPct)}
              </span>
            </span>
            <span style={{ color: "#64748b" }}>
              前年比:{" "}
              <span style={{ color: snapshot?.prevYearDiffJpy != null ? diffColor(snapshot.prevYearDiffJpy) : "#64748b" }}>
                {fmtDiffPct(snapshot?.prevYearDiffPct)}
              </span>
            </span>
          </div>
        </div>

        {/* カテゴリ別内訳 */}
        {snapshot?.breakdown && (() => {
          const cats: Array<{
            name: string;
            valueKey: string;
            diffJpy: number | null | undefined;
            diffPct: number | null | undefined;
          }> = [
            { name: "日本株",    valueKey: "stockJpJpy",  diffJpy: snapshot.stockJpPrevDiffJpy,  diffPct: snapshot.stockJpPrevDiffPct  },
            { name: "米国株",    valueKey: "stockUsJpy",  diffJpy: snapshot.stockUsPrevDiffJpy,  diffPct: snapshot.stockUsPrevDiffPct  },
            { name: "投資信託",  valueKey: "fundJpy",     diffJpy: snapshot.fundPrevDiffJpy,     diffPct: snapshot.fundPrevDiffPct     },
            { name: "現金",      valueKey: "cashJpy",     diffJpy: snapshot.cashPrevDiffJpy,     diffPct: snapshot.cashPrevDiffPct     },
            { name: "年金",      valueKey: "pensionJpy",  diffJpy: snapshot.pensionPrevDiffJpy,  diffPct: snapshot.pensionPrevDiffPct  },
            { name: "ポイント",  valueKey: "pointJpy",    diffJpy: snapshot.pointPrevDiffJpy,    diffPct: snapshot.pointPrevDiffPct    },
          ];
          return cats.map(({ name, valueKey, diffJpy, diffPct }) => {
            const value = (snapshot.breakdown as Record<string, number>)[valueKey] ?? 0;
            const diffSign = (diffJpy ?? 0) >= 0 ? "+" : "";
            const diffColor2 = diffJpy == null ? "#64748b" : diffJpy >= 0 ? "#4ade80" : "#f87171";
            return (
              <div key={name} style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{name}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatJpy(value)}</div>
                {diffJpy != null && (
                  <div style={{ fontSize: 12, color: diffColor2, marginTop: 4 }}>
                    {diffSign}{formatJpy(Math.abs(diffJpy))}
                    {diffPct != null && ` / ${diffSign}${Math.abs(diffPct).toFixed(1)}%`}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* 資産推移グラフ（期間はコンポーネント内で自律取得） */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>資産推移</h2>
        <AssetHistoryChart />
      </div>

      {/* アセット配分 */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>アセット配分</h2>
        {allocations.length > 0 ? (
          <AllocationChart allocations={allocations} totalJpy={totalJpy} />
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        )}
      </div>

      {/* 引き落とし管理 */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>
          🏦 引き落とし管理
        </h2>

        {/* 残高不足口座アラート */}
        {accountSummaryItems.filter((a) => a.shortfallJpy < 0).map((item) => {
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
              <span style={{ fontFamily: "monospace" }}>¥{shortage.toLocaleString("ja-JP")}</span>
              円不足
              {item.nextWithdrawalDate && (
                <span style={{ fontWeight: 400, marginLeft: 8, color: "#f87171" }}>
                  （引き落とし日: {item.nextWithdrawalDate}）
                </span>
              )}
            </div>
          );
        })}

        {/* 月次支出サマリーカード（横並び3枚） */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 18 }}>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>💳 クレカ小計</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>
              {formatJpy(monthlySummaryData?.creditCardTotal ?? upcomingResult.totalAmountJpy)}
            </div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 18 }}>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>🏠 固定費小計（月次換算）</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>
              {formatJpy(monthlySummaryData?.fixedExpenseTotal ?? 0)}
            </div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 18, borderLeft: "3px solid #3b82f6" }}>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>📊 総支出予定</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>
              {formatJpy(monthlySummaryData?.grandTotal ?? upcomingResult.totalAmountJpy)}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{summaryMonth}</div>
          </div>
        </div>
        
        {upcomingResult && upcomingResult.withdrawals.length > 0 ? (
          <>
            {/* 引き落とし一覧テーブル */}
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, overflowX: "auto", marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 12, marginTop: 0 }}>
                クレジットカード引き落とし予定（直近・今後）
              </h3>
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
                aria-label="クレジットカード引き落とし予定テーブル"
              >
                <thead>
                  <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>カード名</th>
                    <th style={{ textAlign: "center", padding: "8px 0" }}>引き落とし日</th>
                    <th style={{ textAlign: "center", padding: "8px 0" }}>残り日数</th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>金額</th>
                    <th style={{ textAlign: "center", padding: "8px 0" }}>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingResult.withdrawals.map((w) => {
                    const days = daysUntil(w.withdrawalDate);
                    const urgentColor = days <= 7 ? "#f87171" : days <= 14 ? "#fbbf24" : "#94a3b8";
                    return (
                      <tr key={w.id} style={{ borderBottom: "1px solid #0f172a" }}>
                        <td style={{ padding: "10px 0", fontWeight: 600 }}>{w.cardName}</td>
                        <td style={{ textAlign: "center", padding: "10px 0" }}>
                          {formatDate(w.withdrawalDate)}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 0", color: urgentColor }}>
                          {days === 0 ? "今日" : days > 0 ? `${days}日後` : `${Math.abs(days)}日前`}
                        </td>
                        <td style={{ textAlign: "right", padding: "10px 0", color: "#f87171", fontWeight: 600 }}>
                          {formatJpy(w.amountJpy)}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 0" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 12,
                              background: w.status === "withdrawn" ? "#1e3a2f" : "#1e293b",
                              color: w.status === "withdrawn" ? "#4ade80" : "#fbbf24",
                              border: `1px solid ${w.status === "withdrawn" ? "#4ade80" : "#fbbf24"}`,
                            }}
                          >
                            {w.status === "withdrawn" ? "引き落とし済" : "予定"}
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
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0", margin: 0 }}>
              引き落とし予定データがありません。スクレイプを実行してデータを取得してください。
            </p>
          </div>
        )}

        {/* 固定費簡略表示 */}
        {fixedExpenseItems.length > 0 && (
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 12, marginTop: 0 }}>
              🏠 固定費一覧
            </h3>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
              aria-label="固定費一覧テーブル"
            >
              <thead>
                <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                  <th style={{ textAlign: "left", padding: "8px 0" }}>名称</th>
                  <th style={{ textAlign: "center", padding: "8px 0" }}>頻度</th>
                  <th style={{ textAlign: "right", padding: "8px 0" }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {fixedExpenseItems.map((fe) => (
                  <tr key={fe.id} style={{ borderBottom: "1px solid #0f172a" }}>
                    <td style={{ padding: "8px 0", fontWeight: 500 }}>{fe.name}</td>
                    <td style={{ textAlign: "center", padding: "8px 0", color: "#94a3b8", fontSize: 12 }}>
                      {fe.frequency === "monthly" ? "毎月" : fe.frequency === "annual" ? "年1回" : "四半期"}
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 0", fontFamily: "monospace", color: "#fbbf24" }}>
                      {formatJpy(fe.amountJpy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

        {/* 月別支出予定グラフ */}
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>📅 月別支出予定</h2>
          <MonthlyExpenseChart />
        </div>

      {!snapshot && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          データがありません。スクレイパーを実行してデータを取得してください。
        </div>
      )}
    </div>
  );
}
