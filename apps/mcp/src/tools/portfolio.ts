import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../trpc-client";

export function registerPortfolioTools(server: McpServer): void {
  server.tool(
    "get_portfolio_snapshot",
    "現在のポートフォリオ全体像。総資産・前日比・アセット配分・含み損益上位を返す。",
    { date: z.string().optional().describe("YYYY-MM-DD 形式の日付。省略時は最新") },
    async ({ date }) => {
      try {
        const data = await trpc.portfolio.snapshot.query({ date });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_holdings",
    "保有銘柄一覧。assetType(stock_jp/stock_us/fund/cash/pension/all)・minValueJpy・queryで絞り込み。",
    {
      assetType: z.string().default("all").describe("all/stock_jp/stock_us/fund/cash/pension"),
      minValueJpy: z.number().optional().describe("最低評価額フィルタ（円）"),
      query: z.string().optional().describe("銘柄名・コードの検索クエリ"),
    },
    async (input) => {
      try {
        const data = await trpc.portfolio.holdings.query(input);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_asset_history",
    "過去N日間の総資産推移。daysパラメータで期間指定。",
    { days: z.number().default(30).describe("取得する日数（1〜365）") },
    async ({ days }) => {
      try {
        const data = await trpc.portfolio.history.query({ days });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_asset_detail",
    "個別銘柄の完全文脈。保有情報＋PER/PBR等の市場データ＋ニュース5件＋30日推移。",
    { symbol: z.string().describe("銘柄コード（例: 7203, AAPL）") },
    async ({ symbol }) => {
      try {
        const data = await trpc.portfolio.assetDetail.query({ symbol });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
