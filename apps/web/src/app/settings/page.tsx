"use client";
import { useState, useEffect, useCallback } from "react";
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  display: "block",
  marginBottom: 4,
};

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

const SECRET_LABELS: Record<string, string> = {
  mf_email: "MF メールアドレス",
  mf_password: "MF パスワード",
  discord_token: "Discord Bot Token",
  web_api_key: "Web API Key",
};

const SECRET_KEYS = [
  "mf_email",
  "mf_password",
  "discord_token",
  "web_api_key",
] as const;

type SecretKey = typeof SECRET_KEYS[number];

// グループ分け
const MF_KEYS = ["mf_email", "mf_password"] as const;
const DISCORD_SECRET_KEYS = ["discord_token"] as const;
const OTHER_KEYS = ["web_api_key"] as const;

function formatUpdatedAt(unixTs: number | null | undefined): string {
  if (!unixTs) return "";
  return new Date(unixTs * 1000).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsPage() {
  // --- スクレイプスケジュール ---
  const [schedHour, setSchedHour] = useState(9);
  const [schedMinute, setSchedMinute] = useState(0);

  // --- MF 同期ステータス ---
  type MfStatus = { status: "success" | "failed" | "running" | "pending" | "await_2fa" | null; started_at: string | null; finished_at: string | null };
  const [mfStatus, setMfStatus] = useState<MfStatus>({ status: null, started_at: null, finished_at: null });
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchMfStatus = useCallback(() => {
    trpc.scrape.status.query().then((d) => {
      setMfStatus({ status: d.status, started_at: d.started_at, finished_at: d.finished_at });
    }).catch(() => {});
  }, []);

  const isActiveStatus = mfStatus.status === "running" || mfStatus.status === "pending" || mfStatus.status === "await_2fa";
  const pollInterval = isActiveStatus ? 3_000 : 15_000;

  useEffect(() => {
    fetchMfStatus();
    const timer = setInterval(fetchMfStatus, pollInterval);
    return () => clearInterval(timer);
  }, [fetchMfStatus, pollInterval]);

  const triggerScrape = async () => {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      await trpc.scrape.trigger.mutate();
      setTriggerMsg({ text: "スクレイプを開始しました", ok: true });
      setTimeout(() => setTriggerMsg(null), 3000);
      fetchMfStatus();
    } catch (err) {
      setTriggerMsg({ text: err instanceof Error ? err.message : "開始に失敗しました", ok: false });
      setTimeout(() => setTriggerMsg(null), 4000);
    } finally {
      setTriggering(false);
    }
  };

  const submit2faCode = async () => {
    if (!twoFaCode.trim()) return;
    try {
      await trpc.settings.setMf2faCode.mutate({ code: twoFaCode.trim() });
      setTwoFaCode("");
      fetchMfStatus();
    } catch {
      setTriggerMsg({ text: "2FAコードの送信に失敗しました", ok: false });
    }
  };

  // --- 2FA コード（ワンタイム） ---
  const [twoFaCode, setTwoFaCode] = useState("");

  // --- Discord チャンネル ID ---
  const [discordChannelId, setDiscordChannelId] = useState("");

  // --- 設定の最終更新時刻 ---
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<{
    scrapeSchedule: number | null;
    secrets: number | null;
    discordChannelId: number | null;
  } | null>(null);



  // --- シークレット（APIキー等） ---
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>(
    () => Object.fromEntries(SECRET_KEYS.map((k) => [k, ""])) as Record<SecretKey, string>
  );
  const [secretStatus, setSecretStatus] = useState<
    Record<SecretKey, { isSet: boolean; masked: string | null }>
  >(
    () =>
      Object.fromEntries(
        SECRET_KEYS.map((k) => [k, { isSet: false, masked: null }])
      ) as Record<SecretKey, { isSet: boolean; masked: string | null }>
  );

  // --- 保存状態 ---
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const showMessage = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 5000);
  };

  // 初期値取得
  useEffect(() => {
    trpc.settings.getAllSettings
      .query()
      .then((d) => {
        if (typeof d.scrapeSchedule.hour === "number") setSchedHour(d.scrapeSchedule.hour);
        if (typeof d.scrapeSchedule.minute === "number") setSchedMinute(d.scrapeSchedule.minute);
        if (d.discordChannelId) setDiscordChannelId(d.discordChannelId);
        // シークレットのステータス（マスク済み）を保存
        const statusMap = {} as Record<SecretKey, { isSet: boolean; masked: string | null }>;
        for (const key of SECRET_KEYS) {
          const s = (d.secrets as Record<string, { isSet: boolean; masked: string | null }>)[key];
          statusMap[key] = s ?? { isSet: false, masked: null };
        }
        setSecretStatus(statusMap);
        if (d.updatedAt) setSettingsUpdatedAt(d.updatedAt);
      })
      .catch(() => {
        console.warn("設定の取得に失敗しました");
      });
  }, []);

  // すべて保存
  const saveAll = async () => {
    setSaving(true);
    const errors: string[] = [];

    // 1. スクレイプスケジュール
    try {
      await trpc.settings.setScrapeSchedule.mutate({ hour: schedHour, minute: schedMinute });
    } catch {
      errors.push("スクレイプスケジュール");
    }

    // 2. Discord チャンネル ID（変更があれば）
    try {
      await trpc.settings.setDiscordChannelId.mutate({ channelId: discordChannelId.trim() });
    } catch {
      errors.push("Discordチャンネル ID");
    }

    // 3. シークレット（入力値がある場合のみ送信）
    for (const key of SECRET_KEYS) {
      const val = secrets[key];
      if (val.trim() !== "") {
        try {
          await trpc.settings.setSecret.mutate({ key, value: val.trim() });
        } catch {
          errors.push(SECRET_LABELS[key] ?? key);
        }
      }
    }

    setSaving(false);

    // MF認証情報が入力されていた場合は自動でスクレイプ開始
    const hasMfCredentials =
      secrets["mf_email"].trim() !== "" || secrets["mf_password"].trim() !== "";
    if (hasMfCredentials && errors.length === 0) {
      try {
        await trpc.scrape.trigger.mutate();
        setTriggerMsg({ text: "認証情報を保存しました。同期を開始します...", ok: true });
      } catch {
        // 既に実行中の場合は無視
      }
      fetchMfStatus();
    }

    if (errors.length === 0) {
      showMessage("すべての設定を保存しました", true);
      // シークレット入力欄をリセット
      setSecrets(Object.fromEntries(SECRET_KEYS.map((k) => [k, ""])) as Record<SecretKey, string>);
      // ステータスを再取得
      trpc.settings.getAllSettings.query().then((d) => {
        const statusMap = {} as Record<SecretKey, { isSet: boolean; masked: string | null }>;
        for (const key of SECRET_KEYS) {
          const s = (d.secrets as Record<string, { isSet: boolean; masked: string | null }>)[key];
          statusMap[key] = s ?? { isSet: false, masked: null };
        }
        setSecretStatus(statusMap);
        if (d.updatedAt) setSettingsUpdatedAt(d.updatedAt);
      }).catch(() => {});
    } else {
      showMessage(`保存に失敗した項目: ${errors.join("、")}`, false);
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

      {/* --- 1. スクレイプスケジュール --- */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            スクレイプスケジュール
          </h2>
          {settingsUpdatedAt?.scrapeSchedule ? (
            <span
              style={{
                fontSize: 11,
                color: "#4ade80",
                background: "#14532d",
                borderRadius: 4,
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              ✅ 設定済み
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "#94a3b8",
                background: "#1e293b",
                borderRadius: 4,
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              未設定（デフォルト）
            </span>
          )}
          {formatUpdatedAt(settingsUpdatedAt?.scrapeSchedule) && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              最終更新: {formatUpdatedAt(settingsUpdatedAt?.scrapeSchedule)}
            </span>
          )}
        </div>
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
      </div>

      {/* --- 2. MoneyForward 認証情報 --- */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>MoneyForward 認証情報</h2>
            {formatUpdatedAt(settingsUpdatedAt?.secrets) && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                最終更新: {formatUpdatedAt(settingsUpdatedAt?.secrets)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {mfStatus.status && (
              <span style={{
                fontSize: 12, padding: "2px 10px", borderRadius: 12, fontWeight: 600,
                background: mfStatus.status === "success" ? "#14532d"
                  : mfStatus.status === "failed" ? "#450a0a"
                  : mfStatus.status === "await_2fa" ? "#1a1500"
                  : "#1e3a5f",
                color: mfStatus.status === "success" ? "#4ade80"
                  : mfStatus.status === "failed" ? "#f87171"
                  : mfStatus.status === "await_2fa" ? "#eab308"
                  : "#60a5fa",
              }}>
                {mfStatus.status === "success" ? "同期済み"
                  : mfStatus.status === "failed" ? "エラー"
                  : mfStatus.status === "await_2fa" ? "2FA 待ち"
                  : "実行中"}
              </span>
            )}
            <button
              onClick={triggerScrape}
              disabled={triggering || mfStatus.status === "running" || mfStatus.status === "pending" || mfStatus.status === "await_2fa"}
              style={{
                background: triggering || mfStatus.status === "running" || mfStatus.status === "await_2fa" ? "#334155" : "#3b82f6",
                color: triggering || mfStatus.status === "running" || mfStatus.status === "await_2fa" ? "#94a3b8" : "white",
                border: "none", borderRadius: 8, padding: "6px 16px",
                fontSize: 13, fontWeight: 600,
                cursor: triggering || mfStatus.status === "running" || mfStatus.status === "await_2fa" ? "not-allowed" : "pointer",
              }}
            >
              {triggering ? "開始中..." : mfStatus.status === "running" || mfStatus.status === "pending" || mfStatus.status === "await_2fa" ? "実行中..." : "今すぐ同期"}
            </button>
          </div>
        </div>
        {triggerMsg && (
          <div style={{
            fontSize: 12, padding: "6px 12px", borderRadius: 6, marginBottom: 10,
            background: triggerMsg.ok ? "#14532d" : "#450a0a",
            color: triggerMsg.ok ? "#4ade80" : "#f87171",
          }}>
            {triggerMsg.text}
          </div>
        )}
        {mfStatus.finished_at && (
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
            最終同期: {new Date(mfStatus.finished_at).toLocaleString("ja-JP")}
          </div>
        )}
        <p style={descStyle}>
          MoneyForward へのログインに使用するメールアドレスとパスワードを設定します。
          入力欄を空白のまま保存しても既存の値は変更されません。
          初回ログイン時やセッション期限切れ後に 2FA コードが必要になった場合はここに入力してください。
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {MF_KEYS.map((key) => {
            const status = secretStatus[key];
            return (
              <div key={key}>
                <label htmlFor={`secret-${key}`} style={labelStyle}>
                  {SECRET_LABELS[key]}
                  {status.isSet ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#4ade80",
                        background: "#14532d",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      ✅ 設定済み: {status.masked}
                    </span>
                  ) : (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#94a3b8",
                        background: "#1e293b",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      未設定
                    </span>
                  )}
                </label>
                <input
                  id={`secret-${key}`}
                  type="password"
                  value={secrets[key]}
                  onChange={(e) =>
                    setSecrets((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={status.isSet ? "変更する場合のみ入力" : "未設定"}
                  aria-label={SECRET_LABELS[key]}
                  style={inputStyle}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* --- 2FA 入力セクション（await_2fa 状態のときのみ表示） --- */}
      {mfStatus.status === "await_2fa" && (
        <div style={{
          ...cardStyle,
          background: "#1a1a00",
          border: "2px solid #eab308",
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#eab308" }}>
            📱 2FA 認証が必要です
          </h2>
          <p style={{ ...descStyle, color: "#ca8a04" }}>
            MoneyForward のログインに 2FA 認証コードが必要です。認証アプリからコードを入力してください。
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="2fa-code-active" style={{ ...labelStyle, color: "#ca8a04" }}>
                📱 2FA 認証コードを入力してください
              </label>
              <input
                id="2fa-code-active"
                type="text"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit2faCode(); }}
                placeholder="例: 123456"
                maxLength={8}
                aria-label="2FA 認証コード"
                style={{
                  ...inputStyle,
                  fontSize: 20,
                  letterSpacing: "0.3em",
                  fontFamily: "monospace",
                  border: "1px solid #eab308",
                  background: "#111100",
                }}
              />
            </div>
            <button
              onClick={submit2faCode}
              disabled={!twoFaCode.trim()}
              style={{
                background: twoFaCode.trim() ? "#eab308" : "#4b4b00",
                color: twoFaCode.trim() ? "#000" : "#6b6b00",
                border: "none", borderRadius: 8, padding: "10px 24px",
                fontSize: 14, fontWeight: 700,
                cursor: twoFaCode.trim() ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              コードを送信
            </button>
          </div>
        </div>
      )}

      {/* --- 3. Discord 設定 --- */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Discord 設定</h2>
          {(secretStatus.discord_token?.isSet || discordChannelId) ? (
            <span
              style={{
                fontSize: 11,
                color: "#4ade80",
                background: "#14532d",
                borderRadius: 4,
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              ✅ 設定済み
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "#94a3b8",
                background: "#1e293b",
                borderRadius: 4,
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              未設定
            </span>
          )}
          {formatUpdatedAt(settingsUpdatedAt?.discordChannelId) && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              最終更新: {formatUpdatedAt(settingsUpdatedAt?.discordChannelId)}
            </span>
          )}
        </div>
        <p style={descStyle}>通知を送信する Discord チャンネルの ID と Bot Token を設定します。</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor="discord-channel" style={labelStyle}>
              チャンネル ID
              {discordChannelId && settingsUpdatedAt?.discordChannelId ? (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: "#4ade80",
                    background: "#14532d",
                    borderRadius: 4,
                    padding: "1px 6px",
                  }}
                >
                  設定済み
                </span>
              ) : null}
            </label>
            <input
              id="discord-channel"
              type="text"
              value={discordChannelId}
              onChange={(e) => setDiscordChannelId(e.target.value)}
              placeholder="例: 1234567890123456789"
              style={inputStyle}
              aria-label="Discord チャンネル ID"
            />
          </div>
          {DISCORD_SECRET_KEYS.map((key) => {
            const status = secretStatus[key];
            return (
              <div key={key}>
                <label htmlFor={`secret-${key}`} style={labelStyle}>
                  {SECRET_LABELS[key]}
                  {status.isSet ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#4ade80",
                        background: "#14532d",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      ✅ 設定済み: {status.masked}
                    </span>
                  ) : (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#94a3b8",
                        background: "#1e293b",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      未設定
                    </span>
                  )}
                </label>
                <input
                  id={`secret-${key}`}
                  type="password"
                  value={secrets[key]}
                  onChange={(e) =>
                    setSecrets((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={status.isSet ? "変更する場合のみ入力" : "未設定"}
                  aria-label={SECRET_LABELS[key]}
                  style={inputStyle}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* --- 4. API キー / シークレット設定 --- */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            API キー / シークレット設定
          </h2>
          {formatUpdatedAt(settingsUpdatedAt?.secrets) && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              最終更新: {formatUpdatedAt(settingsUpdatedAt?.secrets)}
            </span>
          )}
        </div>
        <p style={descStyle}>
          各種 API キーを設定します。入力欄を空白のまま保存しても既存の値は変更されません。
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {OTHER_KEYS.map((key) => {
            const status = secretStatus[key];
            return (
              <div key={key}>
                <label htmlFor={`secret-${key}`} style={labelStyle}>
                  {SECRET_LABELS[key]}
                  {status.isSet ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#4ade80",
                        background: "#14532d",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      ✅ 設定済み: {status.masked}
                    </span>
                  ) : (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#94a3b8",
                        background: "#1e293b",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      未設定
                    </span>
                  )}
                </label>
                <input
                  id={`secret-${key}`}
                  type="password"
                  value={secrets[key]}
                  onChange={(e) =>
                    setSecrets((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={status.isSet ? "変更する場合のみ入力" : "未設定"}
                  aria-label={SECRET_LABELS[key]}
                  style={inputStyle}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* --- すべて保存ボタン --- */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "linear-gradient(transparent, #0f172a 40%)",
          paddingTop: 24,
          paddingBottom: 24,
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
          alignItems: "center",
        }}
      >
        {saving && (
          <span style={{ fontSize: 13, color: "#94a3b8" }}>保存中...</span>
        )}
        <button
          onClick={saveAll}
          disabled={saving}
          aria-label="すべての設定を保存"
          style={{
            background: saving ? "#1d4ed8" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "12px 32px",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 15,
            fontWeight: 600,
            opacity: saving ? 0.7 : 1,
            boxShadow: "0 4px 14px rgba(59,130,246,0.4)",
            transition: "opacity 0.15s, box-shadow 0.15s",
          }}
        >
          {saving ? "保存中..." : "すべて保存"}
        </button>
      </div>
    </div>
  );
}
