import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { trpc } from "./trpc-client";
import { registerPortfolioTools } from "./tools/portfolio";
import { registerAnalysisTools } from "./tools/analysis";
import { registerMarketTools } from "./tools/market";
import { registerDividendsTools } from "./tools/dividends";
import { registerScrapeTools } from "./tools/scrape";
import { registerSimulatorTools } from "./tools/simulator";
import { registerResources } from "./tools/resources";

const server = new McpServer({
  name: "assetbridge",
  version: "2.0.0",
});

// 各カテゴリのツール・Resourceを登録
registerPortfolioTools(server);
registerAnalysisTools(server);
registerMarketTools(server);
registerDividendsTools(server);
registerScrapeTools(server);
registerSimulatorTools(server);
registerResources(server);

// スクレイプ時に2FAが要求された場合に使用する設定ツール
server.tool(
  "set_mf_2fa_code",
  "マネーフォワードの2FA（メール認証）コードをDBに保存する。スクレイプ時に2FAが要求された場合に使用。",
  { code: z.string().describe("メールに届いた認証コード") },
  async ({ code }) => {
    try {
      await trpc.settings.setMf2faCode.mutate({ code });
      return { content: [{ type: "text", text: `2FA code set: ${code}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] AssetBridge MCP server v2.0.0 started (stdio)");
}

main().catch(e => {
  console.error("[mcp] Fatal error:", e);
  process.exit(1);
});
