# HANDOFF 2026-03-22

## 今セッションで完了した作業
- SQLite BUSY_RECOVERY クラッシュ修正（`packages/db/src/client.ts`: `PRAGMA busy_timeout = 5000` 追加）
- start.sh cp 問題修正（`ecosystem.config.ts` → `.cjs` の上書きを防止）
- start.sh lockfile フラグ修正（`--frozen-lockfile` → `--no-frozen-lockfile`）
- pnpm-lock.yaml 再生成（overrides 変更に追従）
- クレカ重複排除キー修正（`cardName` 単独 → `cardName|withdrawalDate|amountJpy` 複合キー）
- 金融機関名スクレイピング根本修正（`browser-scraper.mjs` 4箇所）
  - sectionHeading パターン4/5 追加（MF 固有コンテナ対応）
  - count=1 の colspan 行（金融機関名ヘッダ）対応
  - ページネーション行（‹/›）フィルタ強化
  - CATEGORY_MAP 未一致見出しを `currentInstitution` に設定
- シミュレータ localStorage 永続化（`simulator/page.tsx`）
- **Next.js ビルド実行・全サービス再起動 → 修正を反映済み**
- E2E テスト: **25 passed / 1 skipped / 0 failed ✅**
- サービス状態: api / mcp / web / worker → **online ✅**
- コミット: `0f2b41e`

## 重要ファイル
- `apps/crawler/src/scrapers/browser-scraper.mjs` ← 金融機関名修正・クレカ重複修正
- `packages/db/src/client.ts` ← busy_timeout 追加
- `scripts/start.sh` ← cp 行削除・--no-frozen-lockfile に変更
- `apps/web/src/app/simulator/page.tsx` ← localStorage 永続化
- `pnpm-lock.yaml` ← overrides 変更後に再生成済み

## ビルド漏れ防止
- `start.sh` 行100-108 に `pnpm --filter @assetbridge/web build` が入っている（build → migrate → pm2 start の順）
- `--skip-build` フラグを使うとスキップされるので注意
- 手動でコード変更した後は `pnpm --filter @assetbridge/web build && npx pm2 restart web` を実行すること

## 次セッションでやること（優先度順）
1. スクレイプを実行して金融機関名が正しく取得されるか確認
   → ログに `[browser-scraper] institution from heading=` または `institution(colspan)` が出れば成功
2. DBの `institution_name` が埋まっているか確認
   → `SELECT institution_name, COUNT(*) FROM holdings GROUP BY institution_name`
3. クレカが複数表示されるか確認（UIで確認）

## 残課題
- discord bot: stopped 状態（意図的か要確認）
- スクレイプ未実施のため金融機関名修正の効果は未検証
