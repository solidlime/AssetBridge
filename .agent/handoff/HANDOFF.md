# HANDOFF 2026-03-21

## 完了した作業
- B1: 謎の銘柄除去（browser-scraper.mjs テーブル単位走査修正 + DB削除）
- B2/B3: クレカ複数取得・口座ドロップダウン修正
- B4: 配当額修正（実配当履歴ベース計算）
- B5: シミュレータ初期値（portfolio.history DB経路に変更）
- B6: 金融機関名表示修正（カテゴリ名フォールバック削除）
- C1: クレカ3枚取得修正（PayPay/三井住友/楽天 対応）
- C2: current_price_jpy DB追加・portfolio/holdings API に currentPriceJpy 追加
- C3: 資産一覧に現在値列、クレカページに口座列追加
- E2E テスト: 25 passed / 0 failed / 1 skipped（全パス）
- API 確認: holdings/upcoming-withdrawals/cc-account-mapping 正常動作

## 残課題
- スクレイプ実行後に current_price_jpy・bank_account が正しく入るか確認が必要
  （現在 NULL は正常 — スクレイプ完了後に実データが入る）
- クレカ3枚取得は次回スクレイプで確認が必要
- discord bot は stopped 状態（意図的か要確認）

## 重要ファイル
- apps/crawler/src/scrapers/browser-scraper.mjs  ← 謎銘柄修正、クレカ3枚取得
- apps/crawler/src/scrapers/mf_sbi_bank.ts       ← bank_account カラム追加
- apps/api/src/services/dividends.ts              ← 配当額計算修正
- apps/api/src/services/portfolio.ts             ← currentPriceJpy 追加
- apps/web/src/app/assets/page.tsx               ← 現在値列追加
- apps/web/src/app/income-expense/page.tsx       ← 口座列追加
- apps/web/src/app/simulator/page.tsx            ← 初期値DB経路変更

## 次セッションでやること
1. スクレイプを実行して実データを取得
2. 上記の NULL フィールドが正しく入るか確認
3. 金融機関名が実データで正しく表示されるか確認
