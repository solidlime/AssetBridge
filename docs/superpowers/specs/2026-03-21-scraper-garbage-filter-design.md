# Scraper Garbage Filter Design

**Date:** 2026-03-21  
**Scope:** `apps/crawler/src/scrapers/browser-scraper.mjs` のゴミ行フィルタ強化

---

## 問題の背景

マネーフォワード for 住信SBI銀行のポートフォリオページは複数のテーブルを持ち、
スクレイパーはセル数（count）でデータ種別を判断している。
現状のフィルタが不十分で、以下のゴミデータが DB に混入している。

| 問題 | 具体例 | 影響 |
|------|--------|------|
| カレンダー月数が POINT 名称として混入 | `name="22"`, `name="15"` | 不正なポイント資産として記録 |
| ページネーション要素が機関名として保存 | `institution_name="‹"` | 機関名フィールドの汚染 |
| ヘッダー行の除外ロジックなし | `name="銘柄コード"` | ヘッダーが資産として記録される恐れ |
| 合計・小計行の除外ロジックなし | `name="合計"`, valueJpy=37,903,029 | 合計金額が資産として二重計上 |

---

## 設計方針

**アプローチ: ハイブリッド防御フィルタ**

既存の column-count-based ロジックを維持しつつ、明示的なヘッダー・合計行検出関数を追加する。
根本的な DOM 解析の再設計は行わない（変更リスクが高く、正常動作している部分に影響する）。

---

## クレカスクレイプの修正（追加判明分）

### 根本原因の判明

- **「金融機関サービスサイトへ」は非表示テキスト（CSS display:none 等）** → `innerText` では取得不可、これが `Card anchors found: 0` の本当の原因
- **「不明のカード」混入**: `.facilities.accounts-list li` には「カード」「年金」等のセクションが混在しており、クレカでない li が誤パースされた
- **PayPayカード 重複**: `mf_sbi_bank.ts` の DELETE 条件が `withdrawalDate >= today` のため、過去日付の scheduled レコードが削除されず残り続ける

### A. `scrapeCardsByAnchor` の修正

「引き落とし日:」はクレカ固有のキーワード（銀行口座・年金にはない）。これでカード li のみを正確に識別する。

```javascript
const cardBlocks = await page.evaluate(() => {
  const allLis = document.querySelectorAll('.facilities.accounts-list li');
  if (allLis.length > 0) {
    const cardLis = Array.from(allLis).filter(li =>
      li.innerText.includes('引き落とし日:')
    );
    if (cardLis.length > 0) {
      return cardLis.map(li => li.innerText.trim());
    }
  }
  return [];
});
```

### B. `parseCardBlock` のカード名取得修正

「金融機関サービスサイトへ」は `innerText` に出てこないため、テキストベースのロジックを優先。

実際の li テキスト構造（ユーザー確認済み）:
```
PayPayカード        ← lines[0] = カード名
取得日時(03/21 15:46)
-7,307円
引き落とし日:(2026/03/27)
利用残高:-10,885円
080********
ステータス:正常
編集 更新
```

修正後:
1. 「金融機関サービスサイトへ」ロジックは維持（後方互換）
2. **最初の意味ある行（lines[0]）を直接カード名として採用** する優先ロジックを追加
   - 「取得日時」「ステータス」「編集」「更新」を含む行は除外
   - 「引き落とし」「残高」「ポイント」を含む行は除外

### C. `mf_sbi_bank.ts` の DELETE 条件修正

```typescript
// 変更前: 今日以降の scheduled のみ削除（過去日付が残る）
db.delete(creditCardWithdrawals)
  .where(and(gte(creditCardWithdrawals.withdrawalDate, today), eq(creditCardWithdrawals.status, "scheduled")))
  .run();

// 変更後: scheduled を全件削除してから最新を insert
db.delete(creditCardWithdrawals)
  .where(eq(creditCardWithdrawals.status, "scheduled"))
  .run();
```

---

## 修正詳細

### 1. `isHeaderRow(cellTexts)` 関数の追加

ヘッダー行と判定する条件:  
行の中に株式テーブルのヘッダーキーワードが含まれる場合。

```javascript
function isHeaderRow(cellTexts) {
  const headerKeywords = [
    '銘柄コード', '銘柄名', '保有数', '数量',
    '取得単価', '現在値', '現在価格',
    '評価額', '損益額', '損益率', '保有金融機関',
  ];
  return cellTexts.some(cell =>
    headerKeywords.some(kw => cell.includes(kw))
  );
}
```

**適用箇所:** `count >= 13`（株式行）の先頭で `continue`

### 2. `isSummaryRow(cellTexts)` 関数の追加

合計・小計行と判定する条件:  
いずれかのセルが合計系キーワードに完全一致または含む場合。

```javascript
function isSummaryRow(cellTexts) {
  const summaryKeywords = ['合計', '小計', '合計利益', '評価額合計', '合計金額'];
  return cellTexts.some(cell =>
    summaryKeywords.some(kw => cell.trim() === kw || cell.includes(kw))
  );
}
```

**適用箇所:** `count >= 6`（投信・年金・株式行）の先頭で `continue`

### 3. 数字のみ名前の除外強化

`count >= 6 && count < 13`（投信・年金行）の `isValidName` に追加:

```javascript
// 追加: 数字のみの名前を除外（カレンダー月数等）
&& !/^\d+$/.test(name)
```

**理由:** 「22」「15」のような数字のみ文字列はポイント/年金の名称として不正。

### 4. ページネーションアンカーの機関名誤設定防止

`count >= 1 && count <= 4` の `thAnchorText` から機関名を設定する箇所で追加チェック:

```javascript
const anchorIsPagination = /^[‹›<>]$/.test(thAnchorText.trim());
if (!anchorIsPagination) {
  currentInstitution = thAnchorText;
}
```

### 5. CASH行（count === 5）にも数字除外を適用

現在 `count === 5` の cash row にも同様の数字のみ除外を追加:

```javascript
&& !/^\d+$/.test(name)  // 数字のみを除外
```

---

## 影響範囲

- **変更ファイル:** `apps/crawler/src/scrapers/browser-scraper.mjs` のみ
- **DB への影響:** 次回スクレイプ時に不正データが混入しなくなる。既存の不正データは手動削除またはスクレイプ上書きで対処。
- **正常データへの影響:** 銘柄名・ファンド名は数字のみにならないため誤フィルタのリスクは低い。

---

## 成功基準

- [ ] POINT カテゴリに数字のみ名前が含まれない
- [ ] `institution_name` に `‹`, `›` が含まれない  
- [ ] スクレイプ後の asset 件数が前回比で異常増加しない
- [ ] STOCK_JP, STOCK_US の件数と金額が実際のポートフォリオと一致

---

## 変更しないもの

- column-count-based の分岐ロジック（count = 1, 5, 6-12, 13+）
- `buildColMap` の処理
- クレカスクレイプのロジック（別途修正済み）
- sectionHeading による機関名・カテゴリ検出
