# @assetbridge/api

Hono.js + tRPC v11 ベースの REST API サーバー。ポートフォリオデータの取得、分析、設定管理を提供します。

## 📋 概要

- **フレームワーク**: Hono.js（軽量 Web フレームワーク）
- **RPC**: tRPC v11（型安全な API 呼び出し）
- **ポート**: 8000
- **ランタイム**: Bun

## 🗂 主要ファイル

```
src/
├── index.ts              # エントリーポイント（Hono サーバー起動）
├── router/
│   ├── index.ts          # tRPC ルーター統合
│   ├── portfolio.ts      # ポートフォリオ関連エンドポイント
│   ├── analysis.ts       # 分析・リスク指標
│   ├── market.ts         # 市況・ニュース
│   ├── dividends.ts      # 配当カレンダー
│   ├── scrape.ts         # スクレイパー制御
│   ├── simulator.ts      # Monteカルロシミュレーション
│   └── settings.ts       # 設定管理
├── services/
│   ├── portfolio.ts      # ポートフォリオビジネスロジック
│   ├── market.ts         # Yahoo Finance 統合
│   ├── dividends.ts      # 配当計算
│   └── __tests__/        # サービス層ユニットテスト
├── lib/
│   └── cache.ts          # メモリキャッシュ
└── middleware/
    ├── auth.ts           # API キー認証
    └── error.ts          # エラーハンドリング
```

## 🔌 主要エンドポイント

### ポートフォリオ

- `portfolio.snapshot` — 現在のスナップショット
- `portfolio.history` — 資産推移（過去 N 日間）
- `portfolio.holdings` — 保有銘柄一覧
- `portfolio.assetDetail` — 銘柄詳細

### 分析

- `analysis.period` — 期間分析（7日/30日/1年）
- `analysis.risk` — リスク指標（Sharpe/Sortino/MaxDD）
- `analysis.scenario` — シナリオシミュレーション

### 市況・配当

- `market.context` — 市況コンテキスト（日経/S&P500/TOPIX）
- `market.news` — ニュース検索（SearxNG 統合）
- `dividends.calendar` — 配当カレンダー

### その他

- `scrape.trigger` — スクレイピング開始
- `scrape.status` — スクレイプ状態確認
- `simulator.run` — Monteカルロシミュレーション実行
- `settings.*` — システム設定 CRUD

## 🔑 環境変数

`.env` ファイルまたは `~/.assetbridge/.env` に設定：

```env
API_KEY=your_generated_api_key      # API 認証キー（必須）
PORT=8000                            # サーバーポート（デフォルト: 8000）
SEARXNG_URL=http://localhost:8888   # SearxNG インスタンス（ニュース検索用）
```

## 🚀 ローカル実行

### 開発モード（hot reload）

```bash
cd apps/api
bun --watch src/index.ts
```

### 本番モード

```bash
cd apps/api
bun src/index.ts
```

## 🧪 テスト

```bash
cd apps/api
bun test
```

テストファイルは `src/services/__tests__/` に配置。

## 🔧 主要機能

### Yahoo Finance ハイブリッド方式

`services/portfolio.ts` の `getHoldings()` 関数は以下のロジックで株価変動を取得：

1. 前日の価格を DB から取得（`portfolio_snapshots`）
2. Yahoo Finance API で現在価格を取得（`yahoo-finance2` パッケージ）
3. 変動率（`priceDiffPct`）を計算

これにより、外部 API 呼び出しを最小限に抑えつつリアルタイム価格を表示。

### キャッシュ戦略

- **市況データ**: 1時間キャッシュ（`lib/cache.ts`）
- **ポートフォリオスナップショット**: キャッシュなし（常に最新）
- **ニュース**: 5秒タイムアウト、エラー時は空配列返却

## 🔗 関連ドキュメント

- [ルートドキュメント](../../README.md) — 全体セットアップ
- [データベーススキーマ](../../packages/db/README.md) — テーブル定義
- [MCP サーバー](../mcp/README.md) — Claude Code 統合
