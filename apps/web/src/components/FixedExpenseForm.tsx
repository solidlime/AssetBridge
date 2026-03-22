"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

// ── Props ──────────────────────────────────────────────────────────────────

interface FixedExpenseFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  assets: Array<{
    id: number;
    name: string;
    institutionName: string | null;
    balanceJpy: number;
  }>;
}

// ── ユーティリティ ───────────────────────────────────────────────────────────

function formatJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

// ── コンポーネント ───────────────────────────────────────────────────────────

export default function FixedExpenseForm({ onSuccess, onCancel, assets }: FixedExpenseFormProps) {
  const [name, setName] = useState("");
  const [amountJpy, setAmountJpy] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "annual" | "quarterly">("monthly");
  const [withdrawalDay, setWithdrawalDay] = useState("");
  const [withdrawalMonth, setWithdrawalMonth] = useState("");
  const [category, setCategory] = useState("");
  const [assetId, setAssetId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      trpc.incomeExpense.addFixedExpense.mutate({
        name: name.trim(),
        amountJpy: Number(amountJpy),
        frequency,
        ...(withdrawalDay ? { withdrawalDay: Number(withdrawalDay) } : {}),
        ...(withdrawalMonth ? { withdrawalMonth: Number(withdrawalMonth) } : {}),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(assetId ? { assetId: Number(assetId) } : {}),
        bankAccount: assetId ? String(assetId) : null,
      }),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err) => {
      setValidationError(
        err instanceof Error ? err.message : "保存に失敗しました"
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError("名称は必須です");
      return;
    }
    const amount = Number(amountJpy);
    if (!amountJpy || isNaN(amount) || amount <= 0) {
      setValidationError("金額は1以上の整数を入力してください");
      return;
    }
    if (withdrawalDay) {
      const day = Number(withdrawalDay);
      if (isNaN(day) || day < 1 || day > 31) {
        setValidationError("引き落とし日は1〜31の範囲で入力してください");
        return;
      }
    }
    if (withdrawalMonth) {
      const month = Number(withdrawalMonth);
      if (isNaN(month) || month < 1 || month > 12) {
        setValidationError("引き落とし月は1〜12の範囲で入力してください");
        return;
      }
    }

    mutation.mutate();
  };

  // ── スタイル定数 ─────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: "#0f172a",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 4,
    fontWeight: 600,
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: 16,
  };

  const showMonthField = frequency === "annual" || frequency === "quarterly";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* エラーメッセージ */}
      {(validationError || mutation.error) && (
        <div
          role="alert"
          style={{
            background: "#450a0a",
            border: "1px solid #f87171",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: "#f87171",
          }}
        >
          {validationError ?? (mutation.error instanceof Error ? mutation.error.message : "保存に失敗しました")}
        </div>
      )}

      {/* 名称 */}
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="fe-name">
          名称 <span style={{ color: "#f87171" }}>*</span>
        </label>
        <input
          id="fe-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：家賃、電気代、スマホ代"
          style={inputStyle}
          required
          autoFocus
        />
      </div>

      {/* 金額 */}
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="fe-amount">
          金額（円）<span style={{ color: "#f87171" }}>*</span>
        </label>
        <input
          id="fe-amount"
          type="number"
          value={amountJpy}
          onChange={(e) => setAmountJpy(e.target.value)}
          placeholder="例：80000"
          min={1}
          step={1}
          style={inputStyle}
          required
        />
      </div>

      {/* 頻度 */}
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="fe-frequency">
          頻度 <span style={{ color: "#f87171" }}>*</span>
        </label>
        <select
          id="fe-frequency"
          value={frequency}
          onChange={(e) => {
            setFrequency(e.target.value as "monthly" | "annual" | "quarterly");
            // 月次に変更した場合、引き落とし月をリセット
            if (e.target.value === "monthly") setWithdrawalMonth("");
          }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="monthly">毎月</option>
          <option value="quarterly">四半期（年4回）</option>
          <option value="annual">年1回</option>
        </select>
      </div>

      {/* 引き落とし日 */}
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="fe-withdrawal-day">
          引き落とし日（1〜31）
        </label>
        <input
          id="fe-withdrawal-day"
          type="number"
          value={withdrawalDay}
          onChange={(e) => setWithdrawalDay(e.target.value)}
          placeholder="例：27"
          min={1}
          max={31}
          style={inputStyle}
        />
      </div>

      {/* 引き落とし月（annual / quarterly のみ表示） */}
      {showMonthField && (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="fe-withdrawal-month">
            引き落とし月（1〜12）
            {frequency === "quarterly" && (
              <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 4 }}>
                （最初の月）
              </span>
            )}
          </label>
          <input
            id="fe-withdrawal-month"
            type="number"
            value={withdrawalMonth}
            onChange={(e) => setWithdrawalMonth(e.target.value)}
            placeholder={frequency === "annual" ? "例：3（3月）" : "例：1（1, 4, 7, 10月）"}
            min={1}
            max={12}
            style={inputStyle}
          />
        </div>
      )}

      {/* カテゴリ */}
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="fe-category">
          カテゴリ
        </label>
        <input
          id="fe-category"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="例：住居、光熱費、通信、サブスク"
          style={inputStyle}
        />
      </div>

      {/* 紐づけ口座 */}
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="fe-asset">
          紐づけ口座
        </label>
        <select
          id="fe-asset"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">口座を選択（任意）</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.institutionName
                ? `${asset.institutionName} - ${asset.name}`
                : asset.name}（{formatJpy(asset.balanceJpy)}）
            </option>
          ))}
        </select>
      </div>

      {/* ボタン */}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "flex-end",
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid #334155",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 14,
            cursor: "pointer",
            transition: "border-color 0.15s",
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          aria-busy={mutation.isPending}
          style={{
            background: mutation.isPending ? "#334155" : "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: mutation.isPending ? "not-allowed" : "pointer",
            opacity: mutation.isPending ? 0.7 : 1,
            transition: "background 0.15s",
          }}
        >
          {mutation.isPending ? "保存中..." : "追加する"}
        </button>
      </div>
    </form>
  );
}
