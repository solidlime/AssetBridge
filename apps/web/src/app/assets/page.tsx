"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { formatJpy, formatPct, diffColor } from "@/lib/format";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  valueJpy: number;
  priceJpy: number;
  costBasisJpy: number;
  costPerUnitJpy: number;
  unrealizedPnlJpy: number;
  unrealizedPnlPct: number;
  assetType: string;
  currency: string;
  portfolioWeightPct: number;
  valueDiffJpy: number | null;
  valueDiffPct: number | null;
  priceDiffPct: number | null;
  institutionName?: string;
};

type SortKey = "name" | "quantity" | "valueJpy" | "unrealizedPnlJpy" | "unrealizedPnlPct" | "costPerUnitJpy" | "costBasisJpy" | "portfolioWeightPct" | "priceJpy" | "valueDiffJpy" | "priceDiffPct";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const TYPES = [
  { value: "all", label: "全て" },
  { value: "stock_jp", label: "日本株" },
  { value: "stock_us", label: "米国株" },
  { value: "fund", label: "投信" },
  { value: "cash", label: "現金" },
  { value: "pension", label: "年金" },
  { value: "point", label: "ポイント" },
] as const;

// ---------------------------------------------------------------------------
// 通貨対応フォーマット
// ---------------------------------------------------------------------------

function formatPrice(value: number, currency: string): string {
  if (currency === "USD") return `$${value.toFixed(2)}`;
  if (currency === "JPY") return formatJpy(value);
  return `${currency} ${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// ソートアイコン
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// モーダル
// ---------------------------------------------------------------------------

type ModalProps = {
  holding: Holding;
  onClose: () => void;
};

function AssetModal({ holding, onClose }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const pnlColor = diffColor(holding.unrealizedPnlJpy);
  const pnlSign = holding.unrealizedPnlJpy >= 0 ? "+" : "";

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${holding.symbol} — 銘柄詳細`}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{holding.symbol}</div>
            <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 2 }}>{holding.name}</div>
            <div
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "2px 10px",
                borderRadius: 12,
                background: "#0f172a",
                color: "#60a5fa",
                fontSize: 12,
              }}
            >
              {holding.assetType}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="モーダルを閉じる"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
              borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* 数値グリッド */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {[
            { label: "評価額", value: formatJpy(holding.valueJpy) },
            { label: "数量", value: String(holding.quantity) },
            { label: "現在価格", value: formatPrice(holding.priceJpy, holding.currency) },
            { label: "取得単価", value: formatPrice(holding.costPerUnitJpy, holding.currency) },
            { label: "含み損益", value: `${pnlSign}${formatJpy(Math.abs(holding.unrealizedPnlJpy))}`, color: pnlColor },
            { label: "損益率", value: `${pnlSign}${holding.unrealizedPnlPct.toFixed(2)}%`, color: pnlColor },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                background: "#0f172a",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: color ?? "#e2e8f0" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------

function AssetsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialType = searchParams.get("type") ?? "all";

  const [activeType, setActiveType] = useState(initialType);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  // APIから取得したオリジナルデータを保持するRef
  // ソートは常にこのRefのコピーに対して行い、holdingsを破壊しない
  const originalHoldingsRef = useRef<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("valueJpy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  const handleTabChange = useCallback(
    (type: string) => {
      setActiveType(type);
      router.push(`/assets?type=${type}`, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpc.portfolio.holdings
      .query({ assetType: activeType as "all" | "stock_jp" | "stock_us" | "fund" | "cash" | "pension" | "point" })
      .then((data) => {
        if (!cancelled) {
          const mapped: Holding[] = Array.isArray(data)
            ? data.map((item) => ({
                symbol: item.symbol,
                name: item.name,
                quantity: item.quantity,
                valueJpy: item.valueJpy,
                priceJpy: item.priceJpy,
                costBasisJpy: item.costBasisJpy,
                costPerUnitJpy: item.costPerUnitJpy,
                unrealizedPnlJpy: item.unrealizedPnlJpy,
                unrealizedPnlPct: item.unrealizedPnlPct,
                assetType: item.assetType,
                currency: item.currency ?? "JPY",
                portfolioWeightPct: item.portfolioWeightPct,
                valueDiffJpy: (item as { valueDiffJpy?: number | null }).valueDiffJpy ?? null,
                valueDiffPct: (item as { valueDiffPct?: number | null }).valueDiffPct ?? null,
                priceDiffPct: (item as { priceDiffPct?: number | null }).priceDiffPct ?? null,
              }))
            : [];
          // オリジナルデータをRefに保存（ソートは常にこのRefのコピーから行う）
          originalHoldingsRef.current = mapped;
          setHoldings(mapped);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.warn("資産一覧取得失敗:", err instanceof Error ? err.message : err);
        if (!cancelled) {
          originalHoldingsRef.current = [];
          setHoldings([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeType]);

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

  // ソートは常に元データ(originalHoldingsRef)のコピーに対して行う
  // holdingsをそのままソートすると、連打時に再ソートが重複を生む可能性があるため
  const sortedHoldings = [...originalHoldingsRef.current].sort((a, b) => {
    let av: number | string | null;
    let bv: number | string | null;

    if (sortKey === "name") {
      av = a.name;
      bv = b.name;
    } else {
      av = a[sortKey];
      bv = b[sortKey];
    }

    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;

    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv, "ja") : bv.localeCompare(av, "ja");
    }
    const na = av as number;
    const nb = bv as number;
    return sortDir === "asc" ? na - nb : nb - na;
  });

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

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>資産一覧</h1>

      {/* タブ */}
      <nav aria-label="資産タイプフィルタ" style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => handleTabChange(t.value)}
            aria-pressed={activeType === t.value}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              border: "none",
              background: activeType === t.value ? "#3b82f6" : "#1e293b",
              color: activeType === t.value ? "white" : "#94a3b8",
              fontSize: 14,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 資産テーブル */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, overflowX: "auto" }}>
        {loading ? (
          <p role="status" style={{ color: "#94a3b8", textAlign: "center" }}>
            読み込み中...
          </p>
        ) : sortedHoldings.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
            aria-label="資産一覧テーブル"
          >
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>機関</th>
                <SortHeader label="銘柄" sortKeyTarget="name" align="left" />
                <SortHeader label="数量" sortKeyTarget="quantity" />
                <SortHeader label="取得単価" sortKeyTarget="costPerUnitJpy" />
                <SortHeader label="評価額" sortKeyTarget="valueJpy" />
                <SortHeader label="損益" sortKeyTarget="unrealizedPnlJpy" />
                <SortHeader label="損益率" sortKeyTarget="unrealizedPnlPct" />
                <SortHeader label="前日比(円)" sortKeyTarget="valueDiffJpy" />
                <SortHeader label="前日比(%)" sortKeyTarget="priceDiffPct" />
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => {
                const pnlColor = diffColor(h.unrealizedPnlJpy);
                const pnlSign = h.unrealizedPnlJpy >= 0 ? "+" : "";
                return (
                  <tr
                    key={`${h.symbol}-${h.name}`}
                    onClick={() => setSelectedHolding(h)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${h.symbol} ${h.name} の詳細を表示`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedHolding(h);
                      }
                    }}
                    style={{
                      borderBottom: "1px solid #0f172a",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "#243044";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "#243044";
                    }}
                    onBlur={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "8px 12px", color: "#94a3b8", fontSize: 13 }}>
                      {h.institutionName || "－"}
                    </td>
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{h.name}</div>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{h.quantity}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{formatPrice(h.costPerUnitJpy, h.currency)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(h.valueJpy)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: pnlColor }}>
                      {pnlSign}{formatJpy(Math.abs(h.unrealizedPnlJpy))}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: pnlColor }}>
                      {formatPct(h.unrealizedPnlPct)}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: h.valueDiffJpy === null ? "#94a3b8" : diffColor(h.valueDiffJpy) }}>
                      {h.valueDiffJpy === null
                        ? "—"
                        : `${h.valueDiffJpy >= 0 ? "+" : ""}¥${Math.abs(Math.round(h.valueDiffJpy)).toLocaleString("ja-JP")}`}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: h.priceDiffPct === null ? "#94a3b8" : diffColor(h.priceDiffPct) }}>
                        {h.priceDiffPct === null ? "—" : formatPct(h.priceDiffPct)}
                      </td>
                   
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 銘柄詳細モーダル */}
      {selectedHolding && (
        <AssetModal holding={selectedHolding} onClose={() => setSelectedHolding(null)} />
      )}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<div style={{ color: "#94a3b8", padding: 32 }}>読み込み中...</div>}>
      <AssetsPageInner />
    </Suspense>
  );
}
