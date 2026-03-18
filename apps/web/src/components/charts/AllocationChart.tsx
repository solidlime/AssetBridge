"use client";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Allocation {
  asset_type: string;
  name?: string;
  value_jpy: number;
  percentage?: number;
}

interface Props {
  allocations: Allocation[];
  totalJpy: number;
}

const COLORS = ["#60a5fa", "#4ade80", "#facc15", "#f87171", "#a78bfa", "#fb923c"];

export default function AllocationChart({ allocations, totalJpy }: Props) {
  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={allocations}
            dataKey="value_jpy"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
          >
            {allocations.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value: number, name: string) => [
              `¥${Math.round(value).toLocaleString("ja-JP")}`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* 中央に総資産表示 */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 11, color: "#94a3b8" }}>総資産</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          ¥{(totalJpy / 1e6).toFixed(1)}M
        </div>
      </div>
      {/* 凡例 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
        {allocations.map((a, i) => (
          <div key={a.asset_type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
            <span style={{ color: "#94a3b8" }}>{a.name ?? a.asset_type} {(a.percentage ?? 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
