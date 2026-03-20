"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import SimulatorChart from "@/components/charts/SimulatorChart";
import { formatJpy } from "@/lib/format";

export default function SimulatorPage() {
  const [params, setParams] = useState({
    initial: 1000000,
    monthly: 50000,
    years: 20,
    returnRate: 0.05,
    volatility: 0.15,
    simulations: 1000,
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 総資産を取得して初期資産の初期値に設定
  useEffect(() => {
    trpc.portfolio.snapshot.query({})
      .then((data) => {
        if (data?.totalJpy && data.totalJpy > 0) {
          setParams((p) => ({ ...p, initial: Math.round(data.totalJpy) }));
        }
      })
      .catch(() => {
        // 取得失敗時はデフォルト値 (1,000,000) を使用
      });
  }, []);

  // API レスポンスの yearLabels+ percentiles を SimulatorChart 用の配列に変換
  const chartData = result
    ? (result.yearLabels ?? []).map((year: number, i: number) => ({
        year,
        p10: result.percentiles?.p10?.[i] ?? 0,
        p25: result.percentiles?.p25?.[i] ?? 0,
        p50: result.percentiles?.p50?.[i] ?? 0,
        p75: result.percentiles?.p75?.[i] ?? 0,
        p90: result.percentiles?.p90?.[i] ?? 0,
      }))
    : [];

  const run = async () => {
    setLoading(true);
    try {
      const res = await trpc.simulator.run.mutate(params);
      setResult(res);
    } catch (e) {
      console.warn("シミュレーション実行エラー:", e);
      alert("シミュレーション実行エラー");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: "#334155",
    border: "1px solid #475569",
    borderRadius: 8,
    padding: "8px 12px",
    color: "white",
    width: "100%",
    fontSize: 14,
    boxSizing: "border-box" as const,
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>モンテカルロシミュレーター</h1>

      {/* 入力フォーム */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { key: "initial", label: "初期資産 (¥)", step: 100000 },
            { key: "monthly", label: "月次投資額 (¥)", step: 10000 },
            { key: "years", label: "運用年数", step: 1, min: 1, max: 50 },
            { key: "returnRate", label: "期待リターン (%)", step: 0.01, factor: 100 },
            { key: "volatility", label: "ボラティリティ (%)", step: 0.01, factor: 100 },
          ].map(({ key, label, step, min, max, factor }) => (
            <div key={key}>
              <label
                htmlFor={`input-${key}`}
                style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}
              >
                {label}
              </label>
              <input
                id={`input-${key}`}
                type="number"
                step={step}
                min={min}
                max={max}
                value={factor ? (params[key as keyof typeof params] as number) * factor : params[key as keyof typeof params]}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setParams(p => ({ ...p, [key]: factor ? v / factor : v }));
                }}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
        <button
          onClick={run}
          disabled={loading}
          aria-label="シミュレーション実行"
          style={{
            marginTop: 16,
            background: loading ? "#475569" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {loading ? "計算中..." : "シミュレーション実行"}
        </button>
      </div>

      {/* 結果グラフ + サマリー */}
      {result && (
        <>
          {/* パーセンタイル推移グラフ */}
          {chartData.length > 0 && (
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{params.years}年間の資産推移シミュレーション</h2>
              <SimulatorChart data={chartData} />
            </div>
          )}

          {/* 最終値サマリー：percentiles の最終インデックスから導出 */}
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{params.years}年後の試算結果</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {(["p10", "p25", "p50", "p75", "p90"] as const).map((key) => {
                const arr = result.percentiles?.[key] as number[] | undefined;
                const value = arr ? arr[arr.length - 1] ?? 0 : 0;
                const labels: Record<string, string> = {
                  p10: "悲観的(10%)",
                  p25: "やや悲観(25%)",
                  p50: "中央値(50%)",
                  p75: "やや楽観(75%)",
                  p90: "楽観的(90%)",
                };
                const colors: Record<string, string> = {
                  p10: "#f87171",
                  p25: "#fb923c",
                  p50: "#facc15",
                  p75: "#4ade80",
                  p90: "#34d399",
                };
                return (
                  <div key={key} style={{ background: "#0f172a", borderRadius: 8, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{labels[key] || key}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: colors[key] || "white" }}>
                      {formatJpy(value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
