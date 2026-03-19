# @assetbridge/discord-bot

Discord Bot。毎朝自動でポートフォリオレポートを配信します。

## 📋 概要

- **フレームワーク**: discord.js v14
- **スケジューラー**: node-cron
- **ランタイム**: Bun
- **デフォルトスケジュール**: 毎朝 8:00

## 🗂 主要ファイル

```
src/
└── index.ts              # Bot エントリーポイント（スケジューラー設定）
```

## 🔑 環境変数

`.env` ファイルまたは `~/.assetbridge/.env` に設定：

```env
DISCORD_TOKEN=your_discord_bot_token          # Discord Bot トークン（必須）
DISCORD_CHANNEL_ID=123456789012345678         # レポート送信先チャンネル ID（必須）
API_KEY=your_generated_api_key                # AssetBridge API 認証キー（必須）
API_URL=http://localhost:8000                 # AssetBridge API URL（デフォルト: http://localhost:8000）
```

## 🚀 ローカル実行

### 開発モード（hot reload）

```bash
cd apps/discord-bot
bun --watch src/index.ts
```

### 本番モード

```bash
cd apps/discord-bot
bun src/index.ts
```

## 🤖 Discord Bot セットアップ

### 1. Discord Developer Portal で Bot を作成

1. https://discord.com/developers/applications にアクセス
2. **New Application** をクリック
3. **Bot** タブから Bot を作成
4. **Token** をコピーして `DISCORD_TOKEN` に設定

### 2. Bot をサーバーに招待

1. **OAuth2** → **URL Generator** をクリック
2. **Scopes**: `bot` を選択
3. **Bot Permissions**: `Send Messages`, `Embed Links` を選択
4. 生成された URL でサーバーに招待

### 3. チャンネル ID を取得

1. Discord で開発者モードを有効化（User Settings → Advanced → Developer Mode）
2. レポート送信先チャンネルを右クリック → **Copy ID**
3. コピーした ID を `DISCORD_CHANNEL_ID` に設定

## 📊 レポート内容

毎朝 8:00 に以下の情報を自動配信：

- 💰 **総資産額** — 前日比の変動額・変動率
- 📈 **資産構成** — 株式・投資信託・現金等の内訳
- 🏆 **Top Gainers** — 上昇率トップ 5
- 📉 **Top Losers** — 下落率ワースト 5
- 📰 **市況ニュース** — 日経平均・S&P500・ドル円の現在値

## 🔧 スケジュール設定

デフォルトのスケジュールは `src/index.ts` で設定：

```typescript
// 毎朝 8:00 に実行
cron.schedule('0 8 * * *', async () => {
  await sendDailyReport();
});
```

カスタムスケジュールは Web UI から変更可能（設定 → Discord 設定）。

## 🛠 カスタマイズ

### レポートフォーマット

`src/index.ts` の `formatReport()` 関数でカスタマイズ可能：

- Embed の色（成功: 緑、失敗: 赤）
- フィールドの追加・削除
- グラフ・チャート画像の添付

### コマンド追加

Discord のスラッシュコマンドを追加する場合：

```typescript
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'portfolio') {
    const snapshot = await getPortfolioSnapshot();
    await interaction.reply(formatSnapshot(snapshot));
  }
});
```

## 🧪 テスト

```bash
cd apps/discord-bot
bun test
```

## 🔗 関連ドキュメント

- [ルートドキュメント](../../README.md) — 全体セットアップ
- [API サーバー](../api/README.md) — データ取得元
- [discord.js ドキュメント](https://discord.js.org/) — discord.js 公式ドキュメント
