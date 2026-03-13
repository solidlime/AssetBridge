"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface SimulationDataPoint {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface Props {
  data: SimulationDataPoint[];
}

const PERCENTILE_CONFIG = [
  { key: "p10", label: "悲観的(10%)", color: "#f87171" },
  { key: "p25", label: "やや悲観(25%)", color: "#fb923c" },
  { key: "p50", label: "中央値(50%)", color: "#facc15" },
  { key: "p75", label: "やや楽観(75%)", color: "#4ade80" },
  { key: "p90", label: "楽観的(90%)", color: "#34d399" },
];

export default function SimulatorChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <defs>
          {PERCENTILE_CONFIG.map((cfg) => (
            <linearGradient key={cfg.key} id={`grad-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={cfg.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="year"
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          tickFormatter={(v: number) => `${v}年`}
        />
        <YAxis
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          tickFormatter={(v: number) => `¥${(v / 1e6).toFixed(0)}M`}
          width={72}
        />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8" }}
          labelFormatter={(v: number) => `${v}年後`}
          formatter={(value: number, name: string) => {
            const cfg = PERCENTILE_CONFIG.find((c) => c.key === name);
            return [`¥${Math.round(value).toLocaleString("ja-JP")}`, cfg?.label ?? name];
          }}
        />
        <Legend
          formatter={(value: string) => {
            const cfg = PERCENTILE_CONFIG.find((c) => c.key === value);
            return cfg?.label ?? value;
          }}
          wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
        />
        {PERCENTILE_CONFIG.map((cfg) => (
          <Area
            key={cfg.key}
            type="monotone"
            dataKey={cfg.key}
            stroke={cfg.color}
            strokeWidth={cfg.key === "p50" ? 2 : 1}
            fill={`url(#grad-${cfg.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
