"use client";
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

interface MonthlyData {
  year_month: string;
  income_jpy: number;
  expense_jpy: number;
  net_jpy: number;
}

interface Props {
  data: MonthlyData[];
}

function formatYearMonth(ym: string): string {
  return `${ym.slice(0, 4)}/${ym.slice(4)}`;
}

export default function IncomeExpenseChart({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatYearMonth(d.year_month),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="label"
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
        />
        <YAxis
          stroke="#475569"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          tickFormatter={(v: number) => `¥${(v / 1e4).toFixed(0)}万`}
          width={64}
        />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value: number, name: string) => [
            `¥${value.toLocaleString("ja-JP")}`,
            name === "income_jpy" ? "収入" : "支出",
          ]}
        />
        <Legend
          formatter={(value: string) => value === "income_jpy" ? "収入" : "支出"}
          wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
        />
        <Bar dataKey="income_jpy" fill="#4ade80" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense_jpy" fill="#f87171" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
