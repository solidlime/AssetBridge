"use client";
import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";
const headers = { "X-API-Key": API_KEY, "Content-Type": "application/json" };

export default function SettingsPage() {
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/settings/system-prompt`, { headers })
      .then((r) => r.json())
      .then((d: { prompt?: string }) => setPrompt(d.prompt || ""))
      .catch(() => {
        console.warn("システムプロンプトの取得に失敗しました");
      });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/api/settings/system-prompt`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setMessage("保存しました");
    } catch (err) {
      console.warn("システムプロンプトの保存に失敗しました:", err);
      setMessage("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const refreshComments = async () => {
    setRefreshing(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/api/ai/comments/refresh`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setMessage("AIコメントを更新しました");
    } catch (err) {
      console.warn("AIコメントの更新に失敗しました:", err);
      setMessage("更新に失敗しました");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>設定</h1>

      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>AIエージェント システムプロンプト</h2>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
          AI分析コメントの生成に使用するシステムプロンプトをカスタマイズできます。
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          aria-label="AIエージェント システムプロンプト"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={save}
            disabled={saving}
            aria-label="システムプロンプトを保存"
            style={{
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 14,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={refreshComments}
            disabled={refreshing}
            aria-label="AIコメントを更新"
            style={{
              background: "#10b981",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              cursor: refreshing ? "not-allowed" : "pointer",
              fontSize: 14,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? "更新中..." : "AIコメント更新"}
          </button>
          {message && (
            <span role="status" style={{ fontSize: 13, color: "#4ade80" }}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
