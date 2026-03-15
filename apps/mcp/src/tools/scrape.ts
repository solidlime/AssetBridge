import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trpc } from "../trpc-client";

export function registerScrapeTools(server: McpServer): void {
  server.tool(
    "trigger_scrape",
    "MF for 住信SBI銀行のスクレイプジョブをキューに積む。ジョブIDを返す。",
    {},
    async () => {
      try {
        const data = await trpc.scrape.trigger.mutate();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_scrape_status",
    "最新スクレイプジョブの状態確認（pending/running/done/failed）。",
    {},
    async () => {
      try {
        const data = await trpc.scrape.status.query();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
