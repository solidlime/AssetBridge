"use client";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

export default function AiCommentSection() {
  const [portfolioComment, setPortfolioComment] = useState<string | null>(null);
  const [pnlComment, setPnlComment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/comments/refresh`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { portfolio?: string; pnl?: string };
      setPortfolioComment(data.portfolio ?? null);
      setPnlComment(data.pnl ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPortfolioComment(`AIコメントの生成に失敗しました。(${msg})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* 生成ボタン */}
      {!portfolioComment && !loading && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 16 }}>
            資産全体・前日比・7日間トレンドを踏まえたAIコメントを生成します
          </p>
          <button
            onClick={generate}
            aria-label="AIコメントを生成"
            style={{
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            AIコメントを生成
          </button>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          style={{ background: "#1e293b", borderRadius: 12, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}
        >
          生成中...
        </div>
      )}

      {/* ポートフォリオコメント */}
      {portfolioComment && (
        <div
          style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 16, borderLeft: "3px solid #60a5fa" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#60a5fa" }}>AI コメント</span>
            <button
              onClick={generate}
              disabled={loading}
              aria-label="AIコメントを再生成"
              style={{
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 11,
                color: "#94a3b8",
                cursor: "pointer",
              }}
            >
              再生成
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#e2e8f0" }}>{portfolioComment}</p>
        </div>
      )}

      {/* PnL コメント */}
      {pnlComment && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, borderLeft: "3px solid #10b981" }}>
          <div style={{ fontSize: 12, color: "#10b981", marginBottom: 8 }}>銘柄 AI コメント</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#e2e8f0" }}>{pnlComment}</p>
        </div>
      )}
    </div>
  );
}
