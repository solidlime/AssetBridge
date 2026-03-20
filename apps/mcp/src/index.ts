import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { trpc } from "./trpc-client";
import { registerPortfolioTools } from "./tools/portfolio";
import { registerAnalysisTools } from "./tools/analysis";
import { registerMarketTools } from "./tools/market";
import { registerDividendsTools } from "./tools/dividends";
import { registerScrapeTools } from "./tools/scrape";
import { registerSimulatorTools } from "./tools/simulator";
import { registerResources } from "./tools/resources";
import { registerCreditTools } from "./tools/credit";

const PORT = parseInt(process.env.PORT ?? "8001", 10);

/**
 * リクエストごとに McpServer + Transport を生成する（ステートレスモード）。
 * セッション管理が不要なツール呼び出し専用サーバーとして機能する。
 */
function createMcpServer(): McpServer {
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
  registerCreditTools(server);
  registerResources(server);

  // スクレイプ時に2FAが要求された場合に使用する設定ツール
  server.tool(
    "set_mf_2fa_code",
    "マネーフォワードの2FA（メール認証）コードをDBに保存する。スクレイプ時に2FAが要求された場合に使用。",
    { code: z.string().describe("メールに届いた認証コード") },
    async ({ code }) => {
      try {
        await trpc.settings.setMf2faCode.mutate({ code });
        return { content: [{ type: "text", text: "2FA code accepted" }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * POST /mcp — MCP Streamable HTTP リクエストハンドラ
 * ステートレスモード: セッション ID なし、リクエストごとに独立
 */
async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless モード
    enableJsonResponse: true,      // SSE 不要・シンプルな JSON レスポンス
  });
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Bun ネイティブ HTTP サーバー（apps/api と同一パターン）
Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // MCP エンドポイント: POST / GET / DELETE に対応
    if (url.pathname === "/mcp") {
      return handleMcpRequest(req);
    }

    // ヘルスチェック
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", version: "2.0.0" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[mcp] AssetBridge MCP server v2.0.0 started (Streamable HTTP) on port ${PORT}`);
