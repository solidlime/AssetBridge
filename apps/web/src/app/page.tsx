import { trpc } from "@/lib/trpc";
import { formatJpy, formatPct, diffColor } from "@/lib/format";
import AssetHistoryChart from "@/components/charts/AssetHistoryChart";
import AllocationChart from "@/components/charts/AllocationChart";

const ALLOC_LABEL_MAP: Record<string, string> = {
  stockJpJpy: "日本株",
  stockUsJpy: "米国株",
  fundJpy: "投資信託",
  cashJpy: "現金",
  pensionJpy: "年金",
  pointJpy: "ポイント",
};

export const dynamic = 'force-dynamic';

async function getData() {
  try {
    const [snapshot, history] = await Promise.all([
      trpc.portfolio.snapshot.query({}),
      trpc.portfolio.history.query({ days: 30 }),
    ]);
    return { snapshot, history };
  } catch (e) {
    console.error("[dashboard] getData error:", e);
    return { snapshot: null, history: null };
  }
}

export default async function DashboardPage() {
  const { snapshot, history } = await getData();
  const diffJpy = snapshot?.prevDiffJpy ?? 0;
  const diffPct = snapshot?.prevDiffPct ?? 0;
  const sign = diffJpy >= 0 ? "+" : "";

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
        </div>

        {/* カテゴリ別内訳 */}
        {snapshot?.breakdown && Object.entries({
          "日本株": (snapshot.breakdown as any).stockJpJpy,
          "米国株": (snapshot.breakdown as any).stockUsJpy,
          "投資信託": (snapshot.breakdown as any).fundJpy,
          "現金": (snapshot.breakdown as any).cashJpy,
          "年金": (snapshot.breakdown as any).pensionJpy,
          "ポイント": (snapshot.breakdown as any).pointJpy,
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
          <AssetHistoryChart data={history as any} />
        </div>
      )}

      {/* アセット配分 */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>アセット配分</h2>
        {allocations.length > 0 ? (
          <AllocationChart allocations={allocations} totalJpy={totalJpy} />
        ) : (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        )}
      </div>

      {!snapshot && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          データがありません。スクレイパーを実行してデータを取得してください。
        </div>
      )}
    </div>
  );
}
