# AssetBridge テストポリシー

最終更新: 2026-03-20

## テストピラミッド

| 層 | ツール | カバレッジ目標 |
|----|--------|-------------|
| ユニット（純粋関数） | Bun test | 全 export 関数 |
| 統合（DB/API） | Bun test + in-memory SQLite | 全 Repo メソッド |
| E2E（UI動作） | Playwright | クリティカルパス必須 |

## 必須アサーションルール

### 1. Golden Snapshot テスト

フィールドの存在 **と** 値の妥当性を両方チェックすること：

```typescript
// ❌ 悪い例：フィールド存在確認のみ
expect(item).toHaveProperty("quantity");
expect(item).toHaveProperty("costPerUnitJpy");

// ✅ 良い例：存在 + 値の妥当性を確認
expect(item).toHaveProperty("quantity");
expect(item.quantity).toBeGreaterThan(0);

expect(item).toHaveProperty("costPerUnitJpy");
expect(item.costPerUnitJpy).toBeGreaterThan(0);

// 文字列フィールド
expect(item.symbol).toBeTruthy();
```

**なぜ必須か？** 2026-03-20 のバグで、snapshot テストが量・取得単価が0の不正データをPASSさせてしまった。

### 2. データパイプライン統合テスト（新機能追加時必須）

新機能追加時は必ず「入口から出口まで」の1本テストを書くこと：

- スクレイパーの戻り値
- DB upsert
- DB select
- API response
- UIに値が表示される（E2E）

最低限、APIが期待フィールドを **非ゼロ値** で返すことを確認。

```typescript
// packages/db/src/repos/__tests__/portfolio.test.ts
test("Portfolio.upsert → API response の整合性", async () => {
  const scraperData = {
    quantity: 10,
    costPerUnitJpy: 5000,
    symbol: "7203", // トヨタ
  };

  // DB に upsert
  await Portfolio.upsert(scraperData);

  // DB から select
  const dbRow = await Portfolio.findBySymbol("7203");
  expect(dbRow.quantity).toBe(10);
  expect(dbRow.costPerUnitJpy).toBe(5000);

  // API から get
  const apiRes = await fetch("/trpc/portfolio.getBySymbol?symbol=7203");
  const apiData = await apiRes.json();
  expect(apiData.quantity).toBeGreaterThan(0);
  expect(apiData.costPerUnitJpy).toBeGreaterThan(0);
});
```

### 3. フロントエンド動作テスト（Playwright E2E）

クリティカルパスは必ずE2Eテストを書く。パラメータ固定値バグを防ぐため：

```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from "@playwright/test";

test("資産推移グラフ期間変更", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // 7日間を表示
  await page.click("[data-testid=period-7D]");
  const points7d = await page.locator("[data-testid=chart-point]").count();

  // 90日間に変更
  await page.click("[data-testid=period-90D]");
  const points90d = await page.locator("[data-testid=chart-point]").count();

  // 90日は7日以上のデータを含むはず
  expect(points90d).toBeGreaterThanOrEqual(points7d);
});

test("ダッシュボード総資産が0より大きい", async ({ page }) => {
  await page.goto("http://localhost:3000");
  const totalAsset = await page.locator("[data-testid=total-asset-value]").textContent();
  expect(parseInt(totalAsset)).toBeGreaterThan(0);
});

test("資産一覧の数量・単価がゼロでない", async ({ page }) => {
  await page.goto("http://localhost:3000/assets");
  
  // 最初の行
  const firstQuantity = await page.locator("[data-testid=asset-quantity]:first-of-type").textContent();
  const firstPrice = await page.locator("[data-testid=asset-price]:first-of-type").textContent();
  
  expect(parseInt(firstQuantity)).toBeGreaterThan(0);
  expect(parseFloat(firstPrice)).toBeGreaterThan(0);
});
```

## バグ発生時のチェックリスト

値がおかしい場合は以下の順で確認：

1. **DBの実値を確認**
   ```bash
   bun -e "
   import Database from 'better-sqlite3';
   const db = new Database('data/assetbridge_v2.db');
   console.log(db.prepare('SELECT * FROM portfolio LIMIT 1').all());
   "
   ```

2. **APIレスポンスを確認**
   ```bash
   curl.exe -s -X GET "http://localhost:8000/trpc/portfolio.list" --noproxy "*" | jq
   ```

3. **フロントエンドのNetworkタブ確認**
   - DevTools → Network → XHR/Fetch フィルタ
   - APIレスポンスの値を確認

4. **スクレイパーのログ確認**
   ```bash
   pm2 logs crawler
   ```

## テスト実行コマンド

```bash
# ユニット + 統合テスト
pnpm test

# E2E テスト（開発環境が起動している前提）
pnpm exec playwright test tests/e2e/

# 特定のE2Eテストを実行（デバッグ）
pnpm exec playwright test tests/e2e/dashboard.spec.ts --debug
```

## 既知の弱点

| パターン | 対策 |
|---------|------|
| snapshot テストでゼロ値を検出できない | 値の妥当性アサーション（>0）を必須化 |
| 単体テストが通ってもUIに反映されない | データフロー統合テスト（スクレイパー→DB→API→UI）を1本書く |
| フロントのパラメータが固定値 | Playwright E2E で複数条件を試す |

## チェックリスト（コードレビュー時に確認）

- [ ] 新しいテストは golden snapshot だけでなく、値の妥当性（>0、非null）も確認しているか？
- [ ] 新機能のデータが「スクレイパー→DB→API→UI」まで接続されているか？
- [ ] フロントエンドが APIパラメータを**ハードコード**していないか？
- [ ] クリティカルパスは E2E テストで検証されているか？
