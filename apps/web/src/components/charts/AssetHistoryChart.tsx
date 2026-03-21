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
  Legend,
} from "recharts";
import { trpc } from "@/lib/trpc";
import type { DailyTotal } from "@assetbridge/types";

type Period = "1W" | "1M" | "3M" | "1Y" | "ALL";
type ViewMode = "total" | "breakdown";

const PERIODS: Period[] = ["1W", "1M", "3M", "1Y", "ALL"];

const CATEGORY_LINES = [
  { key: "stockJpJpy", label: "日本株", color: "#60a5fa" },
  { key: "stockUsJpy", label: "US株", color: "#34d399" },
  { key: "fundJpy", label: "投資信託", color: "#a78bfa" },
  { key: "cashJpy", label: "現金", color: "#fbbf24" },
  { key: "pensionJpy", label: "年金", color: "#f87171" },
  { key: "pointJpy", label: "ポイント", color: "#fb923c" },
] as const;

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

type ChartDataPoint = {
  date: string;
  totalJpy: number | null;
  stockJpJpy: number | null;
  stockUsJpy: number | null;
  fundJpy: number | null;
  cashJpy: number | null;
  pensionJpy: number | null;
  pointJpy: number | null;
};

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
  const [viewMode, setViewMode] = useState<ViewMode>("total");
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
    const dateMap = new Map(
      data.map((d) => [
        d.date,
        {
          totalJpy: d.totalJpy,
          stockJpJpy: d.stockJpJpy,
          stockUsJpy: d.stockUsJpy,
          fundJpy: d.fundJpy,
          cashJpy: d.cashJpy,
          pensionJpy: d.pensionJpy,
          pointJpy: d.pointJpy,
        },
      ])
    );
    return generateDateRange(startDate, endDate).map((date) => {
      const dayData = dateMap.get(date);
      return {
        date,
        totalJpy: dayData?.totalJpy ?? null,
        stockJpJpy: dayData?.stockJpJpy ?? null,
        stockUsJpy: dayData?.stockUsJpy ?? null,
        fundJpy: dayData?.fundJpy ?? null,
        cashJpy: dayData?.cashJpy ?? null,
        pensionJpy: dayData?.pensionJpy ?? null,
        pointJpy: dayData?.pointJpy ?? null,
      };
    });
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
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* 期間ボタン */}
        <div style={{ display: "flex", gap: 8 }}>
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

        {/* 表示モード切替ボタン */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#1e293b",
            borderRadius: 16,
            padding: 2,
          }}
        >
          <button
            onClick={() => setViewMode("total")}
            aria-pressed={viewMode === "total"}
            style={{
              ...btnBase,
              padding: "4px 16px",
              background: viewMode === "total" ? "#3b82f6" : "transparent",
              color: viewMode === "total" ? "white" : "#94a3b8",
            }}
          >
            総資産
          </button>
          <button
            onClick={() => setViewMode("breakdown")}
            aria-pressed={viewMode === "breakdown"}
            style={{
              ...btnBase,
              padding: "4px 16px",
              background: viewMode === "breakdown" ? "#3b82f6" : "transparent",
              color: viewMode === "breakdown" ? "white" : "#94a3b8",
            }}
          >
            カテゴリ別
          </button>
        </div>
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
              formatter={
                viewMode === "total"
                  ? tooltipFormatter
                  : (value: number, name: string) => {
                      const category = CATEGORY_LINES.find(
                        (c) => c.key === name
                      );
                      return [
                        `¥${Math.round(value).toLocaleString("ja-JP")}`,
                        category?.label || name,
                      ];
                    }
              }
            />

            {viewMode === "total" ? (
              <Line
                type="monotone"
                dataKey="totalJpy"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ) : (
              <>
                {CATEGORY_LINES.map((category) => (
                  <Line
                    key={category.key}
                    type="monotone"
                    dataKey={category.key}
                    stroke={category.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    name={category.label}
                  />
                ))}
                <Legend
                  wrapperStyle={{ paddingTop: "16px" }}
                  iconType="line"
                  formatter={(value: string) => {
                    const category = CATEGORY_LINES.find(
                      (c) => c.label === value
                    );
                    return (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        {value}
                      </span>
                    );
                  }}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}