# PLAN - やりたいこと

マネーフォワード for 住信SBI銀行からポートフォリオデータを自動取得し、
以下を構築する：

- Playwright スクレイパー（毎日自動実行）
- FastAPI バックエンド（データ API）
- MCP サーバ（Claude Code から参照可能）
- Discord Bot（朝次レポート + 対話 Q&A）
- Next.js ダッシュボード（資産推移グラフ / シミュレーター等）
