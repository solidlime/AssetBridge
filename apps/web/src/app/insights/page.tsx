import { trpc } from "@/lib/trpc";
import AllocationChart from "@/components/charts/AllocationChart";
import PnLRankingChart from "@/components/charts/PnLRankingChart";

export default async function InsightsPage() {
  let snapshot: any = null;
  try {
    snapshot = await trpc.portfolio.snapshot.query({});
  } catch {}

  const allocations = snapshot?.allocationPct
    ? Object.entries(snapshot.allocationPct).map(([key, pct]) => ({
        asset_type: key,
        value_jpy: snapshot.breakdown
          ? (snapshot.breakdown[
              key === "stock_jp" ? "stockJpJpy"
              : key === "stock_us" ? "stockUsJpy"
              : key === "fund" ? "fundJpy"
              : key === "crypto" ? "cryptoJpy"
              : "cashJpy"
            ] ?? 0)
          : 0,
        pct,
      }))
    : [];

  const totalJpy = allocations.reduce((s: number, a: any) => s + a.value_jpy, 0);

  const topGainers = snapshot?.topGainers ?? [];
  const topLosers = snapshot?.topLosers ?? [];
  const ranking = [...topGainers, ...topLosers]
    .sort((a, b) => Math.abs(b.unrealizedPnlJpy) - Math.abs(a.unrealizedPnlJpy))
    .slice(0, 10)
    .map((item: any) => ({
      asset_id: item.assetId,
      name: item.name,
      value_jpy: item.valueJpy,
      unrealized_pnl_jpy: item.unrealizedPnlJpy,
      unrealized_pnl_pct: item.unrealizedPnlPct,
    }));

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>インサイト</h1>

      {/* 資産配分ドーナツ */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>アセット配分</h2>
        {allocations.length > 0 ? (
          <AllocationChart allocations={allocations} totalJpy={totalJpy} />
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        )}
      </div>

      {/* 含み損益ランキング横棒グラフ */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>含み損益ランキング</h2>
        {ranking.length > 0 ? (
          <PnLRankingChart ranking={ranking} />
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        )}
      </div>
    </div>
  );
}
