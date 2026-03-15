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

  // --- Discord Bot ---
  const [discordToken, setDiscordToken] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [discordTokenSet, setDiscordTokenSet] = useState(false);
  const [discordRunning, setDiscordRunning] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [savingDiscord, setSavingDiscord] = useState(false);

  // --- LLM 設定 ---
  const [llmModel, setLlmModel] = useState("");
  const [llmModels, setLlmModels] = useState<Array<{ id: string; name: string; provider: string; available: boolean }>>([]);
  const [customModel, setCustomModel] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [llmProviders, setLlmProviders] = useState<Record<string, { set: boolean; masked: string }>>({});
  const [savingLlm, setSavingLlm] = useState(false);

  // --- 2FA コード ---
  const [twoFaCode, setTwoFaCode] = useState("");
  const [submitting2fa, setSubmitting2fa] = useState(false);

  // --- MCP Server ---
  const [mcpHost, setMcpHost] = useState("0.0.0.0");
  const [mcpPort, setMcpPort] = useState(8001);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [savingMcp, setSavingMcp] = useState(false);

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

    // Discord Bot 状態・設定
    fetch(`${API_URL}/api/services/discord/status`, { headers })
      .then((r) => r.json())
      .then((d: { running?: boolean }) => setDiscordRunning(d.running ?? false))
      .catch(() => {});
    fetch(`${API_URL}/api/services/discord/settings`, { headers })
      .then((r) => r.json())
      .then((d: { token_set?: boolean; channel_id?: string }) => {
        setDiscordTokenSet(d.token_set ?? false);
        setDiscordChannelId(d.channel_id ?? "");
      })
      .catch(() => {});

    // LLM 設定・モデル一覧
    fetch(`${API_URL}/api/settings/llm`, { headers })
      .then((r) => r.json())
      .then((d: { model?: string; providers?: Record<string, { set: boolean; masked: string }> }) => {
        if (d.model) setLlmModel(d.model);
        if (d.providers) setLlmProviders(d.providers);
      })
      .catch(() => {});
    fetch(`${API_URL}/api/settings/llm/models`, { headers })
      .then((r) => r.json())
      .then((d: { models?: Array<{ id: string; name: string; provider: string; available: boolean }> }) => {
        if (d.models) setLlmModels(d.models);
      })
      .catch(() => {});

    // MCP Server 状態・設定
    fetch(`${API_URL}/api/services/mcp/status`, { headers })
      .then((r) => r.json())
      .then((d: { running?: boolean }) => setMcpRunning(d.running ?? false))
      .catch(() => {});
    fetch(`${API_URL}/api/services/mcp/settings`, { headers })
      .then((r) => r.json())
      .then((d: { host?: string; port?: number }) => {
        if (d.host) setMcpHost(d.host);
        if (d.port) setMcpPort(d.port);
      })
      .catch(() => {});
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

  // LLM 設定保存
  const saveLlmSettings = async () => {
    setSavingLlm(true);
    try {
      const body: Record<string, string> = {};
      const modelToSave = useCustomModel ? customModel : llmModel;
      if (modelToSave) body.model = modelToSave;
      if (anthropicKey) body.anthropic_api_key = anthropicKey;
      if (openaiKey) body.openai_api_key = openaiKey;
      if (geminiKey) body.gemini_api_key = geminiKey;
      if (openrouterKey) body.openrouter_api_key = openrouterKey;
      const res = await fetch(`${API_URL}/api/settings/llm`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // キー入力をクリア
      setAnthropicKey(""); setOpenaiKey(""); setGeminiKey(""); setOpenrouterKey("");
      // モデル一覧を再取得（available フラグを更新）
      fetch(`${API_URL}/api/settings/llm/models`, { headers })
        .then((r) => r.json())
        .then((d: { models?: Array<{ id: string; name: string; provider: string; available: boolean }> }) => {
          if (d.models) setLlmModels(d.models);
        });
      fetch(`${API_URL}/api/settings/llm`, { headers })
        .then((r) => r.json())
        .then((d: { model?: string; providers?: Record<string, { set: boolean; masked: string }> }) => {
          if (d.providers) setLlmProviders(d.providers);
        });
      showMessage("LLM 設定を保存しました", true);
    } catch {
      showMessage("LLM 設定の保存に失敗しました", false);
    } finally {
      setSavingLlm(false);
    }
  };

  // Discord Bot 設定保存
  const saveDiscordSettings = async () => {
    setSavingDiscord(true);
    try {
      const body: { token?: string; channel_id?: string } = {};
      if (discordToken) body.token = discordToken;
      if (discordChannelId) body.channel_id = discordChannelId;
      const res = await fetch(`${API_URL}/api/services/discord/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDiscordTokenSet(true);
      setDiscordToken("");
      showMessage("Discord Bot 設定を保存しました", true);
    } catch {
      showMessage("Discord Bot 設定の保存に失敗しました", false);
    } finally {
      setSavingDiscord(false);
    }
  };

  // Discord Bot 起動・停止
  const toggleDiscord = async () => {
    setDiscordLoading(true);
    try {
      const endpoint = discordRunning ? "stop" : "start";
      const res = await fetch(`${API_URL}/api/services/discord/${endpoint}`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDiscordRunning(!discordRunning);
      showMessage(discordRunning ? "Discord Bot を停止しました" : "Discord Bot を起動しました", true);
    } catch {
      showMessage("Discord Bot の操作に失敗しました", false);
    } finally {
      setDiscordLoading(false);
    }
  };

  // MCP Server 設定保存
  const saveMcpSettings = async () => {
    setSavingMcp(true);
    try {
      const res = await fetch(`${API_URL}/api/services/mcp/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ host: mcpHost, port: mcpPort }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      showMessage("MCP Server 設定を保存しました", true);
    } catch {
      showMessage("MCP Server 設定の保存に失敗しました", false);
    } finally {
      setSavingMcp(false);
    }
  };

  // MCP Server 起動・停止
  const toggleMcp = async () => {
    setMcpLoading(true);
    try {
      const endpoint = mcpRunning ? "stop" : "start";
      const res = await fetch(`${API_URL}/api/services/mcp/${endpoint}`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setMcpRunning(!mcpRunning);
      showMessage(mcpRunning ? "MCP Server を停止しました" : "MCP Server を起動しました", true);
    } catch {
      showMessage("MCP Server の操作に失敗しました", false);
    } finally {
      setMcpLoading(false);
    }
  };

  // 2FA コード送信
  const submit2faCode = async () => {
    if (!twoFaCode.trim()) return;
    setSubmitting2fa(true);
    try {
      const res = await fetch(`${API_URL}/api/scrape/2fa`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code: twoFaCode.trim() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
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

      {/* --- 4. AI コメント更新頻度 --- */}
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
      {/* --- 5. LLM 設定 --- */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>LLM 設定</h2>
        <p style={descStyle}>
          AI コメント生成に使用するモデルと API キーを設定します。APIキーは DB に暗号化保存され即時反映されます。
        </p>

        {/* モデル選択 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>
            使用モデル
            {llmModel && <span style={{ color: "#60a5fa", marginLeft: 8 }}>現在: {llmModel}</span>}
          </label>

          {/* プリセット選択 */}
          {!useCustomModel && (
            <select
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              style={{ ...selectStyle, width: "100%", marginBottom: 8 }}
              aria-label="LLMモデル選択"
            >
              <option value="">--- モデルを選択 ---</option>
              {["anthropic", "openai", "gemini", "openrouter", "openrouter_auto"].map((prov) => {
                const group = llmModels.filter((m) => m.provider === prov);
                if (group.length === 0) return null;
                const provLabel: Record<string, string> = {
                  anthropic: "Anthropic",
                  openai: "OpenAI",
                  gemini: "Google Gemini (直接)",
                  openrouter: "OpenRouter",
                  openrouter_auto: "OpenRouter (自動ルーティング)",
                };
                return (
                  <optgroup key={prov} label={provLabel[prov] ?? prov}>
                    {group.map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.available}>
                        {m.name}{!m.available ? " ⚠ APIキー未設定" : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}

          {/* カスタムモデル入力 */}
          {useCustomModel && (
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="例: openrouter/google/gemini-3-flash-preview"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                marginBottom: 8,
              }}
            />
          )}

          <button
            onClick={() => setUseCustomModel(!useCustomModel)}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 12,
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            {useCustomModel ? "← リストから選択" : "カスタムモデル名を入力"}
          </button>
        </div>

        {/* API キー入力 */}
        {(() => {
          const apiKeyFields: Array<{
            label: string;
            key: string;
            value: string;
            setter: (v: string) => void;
          }> = [
            { label: "Anthropic API Key", key: "anthropic", value: anthropicKey, setter: setAnthropicKey },
            { label: "OpenAI API Key",     key: "openai",    value: openaiKey,    setter: setOpenaiKey },
            { label: "Gemini API Key",     key: "gemini",    value: geminiKey,    setter: setGeminiKey },
            { label: "OpenRouter API Key", key: "openrouter",value: openrouterKey,setter: setOpenrouterKey },
          ];
          return (
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {apiKeyFields.map(({ label, key, value, setter }) => {
                const prov = llmProviders[key];
                return (
                  <div key={key}>
                    <label style={{ fontSize: 13, color: "#94a3b8", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      {label}
                      {prov?.set ? (
                        <span style={{ fontSize: 11, color: "#4ade80" }}>✓ 設定済み ({prov.masked})</span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#64748b" }}>未設定</span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder={prov?.set ? "新しいキーを入力して上書き" : `${label} を入力`}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "#0f172a",
                        color: "#e2e8f0",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}

        <button
          onClick={saveLlmSettings}
          disabled={savingLlm}
          aria-label="LLM 設定を保存"
          style={buttonStyle("#3b82f6", savingLlm)}
        >
          {savingLlm ? "保存中..." : "保存"}
        </button>
      </div>

      {/* --- 6. Discord Bot --- */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Discord Bot</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 9999,
                background: discordRunning ? "#14532d" : "#1e293b",
                color: discordRunning ? "#4ade80" : "#64748b",
                border: `1px solid ${discordRunning ? "#4ade80" : "#334155"}`,
              }}
            >
              {discordRunning ? "● 起動中" : "○ 停止中"}
            </span>
            <button
              onClick={toggleDiscord}
              disabled={discordLoading}
              aria-label={discordRunning ? "Discord Bot を停止" : "Discord Bot を起動"}
              style={buttonStyle(discordRunning ? "#ef4444" : "#10b981", discordLoading)}
            >
              {discordLoading ? "処理中..." : discordRunning ? "停止" : "起動"}
            </button>
          </div>
        </div>
        <p style={descStyle}>
          毎朝自動レポート・スラッシュコマンド（/portfolio /ask 等）を提供する Discord Bot の設定。
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 4 }}>
              Discord Bot Token {discordTokenSet && <span style={{ color: "#4ade80" }}>（設定済み）</span>}
            </label>
            <input
              type="password"
              value={discordToken}
              onChange={(e) => setDiscordToken(e.target.value)}
              placeholder={discordTokenSet ? "新しいトークンを入力して上書き" : "Bot Token を入力"}
              aria-label="Discord Bot Token"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 4 }}>
              通知チャンネル ID
            </label>
            <input
              type="text"
              value={discordChannelId}
              onChange={(e) => setDiscordChannelId(e.target.value)}
              placeholder="例: 1234567890123456789"
              aria-label="Discord 通知チャンネル ID"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            onClick={saveDiscordSettings}
            disabled={savingDiscord}
            aria-label="Discord Bot 設定を保存"
            style={buttonStyle("#3b82f6", savingDiscord)}
          >
            {savingDiscord ? "保存中..." : "設定を保存"}
          </button>
        </div>
      </div>

      {/* --- 7. MCP Server --- */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>MCP Server</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 9999,
                background: mcpRunning ? "#14532d" : "#1e293b",
                color: mcpRunning ? "#4ade80" : "#64748b",
                border: `1px solid ${mcpRunning ? "#4ade80" : "#334155"}`,
              }}
            >
              {mcpRunning ? "● 起動中" : "○ 停止中"}
            </span>
            <button
              onClick={toggleMcp}
              disabled={mcpLoading}
              aria-label={mcpRunning ? "MCP Server を停止" : "MCP Server を起動"}
              style={buttonStyle(mcpRunning ? "#ef4444" : "#10b981", mcpLoading)}
            >
              {mcpLoading ? "処理中..." : mcpRunning ? "停止" : "起動"}
            </button>
          </div>
        </div>
        <p style={descStyle}>
          Claude Code から資産データを参照できる MCP Server（Streamable HTTP）の設定。
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="mcp-host" style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 4 }}>Host</label>
            <input
              id="mcp-host"
              type="text"
              value={mcpHost}
              onChange={(e) => setMcpHost(e.target.value)}
              aria-label="MCP Server ホスト"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label htmlFor="mcp-port" style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 4 }}>Port</label>
            <input
              id="mcp-port"
              type="number"
              value={mcpPort}
              onChange={(e) => setMcpPort(Number(e.target.value))}
              aria-label="MCP Server ポート番号"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </div>
        </div>
        {mcpRunning && (
          <div
            style={{
              background: "#0f172a",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            <div style={{ marginBottom: 4, color: "#60a5fa" }}>Claude Code への接続設定:</div>
            <code style={{ color: "#e2e8f0", fontSize: 11 }}>
              {`{ "mcpServers": { "assetbridge": { "type": "http", "url": "http://localhost:${mcpPort}/mcp" } } }`}
            </code>
          </div>
        )}
        <div>
          <button
            onClick={saveMcpSettings}
            disabled={savingMcp}
            aria-label="MCP Server 設定を保存"
            style={buttonStyle("#3b82f6", savingMcp)}
          >
            {savingMcp ? "保存中..." : "設定を保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
