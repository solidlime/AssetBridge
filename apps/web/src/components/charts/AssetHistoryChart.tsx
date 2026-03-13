"use client";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Period = "1W" | "1M" | "3M" | "1Y" | "ALL";

interface DataPoint {
  date: string;
  total_jpy: number;
}

interface Props {
  data: DataPoint[];
}

const PERIODS: Period[] = ["1W", "1M", "3M", "1Y", "ALL"];

const PERIOD_DAYS: Record<Period, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "ALL": Infinity,
};

function filterByPeriod(data: DataPoint[], period: Period): DataPoint[] {
  if (period === "ALL") return data;
  const days = PERIOD_DAYS[period];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

const tooltipFormatter = (value: number) =>
  [`¥${Math.round(value).toLocaleString("ja-JP")}`, "総資産"];

export default function AssetHistoryChart({ data }: Props) {
  const [period, setPeriod] = useState<Period>("1M");
  const filtered = filterByPeriod(data, period);

  const btnBase: React.CSSProperties = {
    padding: "4px 12px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            style={{
              ...btnBase,
              background: period === p ? "#3b82f6" : "#334155",
              color: period === p ? "white" : "#94a3b8",
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={filtered}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            stroke="#475569"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            stroke="#475569"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            tickFormatter={(v: number) => `¥${(v / 1e6).toFixed(1)}M`}
            width={72}
          />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#60a5fa" }}
            formatter={tooltipFormatter}
          />
          <Line
            type="monotone"
            dataKey="total_jpy"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
