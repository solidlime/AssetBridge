import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trpc } from "../trpc-client";

export function registerWithdrawalTools(server: McpServer): void {
  server.tool(
    "get_withdrawal_summary",
    "引き落とし情報の総括（今月・来月の引き落とし予定、各口座残高、残高不足カード、7日以内緊急案件）",
    {},
    async () => {
      try {
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

        const [thisMonthSummary, nextMonthSummary, ccBalanceStatus, upcomingResult] =
          await Promise.all([
            trpc.incomeExpense.getMonthlyWithdrawalSummary.query({ month: thisMonth }),
            trpc.incomeExpense.getMonthlyWithdrawalSummary.query({ month: nextMonth }),
            trpc.incomeExpense.getCcBalanceStatus.query(),
            trpc.incomeExpense.upcomingWithdrawals.query({ days: 7 }),
          ]);

        const result = {
          thisMonth: {
            month: thisMonthSummary.month,
            totalJpy: thisMonthSummary.grandTotal,
            creditCards: ccBalanceStatus.summary.filter((item) =>
              item.withdrawalDate.startsWith(thisMonth)
            ),
            fixedExpenses: [] as unknown[],
          },
          nextMonth: {
            month: nextMonthSummary.month,
            totalJpy: nextMonthSummary.grandTotal,
            creditCards: ccBalanceStatus.summary.filter((item) =>
              item.withdrawalDate.startsWith(nextMonth)
            ),
            fixedExpenses: [] as unknown[],
          },
          accountBalances: ccBalanceStatus.summary.map((item) => ({
            cardName: item.cardName,
            withdrawalDate: item.withdrawalDate,
            amountJpy: item.amountJpy,
            accountName: item.accountName,
            accountBalanceJpy: item.accountBalanceJpy,
            shortfallJpy: item.shortfallJpy,
            isInsufficient: item.isInsufficient,
          })),
          shortfalls: ccBalanceStatus.summary
            .filter((item) => item.isInsufficient)
            .map((item) => ({
              cardName: item.cardName,
              withdrawalDate: item.withdrawalDate,
              amountJpy: item.amountJpy,
              accountName: item.accountName,
              accountBalanceJpy: item.accountBalanceJpy,
              shortfallJpy: item.shortfallJpy,
            })),
          urgentWithin7Days: upcomingResult.withdrawals,
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    }
  );
}
