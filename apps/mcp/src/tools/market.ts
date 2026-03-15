import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../trpc-client";

export function registerMarketTools(server: McpServer): void {
  server.tool(
    "get_market_context",
    "日経225・S&P500・TOPIX・USD/JPYの現在値と前日比（1時間キャッシュ）。",
    {},
    async () => {
      try {
        const data = await trpc.market.context.query();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "search_news",
    "SearXNGでニュース検索。queryまたはsymbolsで絞り込み。最新7日間のニュースを最大10件返す。",
    {
      query: z.string().optional().describe("検索クエリ"),
      symbols: z.array(z.string()).optional().describe("銘柄コードリスト（例: ['7203', 'AAPL']）"),
      days: z.number().default(7).describe("取得期間（日数）"),
    },
    async (input) => {
      try {
        const data = await trpc.market.news.query(input);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
