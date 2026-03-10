# HANDOFF

初回セットアップ完了。Phase 1（基盤）実装済み。
Phase 2-7 は並列エージェントが実装中。

## 現在のタスクと進捗
- [x] Phase 1: モノレポ基盤（設定ファイル / DB層 / 型定義）
- [ ] Phase 2: スクレイパー（scraper-agent が実装中）
- [ ] Phase 3+4: コアロジック + FastAPI（api-agent が実装中）
- [ ] Phase 5+6: MCP + Discord Bot（platform-agent が実装中）
- [ ] Phase 7: Next.js（web-agent が実装中）
- [ ] Phase 8: 統合スクリプト

## 次のセッションで最初にやること
1. 各エージェントの完了ファイルを確認
2. `python scripts/setup_db.py` で DB 初期化
3. `python scripts/test_login.py` でログイン疎通確認
