import { trpc } from "@/lib/trpc";
import { formatJpy } from "@/lib/format";
import IncomeExpenseChart from "@/components/charts/IncomeExpenseChart";

export const dynamic = 'force-dynamic';

type CreditWithdrawal = {
  id: number;
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
  status: "scheduled" | "withdrawn";
  scrapedAt: string;
  bankAccount?: string;
};

type UpcomingWithdrawalsResult = {
  withdrawals: CreditWithdrawal[];
  totalAmountJpy: number;
  count: number;
};

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(5, 7);
  const d = dateStr.slice(8, 10);
  return `${y}/${m}/${d}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400_000);
}

export default async function IncomeExpensePage() {
  // 月別収支（スタブ）
  const monthlyData: any = { data: [], avg_income_jpy: 0, avg_expense_jpy: 0, avg_net_jpy: 0 };

  // クレカ引き落とし予定（60日以内）
  let upcomingResult: UpcomingWithdrawalsResult | null = null;
  let withdrawalError: string | null = null;
  // カード→口座名マッピング（getCcBalanceStatus から構築）
  const accountNameMap: Record<string, string> = {};

  try {
    const [withdrawalsData, balanceStatus] = await Promise.all([
      trpc.incomeExpense.upcomingWithdrawals.query({ days: 60 }) as unknown as UpcomingWithdrawalsResult,
      trpc.incomeExpense.getCcBalanceStatus.query().catch(() => null),
    ]);
    // 口座名マップを構築
    if (balanceStatus?.summary) {
      for (const item of balanceStatus.summary) {
        if (item.accountName) {
          accountNameMap[item.cardName] = item.accountName;
        }
      }
    }
    // withdrawals に bankAccount を付与
    upcomingResult = {
      ...withdrawalsData,
      withdrawals: withdrawalsData.withdrawals.map((w) => ({
        ...w,
        bankAccount: accountNameMap[w.cardName],
      })),
    };
  } catch (e) {
    withdrawalError = e instanceof Error ? e.message : "引き落とし情報の取得に失敗しました";
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>収支</h1>

      {/* クレカ引き落とし予定セクション */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>
          クレジットカード引き落とし予定（60日以内）
        </h2>

        {withdrawalError ? (
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
            <p style={{ color: "#f87171" }}>{withdrawalError}</p>
          </div>
        ) : upcomingResult && upcomingResult.withdrawals.length > 0 ? (
          <>
            {/* 引き落とし合計カード */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>60日以内の引き落とし合計</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#f87171" }}>
                  {formatJpy(upcomingResult.totalAmountJpy)}
                </div>
              </div>
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>引き落とし件数</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {upcomingResult.count} 件
                </div>
              </div>
            </div>

            {/* 引き落とし一覧テーブル */}
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
                aria-label="クレジットカード引き落とし予定テーブル"
              >
                <thead>
                  <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>カード名</th>
                    <th style={{ textAlign: "center", padding: "8px 0" }}>引き落とし日</th>
                    <th style={{ textAlign: "center", padding: "8px 0" }}>残り日数</th>
                     <th style={{ textAlign: "left", padding: "8px 12px" }}>口座</th>
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
                        <td style={{ padding: "10px 0", paddingLeft: 12, color: "#94a3b8" }}>{w.bankAccount ?? '—'}</td>
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
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
            <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
              引き落とし予定データがありません。スクレイプを実行してデータを取得してください。
            </p>
            <p style={{ color: "#475569", fontSize: 12, textAlign: "center" }}>
              引き落とし情報は次回スクレイプ時に更新されます。
            </p>
          </div>
        )}
      </div>

      {/* サマリーカード（月別収支） */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>月別収支</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>平均月収</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{formatJpy(monthlyData.avg_income_jpy)}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>平均月支出</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f87171" }}>{formatJpy(monthlyData.avg_expense_jpy)}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>平均純収支</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: monthlyData.avg_net_jpy >= 0 ? "#4ade80" : "#f87171" }}>
            {formatJpy(monthlyData.avg_net_jpy)}
          </div>
        </div>
      </div>

      {/* 月別収支棒グラフ */}
      {monthlyData.data && monthlyData.data.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>月別収支グラフ</h2>
          <IncomeExpenseChart data={monthlyData.data} />
        </div>
      )}

      {/* 月別テーブル */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>月別収支</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
              <th style={{ textAlign: "left", padding: "8px 0" }}>年月</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>収入</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>支出</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>純収支</th>
            </tr>
          </thead>
          <tbody>
            {(monthlyData.data || []).length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: "32px 0", color: "#475569", fontSize: 13 }}>
                  収支データがありません。スクレイプを実行してデータを取得してください。
                </td>
              </tr>
            ) : (monthlyData.data || []).map((cf: any) => {
              const net = cf.net_jpy;
              const c = net >= 0 ? "#4ade80" : "#f87171";
              return (
                <tr key={cf.year_month} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 0" }}>{cf.year_month.slice(0, 4)}/{cf.year_month.slice(4)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: "#4ade80" }}>+{formatJpy(cf.income_jpy)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: "#f87171" }}>-{formatJpy(cf.expense_jpy)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: c }}>{formatJpy(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
