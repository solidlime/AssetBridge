import { trpc } from "@/lib/trpc";
import { formatJpy } from "@/lib/format";

type DividendCalendar = {
  totalAnnualEstJpy: number;
  portfolioYieldPct: number;
  monthlyBreakdown: number[];
  holdings: Array<{
    symbol: string;
    name: string;
    assetType: string;
    valueJpy: number;
    dividendYieldPct: number;
    annualEstJpy: number;
    monthlyEstJpy: number[];
    exDividendDate: string | null;
  }>;
};

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export default async function DividendsPage() {
  let calendar: DividendCalendar | null = null;
  let error: string | null = null;

  try {
    calendar = await trpc.dividends.calendar.query() as DividendCalendar;
  } catch (e) {
    error = e instanceof Error ? e.message : "データの取得に失敗しました";
  }

  if (error) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>
        <p style={{ color: "#94a3b8" }}>{error}</p>
      </div>
    );
  }

  if (!calendar) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>
        <p style={{ color: "#94a3b8" }}>データがありません</p>
      </div>
    );
  }

  const maxMonthly = Math.max(...calendar.monthlyBreakdown, 1);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>

      {/* サマリーカード */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>年間予想配当合計</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formatJpy(calendar.totalAnnualEstJpy)}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>ポートフォリオ利回り</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#34d399" }}>
            {calendar.portfolioYieldPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 月別棒グラフ */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: "#e2e8f0" }}>月別予想配当額</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
          {calendar.monthlyBreakdown.map((amount, i) => {
            const heightPct = maxMonthly > 0 ? (amount / maxMonthly) * 100 : 0;
            return (
              <div
                key={i}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ fontSize: 10, color: "#94a3b8" }}>
                  {amount > 0 ? formatJpy(amount) : ""}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    minHeight: amount > 0 ? 4 : 0,
                    background: "#3b82f6",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s",
                  }}
                />
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{MONTH_LABELS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 銘柄別テーブル */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, overflowX: "auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>銘柄別配当予想</h2>
        {calendar.holdings.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>配当データのある銘柄がありません</p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
            aria-label="銘柄別配当予想テーブル"
          >
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <th style={{ textAlign: "left", padding: "8px 0" }}>銘柄</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>評価額</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>予想利回り</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>年間予想額</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>権利落ち日</th>
              </tr>
            </thead>
            <tbody>
              {calendar.holdings.map((h) => (
                <tr key={h.symbol} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 0" }}>
                    <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{h.name}</div>
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(h.valueJpy)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: "#34d399" }}>
                    {h.dividendYieldPct.toFixed(2)}%
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(h.annualEstJpy)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: "#94a3b8" }}>
                    {h.exDividendDate ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
