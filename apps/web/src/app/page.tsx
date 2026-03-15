import { trpc } from "@/lib/trpc";
import { formatJpy, formatPct, diffColor } from "@/lib/format";
import AssetHistoryChart from "@/components/charts/AssetHistoryChart";

async function getData() {
  try {
    const [snapshot, history] = await Promise.all([
      trpc.portfolio.snapshot.query({}),
      trpc.portfolio.history.query({ days: 30 }),
    ]);
    return { snapshot, history };
  } catch {
    return { snapshot: null, history: null };
  }
}

export default async function DashboardPage() {
  const { snapshot, history } = await getData();
  const diffJpy = snapshot?.prevDiffJpy ?? 0;
  const diffPct = snapshot?.prevDiffPct ?? 0;
  const sign = diffJpy >= 0 ? "+" : "";

  const topGainers = snapshot?.topGainers ?? [];
  const topLosers = snapshot?.topLosers ?? [];
  const pnlRanking = [...topGainers, ...topLosers]
    .sort((a, b) => Math.abs(b.unrealizedPnlJpy) - Math.abs(a.unrealizedPnlJpy))
    .slice(0, 5);

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
        </div>

        {/* カテゴリ別内訳 */}
        {snapshot?.breakdown && Object.entries({
          "日本株": snapshot.breakdown.stockJpJpy,
          "米国株": snapshot.breakdown.stockUsJpy,
          "投資信託": snapshot.breakdown.fundJpy,
          "暗号資産": snapshot.breakdown.cryptoJpy,
          "現金": snapshot.breakdown.cashJpy,
        }).map(([name, value]) => (
          <div key={name} style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{name}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatJpy(value as number)}</div>
          </div>
        ))}
      </div>

      {/* 30日資産推移グラフ */}
      {Array.isArray(history) && history.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>資産推移</h2>
          <AssetHistoryChart data={history} />
        </div>
      )}

      {/* 含み損益 TOP5 */}
      {pnlRanking.length > 0 && (
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
              {pnlRanking.map((item) => {
                const pnlJpy = item.unrealizedPnlJpy;
                const s = pnlJpy >= 0 ? "+" : "";
                const c = pnlJpy >= 0 ? "#4ade80" : "#f87171";
                return (
                  <tr key={item.assetId} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "10px 0" }}>{item.name}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(item.valueJpy)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: c }}>
                      {s}{formatJpy(Math.abs(pnlJpy))} ({s}{item.unrealizedPnlPct.toFixed(1)}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!snapshot && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 32, textAlign: "center", color: "#94a3b8" }}>
          データがありません。スクレイパーを実行してデータを取得してください。
        </div>
      )}
    </div>
  );
}
