# @assetbridge/crawler

Playwright ベースの MoneyForward スクレイパー。Node.js プロセスとして動作し、Bun から `Bun.spawn()` で呼び出されます。

## 📋 概要

- **スクレイピング対象**: MoneyForward for 住信SBI銀行（https://ssnb.x.moneyforward.com）
- **ランタイム**: Node.js（Playwright が Node.js 専用のため）
- **呼び出し方式**: Bun から `Bun.spawn()` で子プロセスとして起動
- **通信**: stdin/stdout で JSON メッセージング

## 🗂 主要ファイル

```
src/
├── index.ts                    # Bun エントリーポイント（ジョブキュー管理）
├── scrapers/
│   └── browser-scraper.mjs     # Node.js スクレイパー本体（Playwright）
├── job-queue.ts                # スクレイプジョブキュー
├── session-manager.ts          # セッション管理
└── __tests__/
    └── browser-scraper.test.mjs  # スクレイパーユニットテスト
```

## 🔄 動作フロー

1. **Bun プロセス**（`index.ts`）がスケジューラーからジョブを受信
2. `Bun.spawn()` で **Node.js プロセス**（`browser-scraper.mjs`）を起動
3. Node.js プロセスが Playwright で MoneyForward にログイン
4. 2FA が必要な場合、`REQUIRES_2FA` を stdout に出力
5. Bun プロセスが 2FA コードを stdin に送信
6. スクレイピング完了後、`DONE:<JSON>` を stdout に出力
7. Bun プロセスが結果を DB に保存

## 🔑 環境変数

`.env` ファイルまたは `~/.assetbridge/.env` に設定：

```env
MF_EMAIL=your@email.com          # MoneyForward ログインメール（必須）
MF_PASSWORD=your_password        # MoneyForward パスワード（必須）
MF_2FA_CODE=123456               # 2FA コード（オプション、自動入力用）
```

## 🚀 ローカル実行

### 開発モード（hot reload）

```bash
cd apps/crawler
bun --watch src/index.ts
```

### 本番モード

```bash
cd apps/crawler
bun src/index.ts
```

### スクレイパー単体テスト（Node.js 直接実行）

```bash
cd apps/crawler
node src/scrapers/browser-scraper.mjs
# stdin から 2FA コードを入力
CODE:123456
```

## 🧪 テスト

```bash
cd apps/crawler
bun test
```

テストファイルは `src/__tests__/` に配置。

## 🔧 主要機能

### parseCardAmount 関数

クレジットカード引き落とし額をパースする専用関数。

```javascript
export function parseCardAmount(text) {
  if (!text) return null;
  const match = String(text).replace(/[¥円\s]/g, "").match(/-?[\d,]+/);
  if (!match) return null;
  const num = parseInt(match[0].replace(/,/g, ""), 10);
  return isNaN(num) ? null : Math.abs(num);
}
```

**特徴**:
- 未確定時は `null` を返却（スキップ用）
- `parseAmount` とは別関数で、ポートフォリオスクレイピングには影響しない

### セッション永続化

スクレイピング成功時、Playwright のセッション Cookie を DB に保存：

- テーブル: `crawler_sessions`
- 次回ログイン時に再利用してログインフローをスキップ

### 2FA ハンドリング

- メール認証コードが必要な場合、`REQUIRES_2FA` を出力
- Claude Code MCP ツール（`set_mf_2fa_code`）または環境変数（`MF_2FA_CODE`）で入力
- タイムアウト: 5分（設定可能）

## 📊 スクレイピングデータ

以下のデータを取得：

- **保有資産**: 銘柄名・数量・評価額・取得単価
- **資産タイプ**: 株式（JP/US）・投資信託・現金・年金・ポイント
- **総資産額**: 各カテゴリ別の合計
- **クレジットカード**: 引き落とし予定額（parseCardAmount で解析）

## 🔗 関連ドキュメント

- [ルートドキュメント](../../README.md) — 全体セットアップ
- [API サーバー](../api/README.md) — スクレイプ結果を提供する API
- [データベーススキーマ](../../packages/db/README.md) — 保存先テーブル定義
