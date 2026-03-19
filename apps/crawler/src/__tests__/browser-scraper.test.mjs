import { describe, it, expect } from "bun:test";
import { parseCardAmount } from "../scrapers/browser-scraper.mjs";

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
