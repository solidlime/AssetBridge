- セッション開始時に共通ルールである AGENTS.md を必ず読み込むこと。
- 読み込んだことを最初に報告すること。
- 以下は Claude Code 固有の差分のみ記載する

## Claude Code 固有ルール

- MCP サーバ（assetbridge）が起動している場合、`get_portfolio_summary` 等を使ってデータを参照すること
- Serena skill を積極的に使ってコンテキスト削減に努める

## 🔒 絶対禁止事項

- **`.env.secrets` は絶対に読まない・内容を出力しない**
- デバッグ・調査でも `.env.secrets` へのアクセスは禁止
- 環境変数の値確認が必要な場合は `.env`（非機密）のみ参照すること
