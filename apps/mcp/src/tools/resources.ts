import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trpc } from "../trpc-client";

export function registerResources(server: McpServer): void {
  server.resource(
    "portfolio://snapshot/latest",
    "最新ポートフォリオスナップショット（静的文脈として利用可能）",
    async () => {
      const data = await trpc.portfolio.snapshot.query({});
      return {
        contents: [{
          uri: "portfolio://snapshot/latest",
          text: JSON.stringify(data, null, 2),
          mimeType: "application/json",
        }],
      };
    }
  );

  server.resource(
    "portfolio://history/30d",
    "過去30日の資産推移",
    async () => {
      const data = await trpc.portfolio.history.query({ days: 30 });
      return {
        contents: [{
          uri: "portfolio://history/30d",
          text: JSON.stringify(data, null, 2),
          mimeType: "application/json",
        }],
      };
    }
  );

  server.resource(
    "market://indices/current",
    "主要市場指数の現在値（日経225・S&P500・TOPIX・USD/JPY）",
    async () => {
      const data = await trpc.market.context.query();
      return {
        contents: [{
          uri: "market://indices/current",
          text: JSON.stringify(data, null, 2),
          mimeType: "application/json",
        }],
      };
    }
  );
}
