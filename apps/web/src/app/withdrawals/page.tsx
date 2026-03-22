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

// インライン編集セルの識別子
type EditingCell = { id: number; field: string } | null;

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

// JST（Asia/Tokyo）で「今日から target 日まで何日か」を計算
function daysUntilJst(dateStr: string): number {
  const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const todayJst = new Date(nowJst.getFullYear(), nowJst.getMonth(), nowJst.getDate());
  const target = new Date(dateStr);
  const diffMs = target.getTime() - todayJst.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// 月/日 形式にフォーマット（例: "3/26"）
function formatMonthDay(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 編集用インプットの共通スタイル
const editInputStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #3b82f6",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 13,
  width: "100%",
  outline: "none",
};

// ── ページコンポーネント ─────────────────────────────────────────────────────

export default function WithdrawalsPage() {
  const queryClient = useQueryClient();
  const summaryMonth = new Date().toISOString().slice(0, 7);

  // localMapping: null = アカウントマッピングデータをそのまま使用、非null = ユーザーが編集中
  const [localMapping, setLocalMapping] = useState<Record<string, number> | null>(null);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [mapSaveMessage, setMapSaveMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showFixedExpenseForm, setShowFixedExpenseForm] = useState(false);

  // インライン編集ステート
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>("");

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

  const updateFixedMutation = useMutation({
    mutationFn: (input: {
      id: number;
      name?: string;
      amountJpy?: number;
      frequency?: "monthly" | "annual" | "quarterly";
      withdrawalDay?: number | null;
      category?: string | null;
      assetId?: number | null;
    }) => trpc.incomeExpense.updateFixedExpense.mutate(input),
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

  // 口座ベースの残高不足警告（shortfallJpy < 0 の口座を引き落とし日近い順に表示）
  const accountWarnings = useMemo(() => {
    if (!accountSummaryData) return [];
    return (accountSummaryData as AccountWithdrawalSummary[])
      .filter((a) => a.shortfallJpy < 0 && a.nextWithdrawalDate != null)
      .map((a) => {
        const days = daysUntilJst(a.nextWithdrawalDate!);
        const shortage = Math.abs(a.shortfallJpy);
        const dateStr = new Date(a.nextWithdrawalDate!).toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
          timeZone: "Asia/Tokyo",
        });
        const level = days <= 3 ? "urgent" : "danger";
        return {
          accountId: a.accountId,
          accountName: a.accountName,
          institutionName: a.institutionName,
          shortage,
          days,
          dateStr,
          level,
          nextWithdrawalDate: a.nextWithdrawalDate,
        };
      })
      .filter((a) => a.days >= 0) // 過去の引き落としは除外
      .sort((a, b) => a.days - b.days);
  }, [accountSummaryData]);

  // クレカ引き落とし合計
  const ccMonthlyTotal = useMemo(
    () => withdrawalRows.reduce((sum, r) => sum + r.amountJpy, 0),
    [withdrawalRows]
  );

  // ── インライン編集ハンドラー ─────────────────────────────────────────────

  const handleCellDoubleClick = (id: number, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const handleCellSave = () => {
    if (!editingCell) return;
    const { id, field } = editingCell;

    const payload: {
      id: number;
      name?: string;
      amountJpy?: number;
      frequency?: "monthly" | "annual" | "quarterly";
      withdrawalDay?: number | null;
      category?: string | null;
    } = { id };

    if (field === "name") {
      payload.name = editValue;
    } else if (field === "amount_jpy") {
      const n = Number(editValue.replace(/[^0-9]/g, ""));
      if (!isNaN(n) && n > 0) payload.amountJpy = n;
    } else if (field === "frequency") {
      payload.frequency = editValue as "monthly" | "annual" | "quarterly";
    } else if (field === "withdrawal_day") {
      payload.withdrawalDay = editValue ? Number(editValue) : null;
    } else if (field === "category") {
      payload.category = editValue || null;
    }

    updateFixedMutation.mutate(payload);
    setEditingCell(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCellSave();
    else if (e.key === "Escape") setEditingCell(null);
  };

  const handleFixedAccountChange = (id: number, value: string) => {
    const assetId = value ? Number(value) : null;
    updateFixedMutation.mutate({ id, assetId });
  };

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
      {/* ─── 1. 警告バナー（口座ベース・残高不足のみ） ──────────────────────── */}
      {accountWarnings.length > 0 && (
        <div
          style={{
            background: "#1a0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 8 }}>
            ⚠️ 残高不足の口座（{accountWarnings.length}件）
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {accountWarnings.map((w) => (
              <li
                key={w.accountId}
                style={{ color: w.level === "urgent" ? "#f87171" : "#fca5a5", fontSize: 14 }}
              >
                {w.level === "urgent" ? "🚨" : "🔴"}{" "}
                <strong>
                  {w.accountName}
                  {w.institutionName ? `（${w.institutionName}）` : ""}
                </strong>{" "}
                ¥{w.shortage.toLocaleString()} 不足 — 引き落とし日: {w.dateStr}
                （{w.days === 0 ? "本日！" : `${w.days}日後`}）
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ヘッダー */}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🏦 引き落とし管理</h1>

      {/* ─── 2. 今月の支出サマリーカード（横並び3枚） ──────────────────────── */}
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

      {/* ─── 3. 口座別引き落とし合計サマリー ────────────────────────────────── */}
      {accountSummaryData && accountSummaryData.length > 0 && (
        <div id="account-summary" style={{ ...cardStyle, marginBottom: 24 }}>
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

      {/* ─── 4. クレジットカードセクション ──────────────────────────────────── */}
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

        {withdrawalRows.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
            引き落とし予定はありません。
          </p>
        ) : (
          <>
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
                  </tr>
                </thead>
                <tbody>
                  {withdrawalRows.map((row, idx) => {
                    const detail = cardDetailsMap.get(row.cardName);
                    const selectedId = effectiveMapping[row.cardName] ?? null;

                    return (
                      <tr key={`${row.cardName}-${idx}`}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{row.cardName}</td>
                        <td style={{ ...tdStyle, color: "#cbd5e1" }}>{detail?.cardType ?? "—"}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", color: "#cbd5e1" }}>
                          {detail?.cardNumberLast4 ? `**** ${detail.cardNumberLast4}` : "—"}
                        </td>
                        <td style={{ ...tdStyle, color: "#cbd5e1" }}>
                          {row.withdrawalDate}
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* 月次引き落とし合計行 */}
            <div
              style={{
                marginTop: 12,
                textAlign: "right",
                fontSize: 14,
                color: "#94a3b8",
                borderTop: "1px solid #334155",
                paddingTop: 12,
              }}
            >
              今月の引き落とし合計：
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: "#f87171",
                  marginLeft: 8,
                  fontSize: 16,
                }}
              >
                {formatJpy(ccMonthlyTotal)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ─── 5. 固定費セクション ─────────────────────────────────────────────── */}
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
          <>
            <div style={{ overflowX: "auto" }}>
              <p style={{ fontSize: 12, color: "#475569", marginBottom: 8, marginTop: 0 }}>
                💡 各セルをダブルクリックで編集できます
              </p>
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
                    const isEditing = (field: string) =>
                      editingCell?.id === fe.id && editingCell?.field === field;

                    return (
                      <tr key={fe.id}>
                        {/* 名称 */}
                        <td
                          style={{ ...tdStyle, fontWeight: 500, cursor: "default" }}
                          onDoubleClick={() => handleCellDoubleClick(fe.id, "name", fe.name)}
                          title="ダブルクリックで編集"
                        >
                          {isEditing("name") ? (
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={handleCellKeyDown}
                              style={editInputStyle}
                            />
                          ) : (
                            fe.name
                          )}
                        </td>

                        {/* 金額 */}
                        <td
                          style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", cursor: "default" }}
                          onDoubleClick={() => handleCellDoubleClick(fe.id, "amount_jpy", String(fe.amountJpy))}
                          title="ダブルクリックで編集"
                        >
                          {isEditing("amount_jpy") ? (
                            <input
                              autoFocus
                              type="number"
                              min={1}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={handleCellKeyDown}
                              style={{ ...editInputStyle, textAlign: "right" }}
                            />
                          ) : (
                            formatJpy(fe.amountJpy)
                          )}
                        </td>

                        {/* 頻度 */}
                        <td
                          style={{ ...tdStyle, color: "#cbd5e1", cursor: "default" }}
                          onDoubleClick={() => handleCellDoubleClick(fe.id, "frequency", fe.frequency)}
                          title="ダブルクリックで編集"
                        >
                          {isEditing("frequency") ? (
                            <select
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={handleCellKeyDown}
                              style={editInputStyle}
                            >
                              <option value="monthly">毎月</option>
                              <option value="quarterly">四半期</option>
                              <option value="annual">年1回</option>
                            </select>
                          ) : (
                            formatFrequency(fe.frequency)
                          )}
                        </td>

                        {/* 引き落とし日 */}
                        <td
                          style={{ ...tdStyle, color: "#cbd5e1", cursor: "default" }}
                          onDoubleClick={() =>
                            handleCellDoubleClick(fe.id, "withdrawal_day", fe.withdrawalDay != null ? String(fe.withdrawalDay) : "")
                          }
                          title="ダブルクリックで編集"
                        >
                          {isEditing("withdrawal_day") ? (
                            <input
                              autoFocus
                              type="number"
                              min={1}
                              max={31}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={handleCellKeyDown}
                              style={{ ...editInputStyle, width: 60 }}
                            />
                          ) : fe.withdrawalDay != null ? (
                            fe.withdrawalMonth != null
                              ? `${fe.withdrawalMonth}月${fe.withdrawalDay}日`
                              : `毎月${fe.withdrawalDay}日`
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* カテゴリ */}
                        <td
                          style={{ ...tdStyle, color: "#cbd5e1", cursor: "default" }}
                          onDoubleClick={() => handleCellDoubleClick(fe.id, "category", fe.category ?? "")}
                          title="ダブルクリックで編集"
                        >
                          {isEditing("category") ? (
                            <select
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={handleCellKeyDown}
                              style={editInputStyle}
                            >
                              <option value="">—</option>
                              <option value="fixed">fixed</option>
                              <option value="subscription">subscription</option>
                              <option value="insurance">insurance</option>
                              <option value="other">other</option>
                            </select>
                          ) : (
                            fe.category ?? "—"
                          )}
                        </td>

                        {/* 紐づけ口座（ドロップダウン・変更即時保存） */}
                        <td style={tdStyle}>
                          <select
                            value={fe.assetId ?? ""}
                            onChange={(e) => handleFixedAccountChange(fe.id, e.target.value)}
                            style={{ ...selectStyle, minWidth: 160 }}
                            aria-label={`${fe.name} の紐づけ口座`}
                            disabled={updateFixedMutation.isPending}
                          >
                            <option value="">口座を選択</option>
                            {accounts.map((acc) => (
                              <option key={acc.assetId} value={acc.assetId}>
                                {acc.institutionName
                                  ? `${acc.institutionName} - ${acc.name}`
                                  : acc.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 操作 */}
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

            {/* 月次換算合計 */}
            {summary && summary.fixedExpenseTotal > 0 && (
              <div
                style={{
                  marginTop: 12,
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
          </>
        )}
      </div>

      {/* ─── 6. 口座設定保存ボタン（ページ最下部） ──────────────────────────── */}
      <div style={{ marginTop: 24, textAlign: "right" }}>
        <button
          onClick={handleSaveMapping}
          disabled={isSavingMapping}
          style={{
            background: isSavingMapping ? "#374151" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "10px 24px",
            fontSize: 14,
            cursor: isSavingMapping ? "default" : "pointer",
          }}
        >
          {isSavingMapping ? "保存中..." : "💾 口座設定を保存"}
        </button>
        {mapSaveMessage && (
          <span
            style={{
              marginLeft: 12,
              color: mapSaveMessage.ok ? "#4ade80" : "#f87171",
              fontSize: 13,
            }}
          >
            {mapSaveMessage.text}
          </span>
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
