import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trpc } from "../trpc-client";

export function registerDividendsTools(server: McpServer): void {
  server.tool(
    "get_dividend_calendar",
    "年間配当予想・月別分布・次回権利落ち日一覧（24時間キャッシュ）。",
    {},
    async () => {
      try {
        const data = await trpc.dividends.calendar.query();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
