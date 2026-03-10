# KNOWLEDGE - ドメイン知識・調査結果

## MF for 住信SBI銀行 スクレイピング
- ログイン URL: https://id.moneyforward.com/sign_in
- ポートフォリオ URL: https://netbk.moneyforward.com/bs/portfolio
- MF は UI 変更が多いため、セレクタは定期的に確認が必要
- playwright-stealth でボット検知を回避
- Cookie の有効期限は通常 24 時間程度

## 技術的な知見
- FastMCP の Streamable HTTP は `app.run(transport="streamable-http")` で起動
- LiteLLM は `model` パラメータを `.env` の `LLM_MODEL` で切り替え可能
- SQLite + SQLAlchemy の check_same_thread=False が asyncio 環境で必要
- Discord.py のスラッシュコマンドは `await tree.sync()` で同期が必要
