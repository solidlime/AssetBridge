"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

type LogSource = "scrape" | "api" | "mcp" | "discord";
type LogLevel = "info" | "warn" | "error";

interface AppLog {
  id: number;
  source: string;
  level: string;
  message: string;
  detail: string | null;
  createdAt: string | null;
}

interface LogsResponse {
  logs: AppLog[];
  total: number;
}

const cardStyle: React.CSSProperties = {
  background: "#1e293b",
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

const SOURCES: { key: LogSource; label: string; icon: string }[] = [
  { key: "scrape", label: "スクレイプ", icon: "🕷️" },
  { key: "api", label: "API", icon: "🔌" },
  { key: "mcp", label: "MCP", icon: "🤖" },
  { key: "discord", label: "Discord", icon: "💬" },
];

const LEVELS: { key: LogLevel; label: string; color: string }[] = [
  { key: "info", label: "INFO", color: "#94a3b8" },
  { key: "warn", label: "WARN", color: "#f59e0b" },
  { key: "error", label: "ERROR", color: "#ef4444" },
];

function levelBadge(level: string): React.CSSProperties {
  const colors: Record<string, string> = {
    info: "#1e3a5f",
    warn: "#451a03",
    error: "#450a0a",
  };
  const textColors: Record<string, string> = {
    info: "#93c5fd",
    warn: "#fcd34d",
    error: "#fca5a5",
  };
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: colors[level] ?? "#1e293b",
    color: textColors[level] ?? "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  };
}

const PAGE_SIZE = 50;

interface LogViewerProps {
  initialSource?: LogSource;
  initialLevel?: LogLevel;
  initialPage?: number;
}

export default function LogViewer({ initialSource, initialLevel, initialPage = 1 }: LogViewerProps) {
  const router = useRouter();

  const [source, setSource] = useState<LogSource | undefined>(initialSource);
  const [level, setLevel] = useState<LogLevel | undefined>(initialLevel);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.logs.getLogs.query({
        source,
        level,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setData(result as LogsResponse);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }, [source, level, page]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const updateUrl = (newSource?: LogSource, newLevel?: LogLevel, newPage?: number) => {
    const params = new URLSearchParams();
    if (newSource) params.set("source", newSource);
    if (newLevel) params.set("level", newLevel);
    if (newPage && newPage > 1) params.set("page", String(newPage));
    const query = params.toString();
    router.push(`/logs${query ? `?${query}` : ""}`, { scroll: false });
  };

  const handleSourceChange = (s: LogSource | undefined) => {
    setSource(s);
    setPage(1);
    updateUrl(s, level, 1);
  };

  const handleLevelChange = (l: LogLevel | undefined) => {
    setLevel(l);
    setPage(1);
    updateUrl(source, l, 1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    updateUrl(source, level, p);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div>
      {/* ソースタブ */}
      <div style={cardStyle}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <button
            onClick={() => handleSourceChange(undefined)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: !source ? "#3b82f6" : "#334155",
              color: "#e2e8f0", fontSize: 14, fontWeight: !source ? 700 : 400,
            }}
          >
            📋 すべて
          </button>
          {SOURCES.map(s => (
            <button
              key={s.key}
              onClick={() => handleSourceChange(s.key)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: source === s.key ? "#3b82f6" : "#334155",
                color: "#e2e8f0", fontSize: 14, fontWeight: source === s.key ? 700 : 400,
              }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* コントロールバー */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
        <span style={{ color: "#94a3b8", fontSize: 14 }}>レベル：</span>
        <button
          onClick={() => handleLevelChange(undefined)}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
            background: !level ? "#475569" : "#334155", color: "#e2e8f0", fontSize: 13,
          }}
        >
          ALL
        </button>
        {LEVELS.map(l => (
          <button
            key={l.key}
            onClick={() => handleLevelChange(l.key)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: level === l.key ? "#475569" : "#334155",
              color: l.color, fontSize: 13, fontWeight: level === l.key ? 700 : 400,
            }}
          >
            {l.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => void fetchLogs()}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            background: "#3b82f6", color: "#fff", fontSize: 13,
          }}
        >
          🔄 更新
        </button>

        {data && (
          <span style={{ color: "#64748b", fontSize: 13 }}>
            {data.total.toLocaleString()} 件
          </span>
        )}
      </div>

      {/* ログテーブル */}
      <div style={cardStyle}>
        {loading ? (
          <div style={{ color: "#94a3b8", padding: 24, textAlign: "center" }}>読み込み中...</div>
        ) : !data || data.logs.length === 0 ? (
          <div style={{ color: "#64748b", padding: 24, textAlign: "center" }}>ログがありません</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, width: 160 }}>タイムスタンプ</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, width: 80 }}>ソース</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, width: 70 }}>レベル</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600 }}>メッセージ</th>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, width: 60 }}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map(log => (
                <Fragment key={log.id}>
                  <tr
                    style={{
                      borderBottom: "1px solid #1e293b",
                      background: expandedId === log.id ? "#1a2744" : "transparent",
                    }}
                  >
                    <td style={{ padding: "8px 12px", color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {log.createdAt ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#94a3b8" }}>
                      {SOURCES.find(s => s.key === log.source)?.icon ?? ""} {log.source}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={levelBadge(log.level)}>{log.level}</span>
                    </td>
                    <td style={{ padding: "8px 12px", color: "#e2e8f0" }}>
                      {log.message}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {log.detail && (
                        <button
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          style={{
                            padding: "2px 8px", borderRadius: 4, border: "1px solid #334155",
                            background: "transparent", color: "#60a5fa", cursor: "pointer", fontSize: 12,
                          }}
                        >
                          {expandedId === log.id ? "閉じる" : "展開"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && log.detail && (
                    <tr style={{ background: "#0f172a" }}>
                      <td colSpan={5} style={{ padding: "8px 24px 12px" }}>
                        <pre style={{
                          margin: 0, fontSize: 12, color: "#94a3b8",
                          background: "#1e293b", padding: 12, borderRadius: 8,
                          overflow: "auto", maxHeight: 200,
                        }}>
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(log.detail), null, 2);
                            } catch {
                              return log.detail;
                            }
                          })()}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 16 }}>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: page <= 1 ? "not-allowed" : "pointer",
              background: page <= 1 ? "#1e293b" : "#3b82f6", color: page <= 1 ? "#475569" : "#fff", fontSize: 14,
            }}
          >
            ← 前
          </button>
          <span style={{ color: "#94a3b8", fontSize: 14 }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: page >= totalPages ? "not-allowed" : "pointer",
              background: page >= totalPages ? "#1e293b" : "#3b82f6", color: page >= totalPages ? "#475569" : "#fff", fontSize: 14,
            }}
          >
            次 →
          </button>
        </div>
      )}
    </div>
  );
}
