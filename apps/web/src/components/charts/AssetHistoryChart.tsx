"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { trpc } from "@/lib/trpc";
import type { DailyTotal } from "@assetbridge/types";

type Period = "1W" | "1M" | "3M" | "1Y" | "ALL";

const PERIODS: Period[] = ["1W", "1M", "3M", "1Y", "ALL"];

// ALL は最大 365 日分を取得（DB に保存されている全期間）
const PERIOD_DAYS: Record<Period, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "ALL": 365,
};

const tooltipFormatter = (value: number) =>
  [`¥${Math.round(value).toLocaleString("ja-JP")}`, "総資産"];

export default function AssetHistoryChart() {
  const [period, setPeriod] = useState<Period>("1M");
  const [data, setData] = useState<DailyTotal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    trpc.portfolio.history
      .query({ days: PERIOD_DAYS[period] })
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        console.error("[AssetHistoryChart] fetch error:", err);
        setData([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [period]);

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
      {/* 期間選択ボタン */}
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

      {/* グラフ本体 */}
      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 240,
            color: "#475569",
            fontSize: 14,
          }}
        >
          読み込み中...
        </div>
      ) : data.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 240,
            color: "#475569",
            fontSize: 14,
          }}
        >
          データがありません
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
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
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
              }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#60a5fa" }}
              formatter={tooltipFormatter}
            />
            <Line
              type="monotone"
              dataKey="totalJpy"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}