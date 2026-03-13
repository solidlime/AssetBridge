import { api } from "@/lib/api";
import { formatJpy } from "@/lib/format";

async function getAssets(type: string) {
  try {
    return await api.assets.list(type);
  } catch {
    return [];
  }
}

const TYPES = [
  { value: "all", label: "全て" },
  { value: "stock_jp", label: "日本株" },
  { value: "stock_us", label: "米国株" },
  { value: "fund", label: "投信" },
  { value: "crypto", label: "暗号資産" },
];

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type = "all" } = await searchParams;
  const assets = await getAssets(type);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>資産一覧</h1>

      {/* タブ */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {TYPES.map((t) => (
          <a
            key={t.value}
            href={`/assets?type=${t.value}`}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              background: type === t.value ? "#3b82f6" : "#1e293b",
              color: type === t.value ? "white" : "#94a3b8",
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* 資産テーブル */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
        {assets.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <th style={{ textAlign: "left", padding: "8px 0" }}>銘柄</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>数量</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>評価額</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>損益</th>
                <th style={{ textAlign: "right", padding: "8px 0" }}>損益率</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a: any) => {
                const pnl = a.unrealized_pnl_jpy;
                const s = pnl >= 0 ? "+" : "";
                const c = pnl >= 0 ? "#4ade80" : "#f87171";
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid #0f172a" }}>
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ fontWeight: 600 }}>{a.symbol}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{a.name}</div>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{a.quantity}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(a.value_jpy)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: c }}>
                      {s}{formatJpy(Math.abs(pnl))}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: c }}>
                      {s}{a.unrealized_pnl_pct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
