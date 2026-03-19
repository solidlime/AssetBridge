import { describe, it, expect } from "bun:test";
import { parseCardAmount, parseCardBlock } from "../scrapers/browser-scraper.mjs";

describe("parseCardAmount", () => {
  it("通常の負の金額を正の数値で返す", () => {
    expect(parseCardAmount("-23,879円")).toBe(23879);
  });
  it("カンマなし金額を返す", () => {
    expect(parseCardAmount("-10885円")).toBe(10885);
  });
  it("確定金額（マイナス記号なし）を返す", () => {
    expect(parseCardAmount("23,879")).toBe(23879);
  });
  it("nullを返す（空文字）", () => {
    expect(parseCardAmount("")).toBeNull();
  });
  it("nullを返す（数字なし）", () => {
    expect(parseCardAmount("未確定")).toBeNull();
  });
  it("nullを返す（null入力）", () => {
    expect(parseCardAmount(null)).toBeNull();
  });
});

describe("parseCardBlock", () => {
  it("三井住友カードの確定金額と引き落とし日を返す", () => {
    const block = `三井住友カード (VpassID)金融機関サービスサイトへ
取得日時(03/19 18:44)
-23,879円
引き落とし日:(2026/03/26)
利用残高:-60,366円
ポイント:202円
sol******`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.amountJpy).toBe(23879);
    expect(result.withdrawalDate).toBe("2026-03-26");
    expect(result.cardName).toContain("三井住友");
  });

  it("PayPayカード（引き落とし未確定）は利用残高を返す", () => {
    const block = `PayPayカード金融機関サービスサイトへ
取得日時(03/19 18:43)
引き落とし額未確定
利用残高:-10,885円
080********`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.amountJpy).toBe(10885);
    expect(result.withdrawalDate).toBeNull();
  });

  it("空文字はnullを返す", () => {
    expect(parseCardBlock("")).toBeNull();
  });
});
