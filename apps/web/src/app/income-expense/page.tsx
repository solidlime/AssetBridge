import { api } from "@/lib/api";
import { formatJpy } from "@/lib/format";
import IncomeExpenseChart from "@/components/charts/IncomeExpenseChart";

export default async function IncomeExpensePage() {
  let data: any = { data: [], avg_income_jpy: 0, avg_expense_jpy: 0, avg_net_jpy: 0 };
  try {
    data = await api.incomeExpense.get(12);
  } catch {}

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>収支</h1>

      {/* サマリーカード */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>平均月収</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{formatJpy(data.avg_income_jpy)}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>平均月支出</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f87171" }}>{formatJpy(data.avg_expense_jpy)}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>平均純収支</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: data.avg_net_jpy >= 0 ? "#4ade80" : "#f87171" }}>
            {formatJpy(data.avg_net_jpy)}
          </div>
        </div>
      </div>

      {/* 月別収支棒グラフ */}
      {data.data && data.data.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>月別収支グラフ</h2>
          <IncomeExpenseChart data={data.data} />
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
            {(data.data || []).map((cf: any) => {
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
