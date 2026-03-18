# Project Guide Line

## 1. プロジェクト概要

**AssetBridge** — マネーフォワード for 住信SBI銀行からポートフォリオデータを自動取得し、Web ダッシュボード / MCP サーバ / Discord Bot で可視化・分析するポートフォリオ管理 AI エージェント。

- 本プロジェクトの回答・コメントはすべて日本語で行う
- 技術用語・コード識別子は英語のまま維持する

## 2. アーキテクチャ

| サービス | 場所 | Port |
|---------|------|------|
| Hono + tRPC（REST API） | apps/api | 8000 |
| MCP サーバ（Streamable HTTP） | apps/mcp | 8001 |
| Playwright スクレイパー | apps/crawler | - |
| Discord Bot | apps/discord-bot | - |
| Next.js ダッシュボード | apps/web | 3000 |

データストア: `data/assetbridge_v2.db`（SQLite）

## 3. Memory & Handoff Instructions

### 3ファイルの役割と哲学
- 本ファイル（AGENTS.md）：「厳格なルール」、人が作成
- MEMORY.md：「積み上がる経験」、AI が作成・利用
- HANDOFF.md：「セッション間の引き継ぎ」、AI が作成・人がレビュー

### セッション開始時（必須）
セッション開始時、最初の応答前に以下を読み込み、読み込んだことを報告すること：
- `.agent/memory/MEMORY.md`（学習した知識・教訓）
- `.agent/handoff/HANDOFF.md`（前回の作業引き継ぎ）

### メモリ管理
- 新しい知識・教訓は `.agent/memory/MEMORY.md` を更新
- 更新前に現在のファイルを `.agent/memory/YYYY-MM-DD.md` にアーカイブ
- MEMORY.md は 200 行以内を維持
- 本ファイルと重複する内容は MEMORY.md に書かない

### ハンドオフ管理
- ハンドオフは `/handoff` コマンドで作成
- 保存先: `.agent/handoff/HANDOFF.md`（固定名）
- 作成時は既存ファイルを `.agent/handoff/YYYY-MM-DD-HHMM.md` にリネームしてから新規作成

## 4. 仕様駆動開発（SDD）ルール
- コーディング開始前に `.spec/` 配下の4ファイルを確認・更新すること
- 順序: PLAN（目的確認）→ SPEC（要件確認）→ TODO（タスク確認）→ 実作業
- SPEC.md が確定してから TODO.md のタスク分解を行い、承認を得てから実作業を開始
- 作業完了後は TODO.md にチェックを入れ、KNOWLEDGE.md に学びを記録

## 5. コーディングルール

- Python: 3.11+、型ヒント必須、`logging` モジュールを使用（print 禁止）
- TypeScript: strict モード、Server Components 優先
- DB 操作はすべて Repository パターン経由
- `.env` の機密情報をログに出力しない
- FastAPI エンドポイントはすべて `X-API-Key` ヘッダー認証
