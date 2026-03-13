"use client";
import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";
const headers = { "X-API-Key": API_KEY, "Content-Type": "application/json" };

const selectStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 14,
  cursor: "pointer",
};

const buttonStyle = (color: string, disabled: boolean): React.CSSProperties => ({
  background: color,
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "8px 20px",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 14,
  opacity: disabled ? 0.6 : 1,
});

const cardStyle: React.CSSProperties = {
  background: "#1e293b",
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  marginBottom: 12,
};

const TTL_OPTIONS = [1, 3, 6, 12, 24] as const;
type TtlOption = (typeof TTL_OPTIONS)[number];

export default function SettingsPage() {
  // --- システムプロンプト ---
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  // --- スクレイプスケジュール ---
  const [schedHour, setSchedHour] = useState(9);
  const [schedMinute, setSchedMinute] = useState(0);
  const [savingSched, setSavingSched] = useState(false);

  // --- AI コメント TTL ---
  const [ttlHours, setTtlHours] = useState<TtlOption>(6);
  const [savingTtl, setSavingTtl] = useState(false);

  // --- AIコメント更新 ---
  const [refreshing, setRefreshing] = useState(false);

  // --- 共有メッセージ ---
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const showMessage = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  // 初期値取得
  useEffect(() => {
    fetch(`${API_URL}/api/settings/system-prompt`, { headers })
      .then((r) => r.json())
      .then((d: { prompt?: string }) => setPrompt(d.prompt ?? ""))
      .catch(() => {
        console.warn("システムプロンプトの取得に失敗しました");
      });

    fetch(`${API_URL}/api/settings/scrape-schedule`, { headers })
      .then((r) => r.json())
      .then((d: { hour?: number; minute?: number }) => {
        if (typeof d.hour === "number") setSchedHour(d.hour);
        if (typeof d.minute === "number") setSchedMinute(d.minute);
      })
      .catch(() => {
        console.warn("スクレイプスケジュールの取得に失敗しました");
      });

    fetch(`${API_URL}/api/settings/ai-comment-ttl`, { headers })
      .then((r) => r.json())
      .then((d: { hours?: number }) => {
        const h = d.hours;
        if (typeof h === "number" && (TTL_OPTIONS as readonly number[]).includes(h)) {
          setTtlHours(h as TtlOption);
        }
      })
      .catch(() => {
        console.warn("AI コメント TTL の取得に失敗しました");
      });
  }, []);

  // システムプロンプト保存
  const savePrompt = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/system-prompt`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      showMessage("システムプロンプトを保存しました", true);
    } catch (err) {
      console.warn("システムプロンプトの保存に失敗しました:", err);
      showMessage("保存に失敗しました", false);
    } finally {
      setSaving(false);
    }
  };

  // スクレイプスケジュール保存
  const saveSchedule = async () => {
    setSavingSched(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/scrape-schedule`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ hour: schedHour, minute: schedMinute }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      showMessage("スクレイプスケジュールを保存しました", true);
    } catch (err) {
      console.warn("スクレイプスケジュールの保存に失敗しました:", err);
      showMessage("保存に失敗しました", false);
    } finally {
      setSavingSched(false);
    }
  };

  // AI コメント TTL 保存
  const saveTtl = async () => {
    setSavingTtl(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/ai-comment-ttl`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ hours: ttlHours }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      showMessage("AI コメント TTL を保存しました", true);
    } catch (err) {
      console.warn("AI コメント TTL の保存に失敗しました:", err);
      showMessage("保存に失敗しました", false);
    } finally {
      setSavingTtl(false);
    }
  };

  // AI コメント今すぐ更新
  const refreshComments = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/comments/refresh`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      showMessage("AI コメントを更新しました", true);
    } catch (err) {
      console.warn("AI コメントの更新に失敗しました:", err);
      showMessage("更新に失敗しました", false);
    } finally {
      setRefreshing(false);
    }
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = [0, 15, 30, 45];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>設定</h1>

      {/* グローバルメッセージ */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: message.ok ? "#14532d" : "#450a0a",
            border: `1px solid ${message.ok ? "#4ade80" : "#f87171"}`,
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: message.ok ? "#4ade80" : "#f87171",
          }}
        >
          {message.text}
        </div>
      )}

      {/* --- 1. システムプロンプト --- */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          AIエージェント システムプロンプト
        </h2>
        <p style={descStyle}>
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
        <div style={{ marginTop: 12 }}>
          <button
            onClick={savePrompt}
            disabled={saving}
            aria-label="システムプロンプトを保存"
            style={buttonStyle("#3b82f6", saving)}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* --- 2. スクレイプスケジュール --- */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          スクレイプスケジュール
        </h2>
        <p style={descStyle}>
          毎日何時何分に MoneyForward から資産データを自動取得するか設定します。
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label htmlFor="sched-hour" style={{ fontSize: 14, color: "#cbd5e1" }}>
            時:
          </label>
          <select
            id="sched-hour"
            value={schedHour}
            onChange={(e) => setSchedHour(Number(e.target.value))}
            style={selectStyle}
            aria-label="スクレイプ時刻（時）"
          >
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}
              </option>
            ))}
          </select>
          <label htmlFor="sched-minute" style={{ fontSize: 14, color: "#cbd5e1" }}>
            分:
          </label>
          <select
            id="sched-minute"
            value={schedMinute}
            onChange={(e) => setSchedMinute(Number(e.target.value))}
            style={selectStyle}
            aria-label="スクレイプ時刻（分）"
          >
            {minuteOptions.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            JST — 毎日{" "}
            <strong style={{ color: "#94a3b8" }}>
              {String(schedHour).padStart(2, "0")}:{String(schedMinute).padStart(2, "0")}
            </strong>{" "}
            に自動スクレイプ
          </span>
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={saveSchedule}
            disabled={savingSched}
            aria-label="スクレイプスケジュールを保存"
            style={buttonStyle("#3b82f6", savingSched)}
          >
            {savingSched ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* --- 3. AI コメント更新頻度 --- */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          AI コメント更新頻度
        </h2>
        <p style={descStyle}>
          AI コメントキャッシュの有効期間を設定します。期間を過ぎると次回表示時に再生成されます。
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label htmlFor="ttl-hours" style={{ fontSize: 14, color: "#cbd5e1" }}>
            キャッシュ有効期間:
          </label>
          <select
            id="ttl-hours"
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value) as TtlOption)}
            style={selectStyle}
            aria-label="AI コメントキャッシュ有効期間（時間）"
          >
            {TTL_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} 時間
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            現在:{" "}
            <strong style={{ color: "#94a3b8" }}>{ttlHours} 時間ごとに再生成</strong>
          </span>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={saveTtl}
            disabled={savingTtl}
            aria-label="AI コメント TTL を保存"
            style={buttonStyle("#3b82f6", savingTtl)}
          >
            {savingTtl ? "保存中..." : "保存"}
          </button>
          <button
            onClick={refreshComments}
            disabled={refreshing}
            aria-label="AI コメントを今すぐ更新"
            style={buttonStyle("#10b981", refreshing)}
          >
            {refreshing ? "更新中..." : "AI コメント今すぐ更新"}
          </button>
        </div>
      </div>
    </div>
  );
}
