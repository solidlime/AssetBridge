"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import FixedExpenseForm from "@/components/FixedExpenseForm";

// ── 型定義 ──────────────────────────────────────────────────────────────────

interface WithdrawalSummaryRow {
  cardName: string;
  withdrawalDate: string;
  amountJpy: number;
}

interface CreditCardDetail {
  cardName: string;
  cardType: string | null;
  cardNumberLast4: string | null;
  totalDebtJpy: number;
  scheduledAmountJpy: number;
  scrapedAt: string;
}

interface FixedExpense {
  id: number;
  name: string;
  amountJpy: number;
  frequency: "monthly" | "annual" | "quarterly";
  withdrawalDay: number | null;
  withdrawalMonth: number | null;
  category: string | null;
  assetId: number | null;
}

interface Account {
  assetId: number;
  name: string;
  institutionName: string | null;
  balanceJpy: number;
}

interface MonthlyWithdrawalSummary {
  month: string;
  fixedExpenseTotal: number;
  creditCardTotal: number;
  grandTotal: number;
  linkedAssetIds: number[];
}

interface AccountWithdrawalSummary {
  accountId: number;
  accountName: string;
  institutionName: string | null;
  balanceJpy: number;
  creditCardTotalJpy: number;
  fixedExpenseTotalJpy: number;
  totalWithdrawalJpy: number;
  shortfallJpy: number;
  nextWithdrawalDate: string | null;
}

// ── スタイル定数（既存パターンに合わせる） ────────────────────────────────

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

function formatFrequency(freq: string): string {
  if (freq === "monthly") return "毎月";
  if (freq === "annual") return "年1回";
  if (freq === "quarterly") return "四半期";
  return freq;
}

type WarningLevel = "urgent" | "danger" | "caution";

interface WarningInfo {
  cardName: string;
  level: WarningLevel;
  message: string;
  shortfallJpy: number;
  daysUntil: number;
}

// JST（Asia/Tokyo）で「今日から target 日まで何日か」を計算
function daysUntilJst(dateStr: string): number {
  const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const todayJst = new Date(nowJst.getFullYear(), nowJst.getMonth(), nowJst.getDate());
  const target = new Date(dateStr);
  const diffMs = target.getTime() - todayJst.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ── ページコンポーネント ─────────────────────────────────────────────────────

export default function WithdrawalsPage() {
  const queryClient = useQueryClient();
  const summaryMonth = new Date().toISOString().slice(0, 7);

  // localMapping: null = アカウントマッピングデータをそのまま使用、非null = ユーザーが編集中
  const [localMapping, setLocalMapping] = useState<Record<string, number> | null>(null);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [mapSaveMessage, setMapSaveMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showFixedExpenseForm, setShowFixedExpenseForm] = useState(false);

  // ── クエリ ──────────────────────────────────────────────────────────────

  const { data: balanceStatus, isLoading: loadingWithdrawals } = useQuery({
    queryKey: ["getCcBalanceStatus"],
    queryFn: () => trpc.incomeExpense.getCcBalanceStatus.query(),
  });

  const { data: accountMapping, isLoading: loadingMapping } = useQuery({
    queryKey: ["getCcAccountMapping"],
    queryFn: () => trpc.incomeExpense.getCcAccountMapping.query(),
  });

  const { data: creditCardDetails } = useQuery({
    queryKey: ["getCreditCardDetails"],
    queryFn: () => trpc.incomeExpense.getCreditCardDetails.query(),
  });

  const { data: fixedExpenses, isLoading: loadingFixed } = useQuery({
    queryKey: ["getFixedExpenses"],
    queryFn: () => trpc.incomeExpense.getFixedExpenses.query(),
  });

  const { data: summary } = useQuery({
    queryKey: ["getMonthlyWithdrawalSummary", summaryMonth],
    queryFn: () => trpc.incomeExpense.getMonthlyWithdrawalSummary.query({ month: summaryMonth }),
  });

  const { data: accountSummaryData } = useQuery({
    queryKey: ["getWithdrawalAccountSummary"],
    queryFn: () => trpc.incomeExpense.getWithdrawalAccountSummary.query(),
  });

  // accountMapping が最初にロードされたとき localMapping を初期化
  useEffect(() => {
    if (accountMapping && localMapping === null) {
      setLocalMapping(accountMapping.mapping);
    }
    // accountMapping が変わっても、ユーザーが編集中（localMapping !== null）なら上書きしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountMapping]);

  // ── ミューテーション ────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: number) => trpc.incomeExpense.deleteFixedExpense.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getFixedExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["getMonthlyWithdrawalSummary"] });
      queryClient.invalidateQueries({ queryKey: ["getWithdrawalAccountSummary"] });
    },
  });

  // ── 派生値 ──────────────────────────────────────────────────────────────

  const withdrawalRows: WithdrawalSummaryRow[] = balanceStatus?.summary ?? [];
  const accounts: Account[] = accountMapping?.accounts ?? [];
  const effectiveMapping = localMapping ?? accountMapping?.mapping ?? {};

  const accountBalanceMap = new Map<number, number>(
    accounts.map((a) => [a.assetId, a.balanceJpy])
  );

  const cardDetailsMap = new Map<string, CreditCardDetail>(
    (creditCardDetails as CreditCardDetail[] | undefined ?? []).map((d) => [d.cardName, d])
  );

  // FixedExpenseForm 用アセットリスト（口座のみ）
  const formAssets = accounts.map((a) => ({
    id: a.assetId,
    name: a.name,
    institutionName: a.institutionName,
    balanceJpy: a.balanceJpy,
  }));

  // 残高警告リスト（引き落とし日が近いもの・残高不足のもの）
  const warnings = useMemo<WarningInfo[]>(() => {
    if (!balanceStatus?.summary) return [];
    const result: WarningInfo[] = [];
    for (const item of balanceStatus.summary) {
      const days = daysUntilJst(item.withdrawalDate);
      if (days < 0) continue; // 過去の引き落としは無視

      // 口座未紐づけは警告対象外（残高比較できない）
      if (item.accountAssetId === null) continue;

      const shortage = item.isInsufficient ? -item.shortfallJpy : 0;

      if (days <= 3 && item.isInsufficient) {
        result.push({
          cardName: item.cardName,
          level: "urgent",
          message: `🚨 緊急！残高不足 ${formatJpy(shortage)} 不足`,
          shortfallJpy: item.shortfallJpy,
          daysUntil: days,
        });
      } else if (days <= 7 && item.isInsufficient) {
        result.push({
          cardName: item.cardName,
          level: "danger",
          message: `🔴 残高不足！ ${formatJpy(shortage)} 不足`,
          shortfallJpy: item.shortfallJpy,
          daysUntil: days,
        });
      } else if (days <= 3 && !item.isInsufficient) {
        result.push({
          cardName: item.cardName,
          level: "caution",
          message: "⚠️ まもなく引き落とし（残高OK）",
          shortfallJpy: item.shortfallJpy,
          daysUntil: days,
        });
      }
    }
    return result;
  }, [balanceStatus]);

  // ── ハンドラー ──────────────────────────────────────────────────────────

  const handleMappingChange = (cardName: string, value: string) => {
    const base = localMapping ?? accountMapping?.mapping ?? {};
    const next = { ...base };
    if (value === "") {
      delete next[cardName];
    } else {
      next[cardName] = Number(value);
    }
    setLocalMapping(next);
  };

  const handleSaveMapping = async () => {
    setIsSavingMapping(true);
    setMapSaveMessage(null);
    try {
      await trpc.incomeExpense.setCcAccountMapping.mutate(effectiveMapping);
      setMapSaveMessage({ text: "✅ 口座設定を保存しました", ok: true });
    } catch (err) {
      setMapSaveMessage({
        text: `❌ 保存に失敗しました: ${err instanceof Error ? err.message : "Unknown error"}`,
        ok: false,
      });
    } finally {
      setIsSavingMapping(false);
      setTimeout(() => setMapSaveMessage(null), 5000);
    }
  };

  const handleDeleteFixedExpense = (id: number, name: string) => {
    if (window.confirm(`「${name}」を削除しますか？`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleFixedExpenseSuccess = () => {
    setShowFixedExpenseForm(false);
    queryClient.invalidateQueries({ queryKey: ["getFixedExpenses"] });
    queryClient.invalidateQueries({ queryKey: ["getMonthlyWithdrawalSummary"] });
    queryClient.invalidateQueries({ queryKey: ["getWithdrawalAccountSummary"] });
  };

  // ── ローディング ─────────────────────────────────────────────────────────

  const isLoading = loadingWithdrawals || loadingMapping;

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
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
      {warnings.length > 0 && (
        <div
          style={{
            background: warnings.some((w) => w.level === "urgent" || w.level === "danger")
              ? "#450a0a"
              : "#422006",
            border: `1px solid ${warnings.some((w) => w.level === "urgent" || w.level === "danger") ? "#f87171" : "#fb923c"}`,
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 24,
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 8 }}>
            ⚠️ 引き落とし警告（{warnings.length}件）
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, listStyle: "none" }}>
            {warnings.map((w) => (
              <li
                key={w.cardName}
                style={{
                  marginBottom: 4,
                  color: w.level === "caution" ? "#fde68a" : "#fca5a5",
                }}
              >
                <strong>{w.cardName}</strong>：{w.message}
                {w.daysUntil === 0 ? "（本日！）" : `（${w.daysUntil}日後）`}
              </li>
            ))}
          </ul>
          <a
            href="#cc-section"
            style={{ fontSize: 12, color: "#93c5fd", textDecoration: "underline", marginTop: 8, display: "inline-block" }}
          >
            詳細を見る ↓
          </a>
        </div>
      )}
      {/* ヘッダー */}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🏦 引き落とし管理</h1>

      {/* ─── 💰 口座別引き落とし合計サマリー ───────────────────────────────── */}
      {accountSummaryData && accountSummaryData.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>
            💰 口座別引き落とし総額サマリー
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={thStyle}>口座名</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>残高</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>クレカ合計</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>固定費合計</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>引き落とし総額</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>差額</th>
                  <th style={thStyle}>次回引き落とし日</th>
                </tr>
              </thead>
              <tbody>
                {(accountSummaryData as AccountWithdrawalSummary[]).map((item) => {
                  const isShortfall = item.shortfallJpy < 0;
                  const daysToNext = item.nextWithdrawalDate ? daysUntilJst(item.nextWithdrawalDate) : null;
                  const isUrgent = daysToNext !== null && daysToNext <= 7;
                  return (
                    <tr
                      key={item.accountId}
                      style={{
                        background: isShortfall ? "rgba(239,68,68,0.08)" : "transparent",
                      }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {item.institutionName
                          ? `${item.institutionName} - ${item.accountName}`
                          : item.accountName}
                        {isShortfall && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 11,
                            padding: "2px 6px",
                            background: "#450a0a",
                            color: "#f87171",
                            border: "1px solid #f87171",
                            borderRadius: 4,
                          }}>残高不足</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                        {formatJpy(item.balanceJpy)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#f87171" }}>
                        {item.creditCardTotalJpy > 0 ? formatJpy(item.creditCardTotalJpy) : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#fbbf24" }}>
                        {item.fixedExpenseTotalJpy > 0 ? formatJpy(item.fixedExpenseTotalJpy) : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                        {formatJpy(item.totalWithdrawalJpy)}
                      </td>
                      <td style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: isShortfall ? "#f87171" : "#4ade80",
                      }}>
                        {isShortfall
                          ? `-${formatJpy(Math.abs(item.shortfallJpy))}`
                          : `+${formatJpy(item.shortfallJpy)}`}
                      </td>
                      <td style={{ ...tdStyle }}>
                        {item.nextWithdrawalDate ? (
                          <span style={{ color: isUrgent ? "#fbbf24" : "#cbd5e1" }}>
                            {item.nextWithdrawalDate}
                            {isUrgent && (
                              <span style={{
                                marginLeft: 6,
                                fontSize: 11,
                                padding: "1px 5px",
                                background: "#422006",
                                color: "#fde68a",
                                border: "1px solid #fb923c",
                                borderRadius: 4,
                              }}>
                                {daysToNext === 0 ? "今日" : `${daysToNext}日後`}
                              </span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 月次支出サマリーカード（横並び3枚） */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>💳 クレカ引き落とし合計</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: "#f87171" }}>
            {formatJpy(summary?.creditCardTotal ?? 0)}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>当月予定</div>
        </div>

        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>🏠 固定費合計（月次換算）</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: "#fbbf24" }}>
            {formatJpy(summary?.fixedExpenseTotal ?? 0)}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{summaryMonth}</div>
        </div>

        <div
          style={{
            background: "#1e293b",
            borderRadius: 12,
            padding: 20,
            borderLeft: "3px solid #3b82f6",
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>📊 総支出予定</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: "#e2e8f0" }}>
            {formatJpy(summary?.grandTotal ?? 0)}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>クレカ + 固定費</div>
        </div>
      </div>

      {/* ─── 💳 クレジットカードセクション ─────────────────────────────────── */}
      <div id="cc-section" style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>💳 クレジットカード引き落とし</h2>

        {accounts.length === 0 && !loadingMapping && (
          <div style={{
            background: "#1e3a5f",
            border: "1px solid #3b82f6",
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#93c5fd",
          }}>
            ℹ️ 口座情報がありません。スクレイプを実行すると CASH 資産が自動取得され、ドロップダウンに表示されます。
          </div>
        )}

        {mapSaveMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: mapSaveMessage.ok ? "#14532d" : "#450a0a",
              border: `1px solid ${mapSaveMessage.ok ? "#4ade80" : "#f87171"}`,
              borderRadius: 8,
              padding: "10px 16px",
              marginBottom: 16,
              fontSize: 13,
              color: mapSaveMessage.ok ? "#4ade80" : "#f87171",
            }}
          >
            {mapSaveMessage.text}
          </div>
        )}

        {withdrawalRows.length === 0 ? (
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
                  <th style={thStyle}>カード種別</th>
                  <th style={thStyle}>下4桁</th>
                  <th style={thStyle}>引き落とし日</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>引き落とし予定</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>負債総額</th>
                  <th style={thStyle}>紐づけ口座</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>口座残高</th>
                </tr>
              </thead>
              <tbody>
                {withdrawalRows.map((row, idx) => {
                  const detail = cardDetailsMap.get(row.cardName);
                  const selectedId = effectiveMapping[row.cardName] ?? null;
                  const balance =
                    selectedId != null ? (accountBalanceMap.get(selectedId) ?? null) : null;

                  return (
                    <tr key={`${row.cardName}-${idx}`}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{row.cardName}</td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>{detail?.cardType ?? "—"}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#cbd5e1" }}>
                        {detail?.cardNumberLast4 ? `**** ${detail.cardNumberLast4}` : "—"}
                      </td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>
                        {row.withdrawalDate}
                        {(() => {
                          const w = warnings.find((x) => x.cardName === row.cardName);
                          if (!w) return null;
                          const isUrgent = w.level === "urgent";
                          const isDanger = w.level === "danger" || isUrgent;
                          return (
                            <span
                              style={{
                                display: "inline-block",
                                marginLeft: 8,
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: isDanger ? "#450a0a" : "#422006",
                                color: isDanger ? "#fca5a5" : "#fde68a",
                                border: `1px solid ${isDanger ? "#f87171" : "#fb923c"}`,
                                animation: isUrgent ? "blink 1s step-start infinite" : "none",
                              }}
                            >
                              {w.message}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                        {formatJpy(row.amountJpy)}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: detail ? "#f87171" : "#475569",
                        }}
                      >
                        {detail ? formatJpy(detail.totalDebtJpy) : "—"}
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
                              {acc.institutionName
                                ? `${acc.institutionName} - ${acc.name}`
                                : acc.name}（{formatJpy(acc.balanceJpy)}）
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: balance != null
                            ? (balance < row.amountJpy ? "#f87171" : "#4ade80")
                            : "#475569",
                        }}
                      >
                        {balance != null ? (
                          <>
                            {formatJpy(balance)}
                            <br />
                            <span style={{
                              fontSize: 11,
                              color: balance >= row.amountJpy ? "#4ade80" : "#f87171",
                            }}>
                              {balance >= row.amountJpy
                                ? `+${formatJpy(balance - row.amountJpy)}`
                                : `-${formatJpy(row.amountJpy - balance)}`}
                            </span>
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleSaveMapping}
            disabled={isSavingMapping}
            aria-busy={isSavingMapping}
            style={{
              background: isSavingMapping ? "#334155" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: isSavingMapping ? "not-allowed" : "pointer",
              opacity: isSavingMapping ? 0.7 : 1,
              transition: "background 0.15s",
            }}
          >
            {isSavingMapping ? "保存中..." : "口座設定を保存"}
          </button>
        </div>
      </div>

      {/* ─── 🏠 固定費セクション ─────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>🏠 固定費</h2>
          <button
            onClick={() => setShowFixedExpenseForm(true)}
            style={{
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            ＋ 固定費を追加
          </button>
        </div>

        {loadingFixed ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>読み込み中...</p>
        ) : !fixedExpenses || (Array.isArray(fixedExpenses) && fixedExpenses.length === 0) ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            固定費が登録されていません。「固定費を追加」ボタンから登録できます。
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
              aria-label="固定費一覧"
            >
              <thead>
                <tr>
                  <th style={thStyle}>名称</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>金額</th>
                  <th style={thStyle}>頻度</th>
                  <th style={thStyle}>引き落とし日</th>
                  <th style={thStyle}>カテゴリ</th>
                  <th style={thStyle}>紐づけ口座</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {(fixedExpenses as FixedExpense[]).map((fe) => {
                  const linkedAccount = accounts.find((a) => a.assetId === fe.assetId);
                  return (
                    <tr key={fe.id}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{fe.name}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                        {formatJpy(fe.amountJpy)}
                      </td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>
                        {formatFrequency(fe.frequency)}
                      </td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>
                        {fe.withdrawalDay != null
                          ? fe.withdrawalMonth != null
                            ? `${fe.withdrawalMonth}月${fe.withdrawalDay}日`
                            : `毎月${fe.withdrawalDay}日`
                          : "—"}
                      </td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>{fe.category ?? "—"}</td>
                      <td style={{ ...tdStyle, color: "#cbd5e1" }}>
                        {linkedAccount
                          ? linkedAccount.institutionName
                            ? `${linkedAccount.institutionName} - ${linkedAccount.name}`
                            : linkedAccount.name
                          : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button
                          onClick={() => handleDeleteFixedExpense(fe.id, fe.name)}
                          disabled={deleteMutation.isPending}
                          style={{
                            background: "transparent",
                            color: "#f87171",
                            border: "1px solid #f87171",
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 12,
                            cursor: deleteMutation.isPending ? "not-allowed" : "pointer",
                            opacity: deleteMutation.isPending ? 0.5 : 1,
                          }}
                          aria-label={`${fe.name} を削除`}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 月次換算合計 */}
        {summary && summary.fixedExpenseTotal > 0 && (
          <div
            style={{
              marginTop: 16,
              textAlign: "right",
              fontSize: 14,
              color: "#94a3b8",
              borderTop: "1px solid #334155",
              paddingTop: 12,
            }}
          >
            月次換算合計：
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                color: "#fbbf24",
                marginLeft: 8,
              }}
            >
              {formatJpy(summary.fixedExpenseTotal)}
            </span>
          </div>
        )}
      </div>

      {/* 固定費追加フォームモーダル */}
      {showFixedExpenseForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="固定費追加"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFixedExpenseForm(false);
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 500,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>
              固定費を追加
            </h2>
            <FixedExpenseForm
              assets={formAssets}
              onSuccess={handleFixedExpenseSuccess}
              onCancel={() => setShowFixedExpenseForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
