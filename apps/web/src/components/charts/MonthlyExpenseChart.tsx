"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { trpc } from "@/lib/trpc";

interface MonthlyCashflowItem {
  month: string;
  creditJpy: number;
  fixedJpy: number;
  totalJpy: number;
}

const tooltipStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
};

export default function MonthlyExpenseChart() {
  const [data, setData] = useState<MonthlyCashflowItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    trpc.incomeExpense.monthlyCashflow
      .query({ months: 6 })
      .then((result) => {
        setData(result as unknown as MonthlyCashflowItem[]);
      })
      .catch((err: unknown) => {
        console.error("[MonthlyExpenseChart] fetch error:", err);
        setData([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const chartData = data.map((d) => ({
    ...d,
    label: `${parseInt(d.month.slice(5, 7), 10)}月`,
  }));

  if (loading) {
    return (
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
    );
  }

  if (data.length === 0) {
    return (
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
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="label"
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
        />
        <YAxis
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          tickFormatter={(v: number) => `¥${(v / 10000).toFixed(0)}万`}
          width={72}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value: unknown, name: unknown) => {
            const v = value as number;
            const n = name as string;
            const label =
              n === "creditJpy" ? "クレカ" : n === "fixedJpy" ? "固定費" : n;
            return [`¥${Math.round(v).toLocaleString("ja-JP")}`, label];
          }}
          itemStyle={{ color: "#e2e8f0" }}
        />
        <Legend
          wrapperStyle={{ paddingTop: "16px" }}
          formatter={(value: unknown) => {
            const v = value as string;
            const label =
              v === "creditJpy" ? "クレカ" : v === "fixedJpy" ? "固定費" : v;
            return <span style={{ color: "#94a3b8", fontSize: 12 }}>{label}</span>;
          }}
        />
        <Bar dataKey="creditJpy" name="creditJpy" stackId="a" fill="#3b82f6" />
        <Bar dataKey="fixedJpy" name="fixedJpy" stackId="a" fill="#f97316" />
      </BarChart>
    </ResponsiveContainer>
  );
}
