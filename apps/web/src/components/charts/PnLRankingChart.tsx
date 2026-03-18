"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface RankingItem {
  asset_id: number | string;
  name: string;
  unrealized_pnl_jpy: number;
  unrealized_pnl_pct: number;
}

interface Props {
  ranking: RankingItem[];
}

export default function PnLRankingChart({ ranking }: Props) {
  const chartData = [...ranking].sort((a, b) => a.unrealized_pnl_jpy - b.unrealized_pnl_jpy);

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis
          type="number"
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          tickFormatter={(v: number) => `¥${(v / 1e4).toFixed(0)}万`}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          width={96}
        />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value: number) => [
            `¥${Math.round(value).toLocaleString("ja-JP")}`,
            "含み損益",
          ]}
        />
        <Bar dataKey="unrealized_pnl_jpy" radius={[0, 4, 4, 0]}>
          {chartData.map((item) => (
            <Cell
              key={item.asset_id}
              fill={item.unrealized_pnl_jpy >= 0 ? "#4ade80" : "#f87171"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
