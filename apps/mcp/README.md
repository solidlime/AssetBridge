# @assetbridge/mcp

Model Context Protocol (MCP) サーバー。Claude Code から AssetBridge の資産データを参照・分析できます。

## 📋 概要

- **プロトコル**: MCP (Model Context Protocol) Streamable HTTP
- **ポート**: 8001
- **ランタイム**: Bun
- **SDK**: `@modelcontextprotocol/sdk`

## 🗂 主要ファイル

```
src/
└── index.ts              # MCP サーバー実装（tool 定義）
```

## 🔌 提供ツール

### ポートフォリオ取得

- `get_portfolio_snapshot` — 現在のスナップショット
- `get_holdings` — 保有銘柄一覧
- `get_asset_history` — 銘柄の価格推移
- `get_asset_detail` — 銘柄の詳細情報

### 分析

- `analyze_period` — 期間分析（7日/30日/1年）
- `run_scenario` — シナリオシミュレーション
- `get_risk_metrics` — リスク指標（Sharpe/Sortino/MaxDD）

### 市況・配当

- `get_market_context` — 市況コンテキスト（日経/S&P500/TOPIX）
- `search_news` — ニュース検索
- `get_dividend_calendar` — 配当カレンダー

### その他

- `trigger_scrape` — スクレイピング開始
- `get_scrape_status` — スクレイプ状態確認
- `run_monte_carlo` — Monteカルロシミュレーション実行
- `set_mf_2fa_code` — MoneyForward 2FA コード設定

## 🔑 環境変数

`.env` ファイルまたは `~/.assetbridge/.env` に設定：

```env
API_KEY=your_generated_api_key      # AssetBridge API 認証キー（必須）
API_URL=http://localhost:8000       # AssetBridge API URL（デフォルト: http://localhost:8000）
PORT=8001                            # MCP サーバーポート（デフォルト: 8001）
```

## 🚀 ローカル実行

### 開発モード（hot reload）

```bash
cd apps/mcp
bun --watch src/index.ts
```

### 本番モード

```bash
cd apps/mcp
bun src/index.ts
```

## 🔧 Claude Code 統合

### MCP 設定ファイル

Claude Code の MCP 設定に以下を追加：

```json
{
  "mcpServers": {
    "assetbridge": {
      "command": "bun",
      "args": ["apps/mcp/src/index.ts"],
      "cwd": "/path/to/AssetBridge",
      "env": {
        "API_KEY": "your_api_key",
        "API_URL": "http://localhost:8000"
      }
    }
  }
}
```

### Claude Code スキル

`.claude/skills/` に事前定義済みスキル：

```bash
/portfolio-review       # ポートフォリオレビュー
/risk-assessment        # リスク分析
/tax-analysis           # 税務分析
/dividend-analysis      # 配当分析
/rebalance              # リバランス提案
```

## 📊 使用例

### Claude Code での使用

```
# ポートフォリオスナップショットを取得
> 現在の資産状況を教えて

# リスク指標を分析
> ポートフォリオのリスク指標を計算して

# 配当カレンダーを表示
> 今月の配当予定を教えて

# スクレイピングを実行
> MoneyForward から最新データを取得して
```

## 🔗 API 通信

MCP サーバーは内部で tRPC クライアントを使用して API サーバーと通信：

1. Claude Code が MCP ツールを呼び出し
2. MCP サーバーが tRPC クライアントで API サーバーにリクエスト
3. API サーバーが DB からデータ取得
4. MCP サーバーが結果を Claude Code に返却

## 🔗 関連ドキュメント

- [ルートドキュメント](../../README.md) — 全体セットアップ
- [API サーバー](../api/README.md) — データ取得元
- [MCP 仕様](https://modelcontextprotocol.io/) — MCP プロトコル詳細
