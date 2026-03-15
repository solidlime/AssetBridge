import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../trpc-client";

export function registerAnalysisTools(server: McpServer): void {
  server.tool(
    "analyze_period",
    "指定期間のパフォーマンス分析。年率リターン・最大ドローダウン・シャープレシオを返す。",
    {
      fromDate: z.string().describe("開始日 YYYY-MM-DD"),
      toDate: z.string().describe("終了日 YYYY-MM-DD"),
    },
    async ({ fromDate, toDate }) => {
      try {
        const data = await trpc.analysis.period.query({ fromDate, toDate });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "run_scenario",
    "ショックシナリオ分析。例: {STOCK_JP: -0.20} で日本株20%下落時の損失額を計算。",
    {
      shocks: z.record(z.number()).describe("アセットタイプ: ショック率のマップ。例: {STOCK_JP: -0.2, STOCK_US: -0.3}"),
    },
    async ({ shocks }) => {
      try {
        const data = await trpc.analysis.scenario.mutate({ shocks });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_risk_metrics",
    "リスク指標。過去N日のボラティリティ・最大ドローダウン・シャープレシオ。",
    { days: z.number().default(90).describe("分析期間（日数）") },
    async ({ days }) => {
      try {
        const data = await trpc.analysis.risk.query({ days });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
