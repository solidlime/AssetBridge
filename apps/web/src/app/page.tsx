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

async function getData() {
  const [snapshot, withdrawals] = await Promise.allSettled([
    trpc.portfolio.snapshot.query({}),
    trpc.incomeExpense.upcomingWithdrawals.query({ days: 60 }),
  ]);

  return {
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    withdrawals:
      withdrawals.status === "fulfilled"
        ? withdrawals.value
        : { withdrawals: [], totalAmountJpy: 0, count: 0 },
  };
}

export default async function DashboardPage() {
  const { snapshot, withdrawals } = await getData();
  const diffJpy = snapshot?.prevDiffJpy ?? 0;
  const diffPct = snapshot?.prevDiffPct ?? 0;
  const sign = diffJpy >= 0 ? "+" : "";
  
  const upcomingResult = withdrawals as unknown as UpcomingWithdrawalsResult;

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

      {/* クレジットカード引き落とし予定 */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>
          クレジットカード引き落とし予定（直近・今後）
        </h2>
        
        {upcomingResult && upcomingResult.withdrawals.length > 0 ? (
          <>
            {/* 引き落とし合計カード */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>引き落とし予定の合計</div>
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

      {!snapshot && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          データがありません。スクレイパーを実行してデータを取得してください。
        </div>
      )}
    </div>
  );
}
