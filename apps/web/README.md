# @assetbridge/web

Next.js 15 ベースの Web ダッシュボード。資産推移グラフ・保有銘柄一覧・AI 分析コメント等を表示します。

## 📋 概要

- **フレームワーク**: Next.js 15 (App Router)
- **UI**: shadcn/ui + Tailwind CSS 4
- **グラフ**: Recharts
- **API 通信**: tRPC client
- **ポート**: 3000
- **ランタイム**: Node.js 20+

## 🗂 主要ファイル

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # ダッシュボード（総資産・推移グラフ）
│   ├── holdings/                 # 保有資産一覧
│   ├── income-expense/           # 収支推移
│   ├── market/                   # 市況・ニュース
│   ├── dividends/                # 配当カレンダー
│   ├── simulator/                # Monteカルロシミュレーション
│   └── settings/                 # 設定
├── components/                   # UI コンポーネント
│   ├── dashboard/                # ダッシュボード用コンポーネント
│   ├── ui/                       # shadcn/ui コンポーネント
│   └── layout/                   # レイアウトコンポーネント
└── lib/
    ├── trpc.ts                   # tRPC クライアント設定
    └── utils.ts                  # ユーティリティ関数
```

## 🔑 環境変数

`.env.local` に設定（または `~/.assetbridge/.env`）：

```env
API_KEY=your_generated_api_key      # AssetBridge API 認証キー（必須）
API_URL=http://localhost:8000       # AssetBridge API URL（デフォルト: http://localhost:8000）
NEXT_PUBLIC_API_URL=http://localhost:8000  # クライアント側 API URL
```

## 🚀 ローカル実行

### 開発モード（hot reload）

```bash
cd apps/web
bun dev
```

ブラウザで http://localhost:3000 にアクセス。

### 本番ビルド

```bash
cd apps/web
bun build
bun start
```

## 📄 ページ構成

| ページ | パス | 機能 |
|--------|------|------|
| **ダッシュボード** | `/` | 総資産・推移グラフ・資産構成・AI 分析コメント |
| **保有資産** | `/holdings` | 株式・投信・現金等の詳細一覧（評価額・損益） |
| **収支** | `/income-expense` | 収入・支出の月別推移 |
| **市況** | `/market` | ニュース・リスク分析・市況コンテキスト |
| **配当** | `/dividends` | 配当カレンダー・月別推定額 |
| **シミュレータ** | `/simulator` | Monteカルロシミュレーション（リスク・リターン評価） |
| **設定** | `/settings` | スクレイプスケジュール・LLM 設定・Discord 設定 |

## 🎨 主要機能

### リアルタイム資産推移グラフ

- Recharts による折れ線グラフ
- 期間選択（7日/30日/90日/1年）
- 資産タイプ別の積み上げグラフ

### AI 分析コメント生成

- LLM 選択可能（GPT-4/Claude/Gemini）
- ポートフォリオの強み・弱み・改善提案を自動生成
- 設定ページでシステムプロンプトをカスタマイズ可能

### 保有資産一覧

- 銘柄ごとの評価額・取得単価・損益率
- ソート・フィルタリング機能
- Yahoo Finance データとのハイブリッド表示（リアルタイム価格変動）

### Monteカルロシミュレーション

- 期待リターン・ボラティリティを入力
- 10,000回のシミュレーション実行
- 確率分布グラフ・信頼区間表示

## 🔧 開発

### コンポーネント追加

shadcn/ui コンポーネントを追加：

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
```

### tRPC クライアント

API サーバーとの通信は tRPC クライアントを使用：

```typescript
import { trpc } from '@/lib/trpc';

export default function Page() {
  const { data, isLoading } = trpc.portfolio.snapshot.useQuery();

  if (isLoading) return <div>Loading...</div>;
  return <div>Total: {data.totalJpy}</div>;
}
```

## 🧪 テスト

```bash
cd apps/web
bun test
```

## 🔗 関連ドキュメント

- [ルートドキュメント](../../README.md) — 全体セットアップ
- [API サーバー](../api/README.md) — データ取得元
- [Next.js ドキュメント](https://nextjs.org/docs) — Next.js 公式ドキュメント
- [shadcn/ui](https://ui.shadcn.com/) — UI コンポーネント
