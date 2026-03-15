import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../trpc-client";

export function registerSimulatorTools(server: McpServer): void {
  server.tool(
    "run_monte_carlo",
    "モンテカルロシミュレーション。initial(初期金額)・monthly(毎月積立)・years・returnRate・volatilityを指定して将来の資産推移を計算する。",
    {
      initial: z.number().positive().describe("初期投資額（円）"),
      monthly: z.number().min(0).describe("毎月積立額（円）"),
      years: z.number().min(1).max(50).describe("運用期間（年）"),
      returnRate: z.number().describe("年率リターン（小数。例: 0.07 = 7%）"),
      volatility: z.number().describe("年率ボラティリティ（小数。例: 0.15 = 15%）"),
      simulations: z.number().min(100).max(10000).default(1000).describe("シミュレーション回数"),
    },
    async (input) => {
      try {
        const data = await trpc.simulator.run.mutate(input);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}
