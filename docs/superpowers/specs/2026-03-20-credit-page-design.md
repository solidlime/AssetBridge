# クレジットカード引き落とし管理ページ 設計仕様書

## 概要
クレジットカードの引き落とし予定と、紐づけた銀行口座の残高を比較・管理する専用ページを新設する。
残高不足の判定結果はMCPサーバーとtRPC APIから取得できるようにし、LLMが自律的に警告材料として使用できる。

## 要件

### 機能要件
1. `/credit` ページ新設（Client Component）
2. クレカ引き落とし一覧の表示（card_name, withdrawal_date, amount_jpy, status）
3. 各カードに対して引き落とし口座（CASHアセット）をドロップダウンで紐づけ
4. 紐づけ設定の保存（app_settingsにJSONで保存）
5. 現在残高 vs 引き落とし合計の比較表示（シンプルな合計比較）
6. 残高不足時は赤色ハイライト、余裕ありは緑色表示
7. MCP toolとtRPC APIからステータスを参照可能

### 非機能要件
- 既存の設定ページと同一のデザインテーマ（dark: bg #0f172a, card #1e293b）
- 後で時系列判定に拡張できる設計

## データ設計

### app_settings への追加
```
key: "cc_account_mapping"
value: '{"PayPayカード":5}'  // card_name → asset_id の JSON Map
```

### 既存テーブルの利用
- `credit_card_withdrawals`: 引き落とし情報（変更なし）
- `assets` + `portfolio_snapshots`: CASH資産の最新残高

## API設計

### tRPC（incomeExpenseRouter に追加）

```typescript
// 新規エンドポイント
getCcAccountMapping: proc.query()
  // 戻り値: { mapping: Record<string, number>, accounts: CashAccount[] }

setCcAccountMapping: proc.input(z.record(z.string(), z.number())).mutation()
  // カード名→asset_idのマッピングを保存

getCcBalanceStatus: proc.query()
  // 戻り値: CcBalanceStatus
```

### CcBalanceStatus 型
```typescript
interface CcBalanceStatus {
  status: "ok" | "warning" | "critical"  // いずれかのカードで不足なら warning/critical
  totalWithdrawalJpy: number
  summary: Array<{
    cardName: string
    withdrawalDate: string
    amountJpy: number
    accountName: string | null      // 未紐づけの場合null
    accountBalanceJpy: number | null
    shortfallJpy: number            // balance - withdrawal（負値=不足）
    isInsufficient: boolean
  }>
}
```

## MCPツール設計

### tool: `get_credit_card_balance_status`
```typescript
// 入力: なし
// 出力: CcBalanceStatus（上記と同じ構造）
// 説明: クレジットカード引き落とし予定と紐づけ口座の残高状況を返す
//       LLMが残高不足を検知して警告する用途で使用
```

## UI設計

### ナビゲーション
- サイドバーに「💳 クレカ」を追加
- 既存のナビゲーションコンポーネントに追記

### /credit ページ構成
```
┌─────────────────────────────────────────────────────────────┐
│  💳 クレジットカード引き落とし管理                           │
├──────────┬──────────┬──────────┬─────────────┬──────────────┤
│ カード名 │引き落し日│   金額   │  紐づけ口座  │   現在残高   │
├──────────┼──────────┼──────────┼─────────────┼──────────────┤
│ PayPay   │ 2026/03/19│ ¥10,885 │ [住信SBI ▼] │   ¥162,632  │
│ （未設定）│    -    │    -    │ [口座を選択 ▼]│      -      │
├──────────┴──────────┴──────────┴─────────────┴──────────────┤
│  合計引き落とし: ¥10,885  /  口座残高合計: ¥162,632          │
│  差分: +¥151,747  ✅ 残高余裕あり                           │
│                                      [口座設定を保存]        │
└─────────────────────────────────────────────────────────────┘
```

残高不足の場合: 差分行を赤色（bg #450a0a, text #f87171）

## 実装コンポーネント構成

```
apps/
├── api/src/
│   ├── services/income_expense.ts  // getCcBalanceStatus() 追加
│   └── router/income_expense.ts    // getCcAccountMapping, setCcAccountMapping, getCcBalanceStatus 追加
├── mcp/src/
│   └── tools/credit.ts             // get_credit_card_balance_status MCP tool 新規
└── web/src/
    ├── app/credit/page.tsx         // 新規ページ
    └── components/nav/             // ナビゲーションにクレカリンク追加
```

## テスト方針
- income_expense サービスのユニットテスト追加
- UI動作確認: カード未紐づけ / 紐づけあり余裕 / 紐づけあり不足 の3パターン
