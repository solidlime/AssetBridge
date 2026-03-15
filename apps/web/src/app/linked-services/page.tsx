"use client";

import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

type ScrapeStatus = {
  status: "success" | "failed" | "running" | null;
  started_at: string | null;
  finished_at: string | null;
  records_saved: number | null;
};

type StatusState = {
  mf: ScrapeStatus | null;
  loading: boolean;
  error: string | null;
};

function formatDatetime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type BadgeStatus = "running" | "stopped" | "error" | "syncing" | "idle" | "synced";

function StatusBadge({ status }: { status: BadgeStatus }) {
  const config: Record<BadgeStatus, { label: string; color: string; bg: string }> = {
    running: { label: "起動中", color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
    stopped: { label: "停止中", color: "#94a3b8", bg: "rgba(148,163,184,0.15)" },
    error: { label: "エラー", color: "#f87171", bg: "rgba(248,113,113,0.15)" },
    syncing: { label: "同期中", color: "#60a5fa", bg: "rgba(96,165,250,0.15)" },
    idle: { label: "未実行", color: "#94a3b8", bg: "rgba(148,163,184,0.15)" },
    synced: { label: "同期済み", color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
  };

  const { label, color, bg } = config[status];

  return (
    <span
      role="status"
      aria-label={`ステータス: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
        color,
        background: bg,
        border: `1px solid ${color}40`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

type ServiceCardProps = {
  title: string;
  description: string;
  badgeStatus: BadgeStatus;
  children?: React.ReactNode;
};

function ServiceCard({ title, description, badgeStatus, children }: ServiceCardProps) {
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{title}</div>
          <div style={{ color: "#94a3b8", fontSize: 13 }}>{description}</div>
        </div>
        <div style={{ marginLeft: 16, flexShrink: 0 }}>
          <StatusBadge status={badgeStatus} />
        </div>
      </div>
      {children && (
        <div
          style={{
            borderTop: "1px solid #334155",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

type MetaRowProps = {
  label: string;
  value: string;
};

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#e2e8f0" }}>{value}</span>
    </div>
  );
}

function getMfBadgeStatus(mf: ScrapeStatus | null): BadgeStatus {
  if (!mf) return "idle";
  if (mf.status === "success") return "synced";
  if (mf.status === "failed") return "error";
  if (mf.status === "running") return "syncing";
  return "idle";
}

export default function LinkedServicesPage() {
  const [state, setState] = useState<StatusState>({
    mf: null,
    loading: true,
    error: null,
  });
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const scrapeData = await trpc.scrape.status.query();
      const latest = (scrapeData as any)?.latest ?? null;

      setState({
        mf: latest
          ? {
              status: latest.status ?? null,
              started_at: latest.started_at ?? null,
              finished_at: latest.finished_at ?? null,
              records_saved: latest.records_saved ?? null,
            }
          : null,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      console.warn("ステータス取得失敗:", message);
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const timer = setInterval(fetchStatuses, 10_000);
    return () => clearInterval(timer);
  }, [fetchStatuses]);

  const triggerScrape = async () => {
    setTriggering(true);
    setTriggerMessage(null);
    try {
      await trpc.scrape.trigger.mutate();
      setTriggerMessage("スクレイプを開始しました");
      setTimeout(() => setTriggerMessage(null), 3000);
      await fetchStatuses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      console.warn("スクレイプトリガー失敗:", message);
      setTriggerMessage(`開始に失敗しました: ${message}`);
      setTimeout(() => setTriggerMessage(null), 4000);
    } finally {
      setTriggering(false);
    }
  };

  const mfBadge = getMfBadgeStatus(state.mf);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>連携サービス</h1>
        {state.loading && (
          <span style={{ color: "#94a3b8", fontSize: 13 }}>読み込み中...</span>
        )}
      </div>

      {state.error && (
        <div
          role="alert"
          style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid #f8717140",
            borderRadius: 8,
            padding: "10px 16px",
            color: "#f87171",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          ステータス取得に失敗しました: {state.error}
        </div>
      )}

      {triggerMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: triggerMessage.includes("失敗") ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)",
            border: `1px solid ${triggerMessage.includes("失敗") ? "#f8717140" : "#4ade8040"}`,
            borderRadius: 8,
            padding: "10px 16px",
            color: triggerMessage.includes("失敗") ? "#f87171" : "#4ade80",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {triggerMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* マネーフォワード */}
        <ServiceCard
          title="マネーフォワード for 住信SBI銀行"
          description="Playwright でポートフォリオを自動取得し、資産データを同期します。"
          badgeStatus={mfBadge}
        >
          <MetaRow
            label="最終同期開始"
            value={formatDatetime(state.mf?.started_at ?? null)}
          />
          <MetaRow
            label="最終同期完了"
            value={formatDatetime(state.mf?.finished_at ?? null)}
          />
          <MetaRow
            label="保存件数"
            value={state.mf?.records_saved != null ? `${state.mf.records_saved} 件` : "—"}
          />
          <div style={{ marginTop: 8 }}>
            <button
              onClick={triggerScrape}
              disabled={triggering || state.mf?.status === "running"}
              aria-label="手動スクレイプを実行"
              style={{
                background: triggering || state.mf?.status === "running" ? "#334155" : "#3b82f6",
                color: triggering || state.mf?.status === "running" ? "#94a3b8" : "white",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                cursor: triggering || state.mf?.status === "running" ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {triggering ? "開始中..." : state.mf?.status === "running" ? "実行中..." : "今すぐ同期"}
            </button>
          </div>
        </ServiceCard>
      </div>
    </div>
  );
}
