## API エンドポイント検証レポート

### 1. APIアーキテクチャ確認
- **プロトコル**: tRPC (JSON-RPC over HTTP/GET for queries)
- **APIエンドポイント形式**: `/trpc/{router}.{procedure}`
- **サーバーポート**: 8000
- **サーバー状態**: ✅ 起動中

### 2. エンドポイント検証結果

#### ✅ portfolio.holdings
**パス**: `/trpc/portfolio.holdings?input={"assetType":"all"}`
**状態**: 正常に動作 (48件のホールディング返却)

**フィールド確認**:
- `currentPriceJpy` フィールド: ✗ **存在せず（全て undefined）**
  - 型定義に存在: ✅ `packages/types/src/index.ts` line 38
  - DBスキーマに存在: ✅ `portfolioSnapshots.currentPriceJpy` 
  - サービスロジックで取得: ✅ `portfolio.ts` line 265
  - **問題**: データベースの全 currentPriceJpy が NULL のため JSON応答から除外
  - **サンプルデータ**: 全 142 スナップショット中 0件が値を保有

#### ✅ incomeExpense.upcomingWithdrawals
**パス**: `/trpc/incomeExpense.upcomingWithdrawals?input={"days":60}`
**状態**: 正常に動作 (1件のデータ返却)

**フィールド確認**:
- `bankAccount` フィールド: ✓ **存在するが NULL**
  - スキーマに存在: ✅ `credit_card_withdrawals.bank_account`
  - API応答に含まれる: ✅ `"bankAccount": null`
  - **問題**: データベースの全 bank_account が NULL
  - **件数**: 1件の withdrawal データ中 0件が値を保有

#### ✅ incomeExpense.getCcAccountMapping
**パス**: `/trpc/incomeExpense.getCcAccountMapping`
**状態**: 正常に動作

**データ確認**:
- マッピング件数: 1件 (CardB → assetId 2)
- アカウント（asset）件数: 14件

### 3. 発見された問題

| エンドポイント | フィールド | 問題 | 重要度 |
|---|---|---|---|
| portfolio.holdings | currentPriceJpy | 全て NULL でAPI応答から除外 | 🟡 中 |
| incomeExpense.upcomingWithdrawals | bankAccount | 全て NULL | 🟡 中 |
| incomeExpense.getCcAccountMapping | - | 件数が少ない（1マッピング、14アカウント） | 🟢 低 |

### 4. データベース状態

```
Table: portfolio_snapshots
- 総行数: 142
- currentPriceJpy が非NULL: 0 件

Table: credit_card_withdrawals
- 総行数: 1
- bank_account が非NULL: 0 件
```

### 5. 修正内容（実装アクション）

**修正不要です**。API応答とコードロジックは正常です：
1. `currentPriceJpy` と `bankAccount` がNULLなのは、**データスクレイピング/入力プロセスがこれらを提供していないため**です
2. TypeScript型定義では optional（`?`）として定義されているため、NULLの場合にJSONから除外されることは仕様通りです
3. フロントエンド実装では、これらフィールドが undefined になる可能性を考慮して実装される必要があります

---

**推奨アクション**:
- データ入力プロセスで `currentPriceJpy` と `bankAccount` を入力するよう改善
- フロントエンドの型定義で必須 vs オプショナルを明確にする
