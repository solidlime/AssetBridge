import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAssetAdvicePrompts(server: McpServer): void {
  // 1. ポートフォリオバランス分析プロンプト
  server.prompt(
    "analyze_portfolio_balance",
    "ポートフォリオのバランス分析（集中リスク・通貨分散）を行うプロンプト",
    async () => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `get_financial_summary ツールを使って現在の資産状況を取得し、以下の観点で分析してください：

## ポートフォリオバランス分析

1. **集中リスク評価**
   - 単一銘柄が総資産の10%超を占める場合、具体的なリスクを説明
   - アセットクラス別の偏りを評価（理想的な分散ポートフォリオとの比較）

2. **通貨分散評価**
   - 円建て資産と外貨建て資産の比率
   - 為替リスクへの対応策の提案

3. **改善提案**
   - リバランスが必要な場合、具体的な銘柄・金額を提示
   - 次の購入・売却候補の提案`,
            },
          },
        ],
      };
    }
  );

  // 2. 引き落とし計画プロンプト
  server.prompt(
    "plan_withdrawal_management",
    "引き落とし計画と残高管理アドバイスを行うプロンプト",
    async () => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `get_withdrawal_summary ツールを使って引き落とし情報を取得し、以下のアドバイスを提供してください：

## 引き落とし管理アドバイス

1. **今月・来月の引き落とし計画**
   - 各カードの引き落とし日と金額
   - 口座残高が不足するリスクがある場合は赤フラグ

2. **残高管理アドバイス**
   - 引き落とし日前日までに必要な残高確保アクション
   - 自動振替・資金移動の提案

3. **緊急対応（7日以内）**
   - 即座に対応が必要な案件の優先度付け`,
            },
          },
        ],
      };
    }
  );

  // 3. 配当最適化プロンプト
  server.prompt(
    "optimize_dividends",
    "配当最適化と権利落ち日管理を行うプロンプト",
    async () => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `get_financial_summary ツールと get_dividend_calendar ツールを使って配当情報を取得し、以下のアドバイスを提供してください：

## 配当最適化アドバイス

1. **年間配当収入の分析**
   - 月別の配当受取額と偏り
   - 配当利回り（ポートフォリオ全体）

2. **権利落ち日管理**
   - 今後3ヶ月以内の権利落ち日カレンダー
   - 権利落ち前に注意すべき銘柄

3. **配当強化の提案**
   - 配当収入を増やすための銘柄追加候補
   - 高配当株への組み替え提案`,
            },
          },
        ],
      };
    }
  );

  // 4. リスク警告プロンプト
  server.prompt(
    "check_risk_warnings",
    "急落銘柄・残高不足等のリスク警告を確認するプロンプト",
    async () => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `get_financial_summary ツールと get_withdrawal_summary ツールを使って現在の状況を取得し、以下のリスク評価を行ってください：

## リスク警告チェック

1. **資産リスク**
   - 前日比で大きく変動した銘柄（±5%超）
   - 含み損が拡大している銘柄の状況確認

2. **流動性リスク**
   - 残高不足のリスクがある口座・カード
   - キャッシュリザーブが3ヶ月未満の場合の対策

3. **集中リスク**
   - 集中リスク警告の詳細説明
   - 具体的な分散投資アクションプラン`,
            },
          },
        ],
      };
    }
  );
}
