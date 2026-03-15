"use client";

import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";
const HEADERS: Record<string, string> = { "X-API-Key": API_KEY };

type ScrapeStatus = {
  status: "success" | "failed" | "running" | null;
  started_at: string | null;
  finished_at: string | null;
  records_saved: number | null;
};

type ServiceStatus = {
  running: boolean;
};

type StatusState = {
  mf: ScrapeStatus | null;
  discord: ServiceStatus | null;
  mcp: ServiceStatus | null;
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
    discord: null,
    mcp: null,
    loading: true,
    error: null,
  });

  const fetchStatuses = useCallback(async () => {
    try {
      const [scrapeRes, discordRes, mcpRes] = await Promise.all([
        fetch(`${API_URL}/api/scrape/status`, { headers: HEADERS }),
        fetch(`${API_URL}/api/services/discord/status`, { headers: HEADERS }),
        fetch(`${API_URL}/api/services/mcp/status`, { headers: HEADERS }),
      ]);

      if (!scrapeRes.ok) {
        console.warn("scrape/status fetch failed:", scrapeRes.status);
        return;
      }
      if (!discordRes.ok) {
        console.warn("discord/status fetch failed:", discordRes.status);
        return;
      }
      if (!mcpRes.ok) {
        console.warn("mcp/status fetch failed:", mcpRes.status);
        return;
      }

      const [scrapeData, discordData, mcpData] = await Promise.all([
        scrapeRes.json(),
        discordRes.json(),
        mcpRes.json(),
      ]);

      const latest = scrapeData?.latest ?? null;

      setState({
        mf: latest
          ? {
              status: latest.status ?? null,
              started_at: latest.started_at ?? null,
              finished_at: latest.finished_at ?? null,
              records_saved: latest.records_saved ?? null,
            }
          : null,
        discord: { running: Boolean(discordData?.running) },
        mcp: { running: Boolean(mcpData?.running) },
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
        </ServiceCard>

        {/* Discord Bot */}
        <ServiceCard
          title="Discord Bot"
          description="朝イチで資産サマリーを Discord チャンネルに投稿します。"
          badgeStatus={state.discord ? (state.discord.running ? "running" : "stopped") : "idle"}
        />

        {/* MCP Server */}
        <ServiceCard
          title="MCP Server"
          description="Claude Desktop / Cursor などの AI ツールと資産データを連携します。"
          badgeStatus={state.mcp ? (state.mcp.running ? "running" : "stopped") : "idle"}
        />
      </div>
    </div>
  );
}
