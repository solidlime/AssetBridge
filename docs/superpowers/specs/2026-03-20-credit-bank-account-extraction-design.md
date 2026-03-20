# Credit Card Bank Account Extraction — Design Spec

## Overview
MoneyForward のクレジットカード引き落とし情報スクレイプ時に、引き落とし口座名を抽出して DB に保存する機能追加。

## Background
- DB の `credit_card_withdrawals` テーブルには既に `bank_account TEXT` カラムが存在する（NULL 許可）
- スクレイパー（`browser-scraper.mjs`）の `parseCardBlock()` がテキストブロックを解析するが、現在は `bankAccount` を抽出していない
- `ScrapedCreditWithdrawal` インターフェースにも `bankAccount` フィールドがない

## Changes

### 1. `apps/crawler/src/scrapers/browser-scraper.mjs` — `parseCardBlock()`

2段階 regex でテキストブロックから引き落とし口座名を抽出する。

**Pattern 1（明示ラベル型）：**
```regex
/(?:引き落とし|ご返済).*?(?:口座|銀行)[\s：:]*([^\n※]+)/i
```
- 例: `引き落とし口座：三井住友銀行 渋谷支店` → `三井住友銀行 渋谷支店`
- キャプチャ後に `.trim().slice(0, 100)` を適用する

**Pattern 2（銀行名フォールバック）：**  
Pattern 1 がマッチしない場合のみ適用。
```regex
/((?:新生|SBI|みずほ|三菱|三井住友|りそな|東京|横浜|北陸|住信)[^\n]*(?:銀行|信用|信用組合|労働金庫))/i
```
- 例: `SBI新生銀行` → `SBI新生銀行`
- `.match()` の最初のマッチ（index 0）を使用
- キャプチャ後に `.trim().slice(0, 100)` を適用する

**フォールバックロジック：**
```javascript
let bankAccount = null;
const bankMatch = blockText.match(/(?:引き落とし|ご返済).*?(?:口座|銀行)[\s：:]*([^\n※]+)/i);
if (bankMatch) {
  const candidate = bankMatch[1].trim().slice(0, 100);
  if (candidate) bankAccount = candidate;
}
if (!bankAccount) {
  const bankFallback = blockText.match(/((?:新生|SBI|みずほ|三菱|三井住友|りそな|東京|横浜|北陸|住信)[^\n]*(?:銀行|信用|信用組合|労働金庫))/i);
  if (bankFallback) {
    const candidate = bankFallback[1].trim().slice(0, 100);
    if (candidate) bankAccount = candidate;
  }
}
```

戻り値:
```javascript
return { cardName: cardName.slice(0, 100), withdrawalDate, amountJpy, bankAccount, status: 'scheduled' };
```

### 2. `apps/crawler/src/scrapers/mf_sbi_bank.ts` — `ScrapedCreditWithdrawal` インターフェース

```typescript
export interface ScrapedCreditWithdrawal {
  cardName: string;
  withdrawalDate: string;  // YYYY-MM-DD
  amountJpy: number;
  bankAccount?: string;    // ← NEW（optional）
  status: "scheduled" | "withdrawn";
}
```

### 3. `apps/crawler/src/scrapers/mf_sbi_bank.ts` — DB 保存ロジック

```typescript
db.insert(creditCardWithdrawals)
  .values({
    cardName: w.cardName,
    withdrawalDate: w.withdrawalDate,
    amountJpy: w.amountJpy,
    bankAccount: (w.bankAccount?.trim() || null),  // ← NEW: trim + empty guard
    status: w.status,
    scrapedAt,
  })
  .run();
```

`w.bankAccount?.trim() || null` により、undefined・空文字・空白のみ文字列はすべて `null` として保存される。

## Non-Goals
- DB スキーマ変更（不要）
- マイグレーション（不要）
- 既存レコードの retroactive 更新

## Success Criteria
- スクレイパー実行エラーなし
- DB の `bank_account` カラムに値が格納される（NULL でない件数が増える）
- 既存の全テストが PASS（49 tests）
