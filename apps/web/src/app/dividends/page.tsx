"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatJpy } from "@/lib/format";

type DividendCalendar = {
  totalAnnualEstJpy: number;
  portfolioYieldPct: number;
  monthlyBreakdown: number[];
  holdings: DividendHolding[];
};

type DividendHolding = {
  symbol: string;
  name: string;
  assetType: string;
  valueJpy: number;
  yieldPct: number;
  annualEstJpy: number;
  nextExDate?: string;
};

type SortKey = "name" | "valueJpy" | "yieldPct" | "annualEstJpy" | "nextExDate";
type SortDir = "asc" | "desc";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return <span aria-hidden="true" style={{ color: "#475569", marginLeft: 4, fontSize: 11 }}>↕</span>;
  }
  return (
    <span aria-hidden="true" style={{ color: "#60a5fa", marginLeft: 4, fontSize: 11 }}>
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

export default function DividendsPage() {
  const [calendar, setCalendar] = useState<DividendCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("valueJpy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    trpc.dividends.calendar
      .query()
      .then((data) => {
        if (cancelled) return;
        setCalendar(data as unknown as DividendCalendar);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "データの取得に失敗しました");
        setCalendar(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const sortedHoldings = useMemo(() => {
    if (!calendar) return [];

    return [...calendar.holdings].sort((a, b) => {
      let av: number | string;
      let bv: number | string;

      if (sortKey === "name") {
        av = a.name;
        bv = b.name;
      } else if (sortKey === "nextExDate") {
        av = a.nextExDate ?? "";
        bv = b.nextExDate ?? "";
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }

      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv, "ja") : bv.localeCompare(av, "ja");
      }

      const na = av as number;
      const nb = bv as number;
      return sortDir === "asc" ? na - nb : nb - na;
    });
  }, [calendar, sortDir, sortKey]);

  type SortHeaderProps = {
    label: string;
    sortKeyTarget: SortKey;
    align?: "left" | "right";
  };

  function SortHeader({ label, sortKeyTarget, align = "right" }: SortHeaderProps) {
    return (
      <th
        style={{
          textAlign: align,
          padding: "8px 0",
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
        onClick={() => handleSort(sortKeyTarget)}
        aria-sort={
          sortKey === sortKeyTarget
            ? sortDir === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        {label}
        <SortIcon active={sortKey === sortKeyTarget} dir={sortDir} />
      </th>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>
        <p style={{ color: "#94a3b8" }}>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>
        <p style={{ color: "#94a3b8" }}>{error}</p>
      </div>
    );
  }

  if (!calendar) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>
        <p style={{ color: "#94a3b8" }}>データがありません</p>
      </div>
    );
  }

  const maxMonthly = Math.max(...calendar.monthlyBreakdown, 1);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>配当・分配金</h1>

      {/* サマリーカード */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>年間予想配当合計</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formatJpy(calendar.totalAnnualEstJpy)}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>ポートフォリオ利回り</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#34d399" }}>
            {calendar.portfolioYieldPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 月別棒グラフ */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: "#e2e8f0" }}>月別予想配当額</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
          {calendar.monthlyBreakdown.map((amount, i) => {
            const heightPct = maxMonthly > 0 ? (amount / maxMonthly) * 100 : 0;
            return (
              <div
                key={i}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ fontSize: 10, color: "#94a3b8" }}>
                  {amount > 0 ? formatJpy(amount) : ""}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    minHeight: amount > 0 ? 4 : 0,
                    background: "#3b82f6",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s",
                  }}
                />
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{MONTH_LABELS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 銘柄別テーブル */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, overflowX: "auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>銘柄別配当予想</h2>
        {calendar.holdings.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>配当データのある銘柄がありません</p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
            aria-label="銘柄別配当予想テーブル"
          >
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <SortHeader label="銘柄" sortKeyTarget="name" align="left" />
                <SortHeader label="評価額" sortKeyTarget="valueJpy" />
                <SortHeader label="予想利回り" sortKeyTarget="yieldPct" />
                <SortHeader label="年間予想額" sortKeyTarget="annualEstJpy" />
                <SortHeader label="権利落ち日" sortKeyTarget="nextExDate" />
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => (
                <tr key={h.symbol} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 0" }}>
                    <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{h.name}</div>
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(h.valueJpy)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: "#34d399" }}>
                    {h.yieldPct.toFixed(2)}%
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(h.annualEstJpy)}</td>
                  <td style={{ textAlign: "right", padding: "10px 0", color: "#94a3b8" }}>
                    {h.nextExDate ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
