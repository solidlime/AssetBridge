# Credit Card Bank Account Extraction — Design Spec

## Overview
MoneyForward のクレジットカード引き落とし情報スクレイプ時に、引き落とし口座名を抽出して DB に保存する機能追加。

## Background
- DB の `credit_card_withdrawals` テーブルには既に `bank_account TEXT` カラムが存在する（NULL 許可）
- スクレイパー（`browser-scraper.mjs`）の `parseCardBlock()` がテキストブロックを解析するが、現在は `bankAccount` を抽出していない
- `ScrapedCreditWithdrawal` インターフェースにも `bankAccount` フィールドがない

## Changes

### 1. `apps/crawler/src/scrapers/browser-scraper.mjs` - `parseCardBlock()`
2段階 regex で引き落とし口座名を抽出する：

**Pattern 1（明示ラベル型）：**
```
/(?:引き落とし|ご返済).*?(?:口座|銀行)[\s：:]*([^\n※]+)/i
```
例: `引き落とし口座：三井住友銀行 渋谷支店` → `三井住友銀行 渋谷支店`

**Pattern 2（銀行名フォールバック）：**
```
/((?:新生|SBI|みずほ|三菱|三井住友|りそな|東京|横浜|北陸|住信)[^\n]*(?:銀行|信用|信用組合|労働金庫))/i
```
例: `SBI新生銀行` → `SBI新生銀行`

どちらもマッチしなければ `bankAccount = null`。

戻り値に `bankAccount` を追加：
```javascript
return { cardName, withdrawalDate, amountJpy, bankAccount, status: 'scheduled' };
```

### 2. `apps/crawler/src/scrapers/mf_sbi_bank.ts` - インターフェース
`ScrapedCreditWithdrawal` に optional フィールド追加：
```typescript
bankAccount?: string;
```

### 3. `apps/crawler/src/scrapers/mf_sbi_bank.ts` - DB 保存
インライン保存ロジックに追加：
```typescript
bankAccount: w.bankAccount || null,
```

## Non-Goals
- DB スキーマ変更（不要）
- マイグレーション（不要）
- 既存レコードの retroactive 更新

## Success Criteria
- スクレイパー実行エラーなし
- DB の `bank_account` カラムに値が格納される（NULL でない件数が増える）
- 既存の全テストが PASS
