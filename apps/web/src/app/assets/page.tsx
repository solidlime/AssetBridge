"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatJpy, formatPct, diffColor } from "@/lib/format";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Asset = {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  value_jpy: number;
  current_price: number;
  cost_basis_jpy: number;
  cost_per_unit_jpy: number;
  unrealized_pnl_jpy: number;
  unrealized_pnl_pct: number;
  asset_type: string;
};

type SortKey = "name" | "quantity" | "value_jpy" | "unrealized_pnl_jpy" | "unrealized_pnl_pct";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const TYPES = [
  { value: "all", label: "全て" },
  { value: "stock_jp", label: "日本株" },
  { value: "stock_us", label: "米国株" },
  { value: "fund", label: "投信" },
  { value: "crypto", label: "暗号資産" },
  { value: "cash", label: "現金" },
  { value: "pension", label: "年金" },
] as const;

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
  asset: Asset;
  onClose: () => void;
};

function AssetModal({ asset, onClose }: ModalProps) {
  const [comment, setComment] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ESC キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // モーダル外クリックで閉じる
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const handleGenerateComment = async () => {
    setGenerating(true);
    setComment(null);
    try {
      const res = await api.aiComments.asset({
        symbol: asset.symbol,
        name: asset.name,
        value_jpy: asset.value_jpy,
        unrealized_pnl_jpy: asset.unrealized_pnl_jpy,
        unrealized_pnl_pct: asset.unrealized_pnl_pct,
      });
      setComment(res.comment);
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      console.warn("AIコメント生成失敗:", message);
      setComment(`生成に失敗しました: ${message}`);
    } finally {
      setGenerating(false);
    }
  };

  const pnlColor = diffColor(asset.unrealized_pnl_jpy);
  const pnlSign = asset.unrealized_pnl_jpy >= 0 ? "+" : "";

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${asset.symbol} — 銘柄詳細`}
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
            <div style={{ fontSize: 20, fontWeight: 700 }}>{asset.symbol}</div>
            <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 2 }}>{asset.name}</div>
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
              {asset.asset_type}
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
            { label: "評価額", value: formatJpy(asset.value_jpy) },
            { label: "数量", value: String(asset.quantity) },
            { label: "現在価格", value: formatJpy(asset.current_price) },
            { label: "取得単価", value: formatJpy(asset.cost_per_unit_jpy) },
            { label: "含み損益", value: `${pnlSign}${formatJpy(Math.abs(asset.unrealized_pnl_jpy))}`, color: pnlColor },
            { label: "損益率", value: `${pnlSign}${asset.unrealized_pnl_pct.toFixed(2)}%`, color: pnlColor },
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

        {/* AIコメント */}
        <div>
          <button
            type="button"
            onClick={handleGenerateComment}
            disabled={generating}
            aria-label="この銘柄のAIコメントを生成する"
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: generating ? "#334155" : "#3b82f6",
              color: generating ? "#94a3b8" : "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: generating ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {generating ? "生成中..." : "AIコメントを生成"}
          </button>

          {generating && (
            <p
              role="status"
              aria-live="polite"
              style={{ color: "#94a3b8", fontSize: 13, marginTop: 12, textAlign: "center" }}
            >
              AIが分析中です...
            </p>
          )}

          {comment && !generating && (
            <div
              role="region"
              aria-label="AIコメント"
              style={{
                marginTop: 12,
                background: "#0f172a",
                borderRadius: 8,
                padding: "12px 14px",
                color: "#cbd5e1",
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {comment}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------

export default function AssetsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialType = searchParams.get("type") ?? "all";

  const [activeType, setActiveType] = useState(initialType);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("value_jpy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // タブ切り替え
  const handleTabChange = useCallback(
    (type: string) => {
      setActiveType(type);
      router.push(`/assets?type=${type}`, { scroll: false });
    },
    [router]
  );

  // データ取得
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.assets
      .list(activeType)
      .then((data) => {
        if (!cancelled) {
          setAssets(Array.isArray(data) ? (data as Asset[]) : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("資産一覧取得失敗:", err instanceof Error ? err.message : err);
        if (!cancelled) {
          setAssets([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeType]);

  // ソート
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

  const sortedAssets = [...assets].sort((a, b) => {
    let av: number | string;
    let bv: number | string;

    if (sortKey === "name") {
      av = a.name;
      bv = b.name;
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
        ) : sortedAssets.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>データがありません</p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
            aria-label="資産一覧テーブル"
          >
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #334155" }}>
                <SortHeader label="銘柄" sortKeyTarget="name" align="left" />
                <SortHeader label="数量" sortKeyTarget="quantity" />
                <th style={{ textAlign: "right", padding: "8px 0", whiteSpace: "nowrap", color: "#94a3b8" }}>取得単価</th>
                <SortHeader label="評価額" sortKeyTarget="value_jpy" />
                <SortHeader label="損益" sortKeyTarget="unrealized_pnl_jpy" />
                <SortHeader label="損益率" sortKeyTarget="unrealized_pnl_pct" />
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((a) => {
                const pnlColor = diffColor(a.unrealized_pnl_jpy);
                const pnlSign = a.unrealized_pnl_jpy >= 0 ? "+" : "";
                return (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedAsset(a)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${a.symbol} ${a.name} の詳細を表示`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedAsset(a);
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
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ fontWeight: 600 }}>{a.symbol}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{a.name}</div>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{a.quantity}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(a.cost_per_unit_jpy)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>{formatJpy(a.value_jpy)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: pnlColor }}>
                      {pnlSign}{formatJpy(Math.abs(a.unrealized_pnl_jpy))}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: pnlColor }}>
                      {formatPct(a.unrealized_pnl_pct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 銘柄詳細モーダル */}
      {selectedAsset && (
        <AssetModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  );
}
