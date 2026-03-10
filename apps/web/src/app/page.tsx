import { api } from "@/lib/api";
import AssetHistoryChart from "@/components/charts/AssetHistoryChart";

async function getData() {
  try {
    const [summary, history, allocation, pnl] = await Promise.all([
      api.portfolio.summary(),
      api.portfolio.history(30),
      api.insights.allocation(),
      api.insights.pnlRanking(5),
    ]);
    return { summary, history, allocation, pnl };
  } catch {
    return { summary: null, history: null, allocation: null, pnl: null };
  }
}

export default async function DashboardPage() {
  const { summary, history, pnl } = await getData();
  const diffJpy = summary?.prev_day_diff_jpy ?? 0;
  const diffPct = summary?.prev_day_diff_pct ?? 0;
  const sign = diffJpy >= 0 ? "+" : "";
  const diffColor = diffJpy >= 0 ? "#4ade80" : "#f87171";

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>ダッシュボード</h1>

      {/* 総資産カード */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>総資産</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            ¥{(summary?.total_jpy ?? 0).toLocaleString("ja-JP")}
          </div>
          <div style={{ fontSize: 14, color: diffColor, marginTop: 4 }}>
            {sign}¥{Math.abs(diffJpy).toLocaleString("ja-JP")} ({sign}{diffPct.toFixed(2)}%)
          </div>
        </div>

        {/* カテゴリ別内訳 */}
        {summary?.breakdown && Object.entries({
          "日本株": summary.breakdown.stock_jp_jpy,
          "米国株": summary.breakdown.stock_us_jpy,
          "投資信託": summary.breakdown.fund_jpy,
          "暗号資産": summary.breakdown.crypto_jpy,
          "現金": summary.breakdown.cash_jpy,
        }).map(([name, value]) => (
          <div key={name} style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{name}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>¥{(value as number).toLocaleString("ja-JP")}</div>
          </div>
        ))}
      </div>

      {/* 30日資産推移グラフ */}
      {history?.history && history.history.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>資産推移</h2>
          <AssetHistoryChart data={history.history} />
        </div>
      )}

      {/* AIコメントカード */}
      {summary?.ai_comment && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24, borderLeft: "3px solid #60a5fa" }}>
          <div style={{ fontSize: 12, color: "#60a5fa", marginBottom: 8 }}>AI コメント</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#e2e8f0" }}>{summary.ai_comment}</p>
        </div>
      )}

      {/* 含み損益 TOP5 */}
      {pnl?.ranking && pnl.ranking.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>含み損益 TOP5</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <th style={{ textAlign: "left", padding: "8px 0" }}>銘柄</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>評価額</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>損益</th>
              </tr>
            </thead>
            <tbody>
              {pnl.ranking.slice(0, 5).map((item: any) => {
                const pnlJpy = item.unrealized_pnl_jpy;
                const s = pnlJpy >= 0 ? "+" : "";
                const c = pnlJpy >= 0 ? "#4ade80" : "#f87171";
                return (
                  <tr key={item.asset_id} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "10px 0" }}>{item.name}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>¥{item.value_jpy.toLocaleString("ja-JP")}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: c }}>
                      {s}¥{Math.abs(pnlJpy).toLocaleString("ja-JP")} ({s}{item.unrealized_pnl_pct.toFixed(1)}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!summary && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 32, textAlign: "center", color: "#94a3b8" }}>
          データがありません。スクレイパーを実行してデータを取得してください。
        </div>
      )}
    </div>
  );
}
