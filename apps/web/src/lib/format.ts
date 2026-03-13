/** 円金額を "¥1,234,567" 形式にフォーマットする（小数点以下切り捨て）。 */
export function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

/** パーセントを "+1.23%" 形式にフォーマットする。 */
export function formatPct(value: number, digits = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** 前日比を色付きで表示するための色を返す。 */
export function diffColor(value: number): string {
  return value >= 0 ? "#4ade80" : "#f87171";
}
