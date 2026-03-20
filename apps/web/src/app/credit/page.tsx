"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

// ── 型定義 ──────────────────────────────────────────────────────────────────

interface WithdrawalRow {
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
}

interface Account {
  assetId: number;
  name: string;
  balanceJpy: number;
}

// ── スタイル定数（settings/page.tsx パターンに合わせる） ─────────────────────

const cardStyle: React.CSSProperties = {
  background: "#1e293b",
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

const selectStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
  minWidth: 180,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  color: "#94a3b8",
  fontWeight: 600,
  whiteSpace: "nowrap",
  borderBottom: "1px solid #334155",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #1e2940",
};

// ── ユーティリティ ───────────────────────────────────────────────────────────

function formatJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

// ── ページコンポーネント ─────────────────────────────────────────────────────

export default function CreditPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [localMapping, setLocalMapping] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── 初期データ取得 ──────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      trpc.incomeExpense.getCcBalanceStatus.query(),
      trpc.incomeExpense.getCcAccountMapping.query(),
    ])
      .then(([balanceStatus, accountMapping]) => {
        setRows(
          balanceStatus.summary.map((s) => ({
            cardName: s.cardName,
            withdrawalDate: s.withdrawalDate,
            amountJpy: s.amountJpy,
          }))
        );
        setLocalMapping(accountMapping.mapping);
        setAccounts(accountMapping.accounts);
      })
      .catch(() => {
        setSaveMessage({ text: "データの取得に失敗しました", ok: false });
      })
      .finally(() => setIsLoading(false));
  }, []);

  // ── ドロップダウン変更ハンドラ ───────────────────────────────────────────

  const handleMappingChange = (cardName: string, value: string) => {
    setLocalMapping((prev) => {
      const next = { ...prev };
      if (value === "") {
        delete next[cardName];
      } else {
        next[cardName] = Number(value);
      }
      return next;
    });
  };

  // ── 保存 ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await trpc.incomeExpense.setCcAccountMapping.mutate(localMapping);
      setSaveMessage({ text: "✅ 口座設定を保存しました", ok: true });
    } catch (err) {
      setSaveMessage({
        text: `❌ 保存に失敗しました: ${err instanceof Error ? err.message : "Unknown error"}`,
        ok: false,
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  // ── 集計（localMapping をもとにリアルタイム計算） ─────────────────────────

  const accountBalanceMap = new Map<number, number>(
    accounts.map((a) => [a.assetId, a.balanceJpy])
  );

  const totalWithdrawal = rows.reduce((sum, r) => sum + r.amountJpy, 0);

  // 紐づき済み口座の残高合計（重複して同じ口座が使われても 1 回だけカウント）
  const linkedAssetIds = new Set(Object.values(localMapping));
  const totalBalance = Array.from(linkedAssetIds).reduce(
    (sum, id) => sum + (accountBalanceMap.get(id) ?? 0),
    0
  );

  const diff = totalBalance - totalWithdrawal;
  const diffPositive = diff >= 0;

  // ── ローディング ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          color: "#94a3b8",
        }}
      >
        読み込み中...
      </div>
    );
  }

  // ── レンダリング ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* ヘッダー */}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        💳 クレジットカード引き落とし管理
      </h1>

      {/* フィードバックメッセージ */}
      {saveMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: saveMessage.ok ? "#14532d" : "#450a0a",
            border: `1px solid ${saveMessage.ok ? "#4ade80" : "#f87171"}`,
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: saveMessage.ok ? "#4ade80" : "#f87171",
          }}
        >
          {saveMessage.text}
        </div>
      )}

      {/* 引き落とし一覧テーブル */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>引き落とし一覧</h2>

        {rows.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
            引き落とし予定はありません。
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
              aria-label="クレジットカード引き落とし一覧"
            >
              <thead>
                <tr>
                  <th style={thStyle}>カード名</th>
                  <th style={thStyle}>引き落とし日</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>金額</th>
                  <th style={thStyle}>紐づけ口座</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>現在残高</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const selectedId = localMapping[row.cardName] ?? null;
                  const balance =
                    selectedId != null ? (accountBalanceMap.get(selectedId) ?? null) : null;

                  return (
                    <tr key={`${row.cardName}-${idx}`}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{row.cardName}</td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>{row.withdrawalDate}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                        {formatJpy(row.amountJpy)}
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={selectedId ?? ""}
                          onChange={(e) => handleMappingChange(row.cardName, e.target.value)}
                          style={selectStyle}
                          aria-label={`${row.cardName} の紐づけ口座`}
                        >
                          <option value="">口座を選択</option>
                          {accounts.map((acc) => (
                            <option key={acc.assetId} value={acc.assetId}>
                              {acc.name}（{formatJpy(acc.balanceJpy)}）
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: balance != null ? "#e2e8f0" : "#475569",
                        }}
                      >
                        {balance != null ? formatJpy(balance) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* フッターサマリー */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>サマリー</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {/* 合計引き落とし */}
          <div
            style={{ background: "#0f172a", borderRadius: 10, padding: "14px 18px" }}
          >
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
              合計引き落とし
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
              {formatJpy(totalWithdrawal)}
            </div>
          </div>

          {/* 口座残高合計 */}
          <div
            style={{ background: "#0f172a", borderRadius: 10, padding: "14px 18px" }}
          >
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
              口座残高合計
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
              {formatJpy(totalBalance)}
            </div>
          </div>

          {/* 差分 */}
          <div
            style={{
              background: diffPositive ? "#14532d" : "#450a0a",
              borderRadius: 10,
              padding: "14px 18px",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: diffPositive ? "#86efac" : "#fca5a5",
                marginBottom: 6,
              }}
            >
              差分（{diffPositive ? "余裕" : "不足"}）
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "monospace",
                color: diffPositive ? "#4ade80" : "#f87171",
              }}
            >
              {diffPositive ? "+" : "−"}
              {formatJpy(Math.abs(diff))}
            </div>
          </div>
        </div>
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        aria-busy={isSaving}
        style={{
          background: isSaving ? "#334155" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 28px",
          fontSize: 14,
          fontWeight: 600,
          cursor: isSaving ? "not-allowed" : "pointer",
          opacity: isSaving ? 0.7 : 1,
          transition: "background 0.15s",
        }}
      >
        {isSaving ? "保存中..." : "口座設定を保存"}
      </button>
    </div>
  );
}
