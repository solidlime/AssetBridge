# SPEC - 技術仕様・要件定義

## 機能要件
- [x] Playwright による MF for 住信SBI銀行の自動スクレイプ
- [x] Cookie 暗号化セッション管理（Fernet）
- [x] TOTP / SMS 2FA 対応
- [x] SQLite DB への資産データ蓄積
- [x] FastAPI REST API（認証付き）
- [x] APScheduler による自動スケジューリング
- [x] FastMCP Streamable HTTP サーバ（13ツール）
- [x] Discord Bot（スラッシュコマンド + 朝次レポート）
- [x] Next.js ダッシュボード（6ページ）
- [x] モンテカルロシミュレーター

## 非機能要件
- セキュリティ: X-API-Key 認証 / Fernet 暗号化 / .env Git管理外
- スクレイプ検知回避: playwright-stealth / ランダム待機 / UA偽装
- LLM: LiteLLM で OpenAI/Gemini/Claude/OpenRouter 切替可能

## 技術構成
- 言語: Python 3.11+ / TypeScript 5
- フレームワーク: FastAPI / Next.js 15 / discord.py / FastMCP
- DB: SQLite + SQLAlchemy 2.0
- インフラ: ローカル / Cloudflare Pages（Web）
