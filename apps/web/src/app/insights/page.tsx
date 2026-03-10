import { api } from "@/lib/api";
import AllocationChart from "@/components/charts/AllocationChart";
import PnLRankingChart from "@/components/charts/PnLRankingChart";

export default async function InsightsPage() {
  let allocation: any = { allocations: [] };
  let pnl: any = { ranking: [] };
  try {
    [allocation, pnl] = await Promise.all([
      api.insights.allocation(),
      api.insights.pnlRanking(10),
    ]);
  } catch {}

  const totalJpy = (allocation.allocations || []).reduce(
    (s: number, a: any) => s + a.value_jpy,
    0
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>インサイト</h1>

      {/* 資産配分ドーナツ */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>アセット配分</h2>
        {allocation.allocations && allocation.allocations.length > 0 ? (
          <AllocationChart allocations={allocation.allocations} totalJpy={totalJpy} />
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        )}
      </div>

      {/* 含み損益ランキング横棒グラフ */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>含み損益ランキング</h2>
        {pnl.ranking && pnl.ranking.length > 0 ? (
          <PnLRankingChart ranking={pnl.ranking} />
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        )}
      </div>

      {/* リスク分析カード */}
      {allocation.concentration_score != null && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>リスク分析</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>集中度スコア</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{allocation.concentration_score?.toFixed(2) ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>分散度</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{allocation.diversification_score?.toFixed(2) ?? "—"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
