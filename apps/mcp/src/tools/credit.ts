import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trpc } from "../trpc-client";

export function registerCreditTools(server: McpServer): void {
  server.tool(
    "get_credit_card_balance_status",
    "クレジットカード引き落とし予定と紐づけ口座の残高状況を返す。LLMが残高不足を検知してユーザーに警告する用途で使用する。",
    {},
    async () => {
      try {
        const data = await trpc.incomeExpense.getCcBalanceStatus.query();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    }
  );
}
