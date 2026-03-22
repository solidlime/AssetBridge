import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trpc } from "../trpc-client";

export function registerFundTransferTools(server: McpServer): void {
  server.tool(
    "get_fund_transfer_suggestion",
    "残高不足の口座を分析し、最適な資金移動（口座振替）を提案します。どの口座からどの口座にいくら移動すべきかアドバイスします。",
    {},
    async () => {
      try {
        const accountSummary = await trpc.incomeExpense.getWithdrawalAccountSummary.query();

        // 不足口座（shortfallJpy < 0）: 不足が大きい順
        const shortfallAccounts = accountSummary
          .filter((a) => a.shortfallJpy < 0)
          .sort((a, b) => a.shortfallJpy - b.shortfallJpy);

        // 余剰口座（shortfallJpy > 0 かつ残高あり）: 余剰が大きい順
        const surplusAccounts = accountSummary
          .filter((a) => a.shortfallJpy > 0 && a.balanceJpy > 0)
          .sort((a, b) => b.shortfallJpy - a.shortfallJpy);

        if (shortfallAccounts.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "OK",
                    message: "すべての引き落とし口座で残高が充分です。資金移動は不要です。",
                    suggestions: [],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const suggestions: Array<{
          from: string;
          to: string;
          amount: number;
          reason: string;
          urgency: "urgent" | "normal";
        }> = [];

        for (const deficit of shortfallAccounts) {
          const needed = Math.abs(deficit.shortfallJpy);
          const nextDate = deficit.nextWithdrawalDate;

          const daysUntil =
            nextDate
              ? Math.ceil((new Date(nextDate).getTime() - Date.now()) / 86400000)
              : null;

          // 残高が不足額を単独で賄える最大余剰口座を選択
          const bestSource = surplusAccounts.find((s) => s.balanceJpy >= needed);

          if (bestSource) {
            suggestions.push({
              from: `${bestSource.accountName}（${bestSource.institutionName ?? "不明"}）`,
              to: `${deficit.accountName}（${deficit.institutionName ?? "不明"}）`,
              amount: needed,
              reason: nextDate
                ? `${deficit.accountName}で¥${needed.toLocaleString()}の残高不足。引き落とし日(${nextDate})まで${daysUntil}日。`
                : `${deficit.accountName}で¥${needed.toLocaleString()}の残高不足。`,
              urgency: daysUntil !== null && daysUntil <= 3 ? "urgent" : "normal",
            });
          } else {
            // 単独で賄える口座がない場合は複数口座からの分割移動を提案
            suggestions.push({
              from:
                surplusAccounts
                  .map(
                    (s) =>
                      `${s.accountName}（${s.institutionName ?? "不明"}）残高¥${s.balanceJpy.toLocaleString()}`
                  )
                  .join(", ") || "余剰口座なし",
              to: `${deficit.accountName}（${deficit.institutionName ?? "不明"}）`,
              amount: needed,
              reason: `¥${needed.toLocaleString()}の不足。まとまった余剰口座がないため複数口座からの分割移動を検討してください。`,
              urgency: "urgent",
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "ACTION_REQUIRED",
                  message: `${shortfallAccounts.length}口座で残高不足が検出されました。以下の資金移動を推奨します。`,
                  suggestions,
                  totalShortfallJpy: shortfallAccounts.reduce(
                    (sum, a) => sum + Math.abs(a.shortfallJpy),
                    0
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
