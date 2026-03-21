import { describe, it, expect } from "bun:test";
import {
  parseCardAmount,
  parseCardBlock,
  scrapeCardsByAnchor,
  scrapeCardsByDl,
  scrapeCreditCardWithdrawals,
} from "../scrapers/browser-scraper.mjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

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

  it("PayPayカード（確定金額）は引き落とし日直前行の金額を返す", () => {
    const block = `PayPayカード 金融機関サービスサイトへ
取得日時(03/21 05:56)
-7,307円
引き落とし日:(2026/03/27)
利用残高:-10,885円
080********`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.cardName).toBe("PayPayカード");
    expect(result.amountJpy).toBe(7307);
    expect(result.withdrawalDate).toBe("2026-03-27");
  });

  it("楽天カードの確定金額と引き落とし日を返す", () => {
    const block = `楽天カード 金融機関サービスサイトへ
取得日時(03/21 05:56)
-160,476円
引き落とし日:(2026/03/27)
利用残高:-346,884円
sol******`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.cardName).toBe("楽天カード");
    expect(result.amountJpy).toBe(160476);
    expect(result.withdrawalDate).toBe("2026-03-27");
  });

  it("マスクされた口座IDを bankAccount として返す（sol******）", () => {
    const block = `三井住友カード (VpassID) 金融機関サービスサイトへ
取得日時(03/21 05:57)
-23,879円
引き落とし日:(2026/03/26)
利用残高:-60,366円
ポイント:202円
sol******`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.bankAccount).toBe("sol******");
  });

  it("マスクされた口座IDを bankAccount として返す（080****）", () => {
    const block = `PayPayカード 金融機関サービスサイトへ
取得日時(03/21 05:56)
-7,307円
引き落とし日:(2026/03/27)
利用残高:-10,885円
080********`;
    const result = parseCardBlock(block);
    expect(result).not.toBeNull();
    expect(result.bankAccount).toBe("080********");
  });

  it("3枚のカードブロックを個別に解析して3つの異なるカード名・金額を返す", () => {
    const blocks = [
      `PayPayカード 金融機関サービスサイトへ\n取得日時(03/21 05:56)\n-7,307円\n引き落とし日:(2026/03/27)\n利用残高:-10,885円\n080********`,
      `三井住友カード (VpassID) 金融機関サービスサイトへ\n取得日時(03/21 05:57)\n-23,879円\n引き落とし日:(2026/03/26)\n利用残高:-60,366円\nポイント:202円\nsol******`,
      `楽天カード 金融機関サービスサイトへ\n取得日時(03/21 05:56)\n-160,476円\n引き落とし日:(2026/03/27)\n利用残高:-346,884円\nsol******`,
    ];
    const results = blocks.map(b => parseCardBlock(b)).filter(r => r !== null);
    expect(results).toHaveLength(3);
    const names = results.map(r => r.cardName);
    expect(names).toContain("PayPayカード");
    expect(names).toContain("三井住友カード (VpassID)");
    expect(names).toContain("楽天カード");
    expect(results[0].amountJpy).toBe(7307);
    expect(results[1].amountJpy).toBe(23879);
    expect(results[2].amountJpy).toBe(160476);
  });

  it("空文字はnullを返す", () => {
    expect(parseCardBlock("")).toBeNull();
  });
});

describe("scrapeCardsByAnchor", () => {
  it("関数としてエクスポートされていること", () => {
    expect(typeof scrapeCardsByAnchor).toBe("function");
  });

  it("null ページでエラーをキャッチして空配列を返す", async () => {
    // page.goto が TypeError をスローするが、関数内 try/catch で捕捉され [] を返す
    const result = await scrapeCardsByAnchor(null);
    expect(result).toEqual([]);
  });

  it("/bs/portfolio を試みる URL リストに含む（ソースコード確認）", () => {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scrapers/browser-scraper.mjs");
    const source = readFileSync(filePath, "utf8");
    expect(source).toContain("/bs/portfolio");
  });

  it("section を closest() フォールバックとして使っていないこと（ソースコード確認）", () => {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scrapers/browser-scraper.mjs");
    const source = readFileSync(filePath, "utf8");
    // 旧来の .closest('...section') パターンが残っていないこと
    expect(source).not.toContain("a.closest('.account-item-detail-table, .account-item, li, section')");
  });
});

describe("scrapeCardsByDl", () => {
  it("関数としてエクスポートされていること", () => {
    expect(typeof scrapeCardsByDl).toBe("function");
  });

  it("null ページでエラーをキャッチして空配列を返す", async () => {
    // page.goto が TypeError をスローするが、関数内 try/catch で捕捉され [] を返す
    const result = await scrapeCardsByDl(null);
    expect(result).toEqual([]);
  });
});

describe("scrapeCreditCardWithdrawals (オーケストレーター)", () => {
  it("関数としてエクスポートされていること", () => {
    expect(typeof scrapeCreditCardWithdrawals).toBe("function");
  });

  it("null ページでエラーをキャッチして空配列を返す", async () => {
    // scrapeCardsByAnchor が [] を返すと scrapeCardsByDl を呼ぶが、どちらも [] → 空配列
    const result = await scrapeCreditCardWithdrawals(null);
    expect(result).toEqual([]);
  });
});

describe("browser-scraper institutionName wiring", () => {
  it("institutionName は currentInstitution のみを使い、カテゴリ名へフォールバックしない", () => {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scrapers/browser-scraper.mjs");
    const source = readFileSync(filePath, "utf8");
    expect((source.match(/institutionName:\s*currentInstitution\s*\?\?\s*null,/g) ?? []).length).toBe(3);
    expect(source).not.toContain("institutionName: currentInstitution || currentCategory,");
  });

  it("th>a に加えて td:first-child>a も金融機関名として取得する（ソースコード確認）", () => {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scrapers/browser-scraper.mjs");
    const source = readFileSync(filePath, "utf8");
    expect(source).toContain('row.querySelector(\'td:first-child a\')');
  });
});

describe("browser-scraper DOM traversal: テーブル境界検知", () => {
  it("page.evaluate がテーブル単位で走査し tableIndex を返す構造になっている", () => {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scrapers/browser-scraper.mjs");
    const source = readFileSync(filePath, "utf8");
    // querySelectorAll("table tr") での一括走査が削除されていること
    expect(source).not.toContain('querySelectorAll("table tr")');
    // テーブル単位走査に変更されていること
    expect(source).toContain("querySelectorAll('table')");
    // tableIndex が返されること
    expect(source).toContain("tableIndex: tableIdx");
    // sectionHeading が返されること
    expect(source).toContain("sectionHeading");
  });

  it("処理ループでテーブル境界（tableIndex !== lastTableIndex）を検知してリセットする", () => {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scrapers/browser-scraper.mjs");
    const source = readFileSync(filePath, "utf8");
    expect(source).toContain("tableIndex !== lastTableIndex");
    // テーブル変化時に currentInstitution をリセットしていること
    expect(source).toContain('currentInstitution = "";');
    // sectionHeading から CATEGORY_MAP でカテゴリを更新していること
    expect(source).toContain("CATEGORY_MAP[sectionHeading]");
  });
});
