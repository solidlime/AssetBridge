"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

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

export default function SettingsPage() {
  // --- システムプロンプト ---
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  // --- スクレイプスケジュール ---
  const [schedHour, setSchedHour] = useState(9);
  const [schedMinute, setSchedMinute] = useState(0);
  const [savingSched, setSavingSched] = useState(false);

  // --- 2FA コード ---
  const [twoFaCode, setTwoFaCode] = useState("");
  const [submitting2fa, setSubmitting2fa] = useState(false);

  // --- 共有メッセージ ---
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const showMessage = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  // 初期値取得
  useEffect(() => {
    trpc.settings.systemPrompt
      .query()
      .then((d: { prompt?: string }) => setPrompt(d.prompt ?? ""))
      .catch(() => {
        console.warn("システムプロンプトの取得に失敗しました");
      });

    trpc.settings.scrapeSchedule
      .query()
      .then((d: { hour?: number; minute?: number }) => {
        if (typeof d.hour === "number") setSchedHour(d.hour);
        if (typeof d.minute === "number") setSchedMinute(d.minute);
      })
      .catch(() => {
        console.warn("スクレイプスケジュールの取得に失敗しました");
      });
  }, []);

  // システムプロンプト保存
  const savePrompt = async () => {
    setSaving(true);
    try {
      await trpc.settings.setSystemPrompt.mutate({ prompt });
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
      await trpc.settings.setScrapeSchedule.mutate({ hour: schedHour, minute: schedMinute });
      showMessage("スクレイプスケジュールを保存しました", true);
    } catch (err) {
      console.warn("スクレイプスケジュールの保存に失敗しました:", err);
      showMessage("保存に失敗しました", false);
    } finally {
      setSavingSched(false);
    }
  };

  // 2FA コード送信
  const submit2faCode = async () => {
    if (!twoFaCode.trim()) return;
    setSubmitting2fa(true);
    try {
      await trpc.settings.setMf2faCode.mutate({ code: twoFaCode.trim() });
      setTwoFaCode("");
      showMessage("2FAコードを送信しました", true);
    } catch {
      showMessage("2FAコードの送信に失敗しました", false);
    } finally {
      setSubmitting2fa(false);
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

      {/* --- 3. 2FA コード入力 --- */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          2FA コード入力（スクレイプ認証）
        </h2>
        <p style={descStyle}>
          スクレイプ実行中に MoneyForward のメール 2FA が必要になった場合、ここにコードを入力してください。
          入力後、スクレイパーが自動的にコードを受け取って認証を続行します。
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label
              htmlFor="2fa-code"
              style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 4 }}
            >
              認証コード
            </label>
            <input
              id="2fa-code"
              type="text"
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value)}
              placeholder="例: 12345678"
              maxLength={8}
              aria-label="2FA 認証コード"
              onKeyDown={(e) => e.key === "Enter" && submit2faCode()}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 20,
                letterSpacing: "0.2em",
                fontFamily: "monospace",
              }}
            />
          </div>
          <button
            onClick={submit2faCode}
            disabled={submitting2fa || !twoFaCode.trim()}
            aria-label="2FAコードを送信"
            style={buttonStyle("#f59e0b", submitting2fa || !twoFaCode.trim())}
          >
            {submitting2fa ? "送信中..." : "送信"}
          </button>
        </div>
      </div>
    </div>
  );
}
