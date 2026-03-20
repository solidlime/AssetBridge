"use client";

import { useState, useEffect, useMemo } from "react";
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

// 期間ごとの tick 間隔（日数）
const TICK_INTERVAL_DAYS: Record<Period, number> = {
  "1W": 1,
  "1M": 5,
  "3M": 14,
  "1Y": 30,
  "ALL": 30,
};

type ChartDataPoint = { date: string; totalJpy: number | null };

function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function generateTicks(startDate: Date, endDate: Date, intervalDays: number): string[] {
  const ticks: string[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    ticks.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + intervalDays);
  }
  // 終端が含まれていなければ追加
  const endStr = endDate.toISOString().slice(0, 10);
  if (ticks[ticks.length - 1] !== endStr) ticks.push(endStr);
  return ticks;
}

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

  // 選択期間の開始・終了日
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - PERIOD_DAYS[period]);
    return { startDate: start, endDate: end };
  }, [period]);

  // 期間内の全日付を埋めたデータ（データのない日は null）
  const paddedData = useMemo((): ChartDataPoint[] => {
    const dateMap = new Map(data.map((d) => [d.date, d.totalJpy]));
    return generateDateRange(startDate, endDate).map((date) => ({
      date,
      totalJpy: dateMap.get(date) ?? null,
    }));
  }, [data, startDate, endDate]);

  // 期間に応じた X 軸の目盛り
  const ticks = useMemo(
    () => generateTicks(startDate, endDate, TICK_INTERVAL_DAYS[period]),
    [startDate, endDate, period]
  );

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
          <LineChart data={paddedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              ticks={ticks}
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
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}