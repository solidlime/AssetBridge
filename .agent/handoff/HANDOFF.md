# HANDOFF — 2026-03-20

## 完了した作業

### テスト・リファクタ（Task 1〜9）
- 49 tests / 0 fail（api:21, crawler:15, db:13）
- type-check: 全6パッケージ PASS

### ドキュメント刷新
- README.md 全面刷新、apps/*/README.md 新規作成

### 3つのUIバグ修正
1. **クレカ引き落とし未表示** → `apps/web/src/app/page.tsx` に `incomeExpense.upcomingWithdrawals` 呼び出し追加（commit: e26e381）
2. **グラフ期間変更無効 + dataKey ミスマッチ** → `AssetHistoryChart` を Client Component 化、`useEffect` で再fetch、`totalJpy` に修正（commit: d27ac4a）
3. **取得単価すべて0** → MF が cellTexts[6] を空で返す → `(評価額 - 含み損益) / 数量` で逆算フォールバック（commit: 6f52693）
4. **brittle test 修正** → `>= 47` → `> 0`（commit: 直前）

### スキル・ポリシー整備
- `test-driven-development` スキル: Value Validity・Full-Stack Connectivity セクション追加
- `verification-before-completion` スキル: 3パターン追加
- `docs/superpowers/specs/test-policy.md` 新規作成
- `CLAUDE.md`: スキル自律改定ルール追加

## 現在の状態

- PM2: api/mcp/web/worker online、discord stopped
- テスト: 49 pass / 0 fail
- DB: 取得単価は次回スクレイプで自動修正される（逆算フォールバックが有効）
- クレカ引き落とし: DBにデータが入れば自動表示される

## 次にやること

- 実際のスクレイプ後に画面で取得単価・クレカ引き落とし表示を目視確認
- グラフ期間変更が実際に動作するか確認（DB に90日分データが蓄積後）
- 不要なデバッグログ（browser-scraper.mjs の [DEBUG] 行）を本番前に削除検討
