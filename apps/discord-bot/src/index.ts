import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import cron from "node-cron";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@assetbridge/api/router";
import { loadEnv } from "./env";

loadEnv();

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const API_KEY = process.env.API_KEY ?? "";

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers: { "X-API-Key": API_KEY },
    }),
  ],
});

async function getSettings(): Promise<{ token: string; channelId: string }> {
  const token = process.env.DISCORD_TOKEN ?? "";
  const channelId = process.env.DISCORD_CHANNEL_ID ?? "";
  return { token, channelId };
}

function formatJpy(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

async function sendMorningReport(client: Client, channelId: string): Promise<void> {
  try {
    const snapshot = await trpc.portfolio.snapshot.query({});

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error("[discord] Channel not found or not text-based");
      return;
    }

    const diffSign = snapshot.prevDiffJpy >= 0 ? "📈" : "📉";
    const color = snapshot.prevDiffJpy >= 0 ? 0x22c55e : 0xef4444;

    const embed = new EmbedBuilder()
      .setTitle(`${diffSign} 朝の資産レポート`)
      .setColor(color)
      .setTimestamp()
      .addFields(
        {
          name: "💰 総資産",
          value: formatJpy(snapshot.totalJpy),
          inline: true,
        },
        {
          name: "📊 前日比",
          value: `${formatJpy(snapshot.prevDiffJpy)} (${formatPct(snapshot.prevDiffPct)})`,
          inline: true,
        },
        {
          name: "🏦 アセット配分",
          value: [
            `日本株: ${formatJpy(snapshot.breakdown.stockJpJpy)}`,
            `米国株: ${formatJpy(snapshot.breakdown.stockUsJpy)}`,
            `投資信託: ${formatJpy(snapshot.breakdown.fundJpy)}`,
            `現金: ${formatJpy(snapshot.breakdown.cashJpy)}`,
          ].join("\n"),
          inline: false,
        },
      );

    if (snapshot.topGainers.length > 0) {
      embed.addFields({
        name: "🚀 含み益 Top 3",
        value: snapshot.topGainers
          .slice(0, 3)
          .map(h => `${h.name}: ${formatPct(h.unrealizedPnlPct)}`)
          .join("\n"),
        inline: true,
      });
    }

    if (snapshot.topLosers.length > 0) {
      embed.addFields({
        name: "📉 含み損 Bottom 3",
        value: snapshot.topLosers
          .slice(0, 3)
          .map(h => `${h.name}: ${formatPct(h.unrealizedPnlPct)}`)
          .join("\n"),
        inline: true,
      });
    }

    await (channel as any).send({ embeds: [embed] });
    console.log("[discord] Morning report sent");
  } catch (e) {
    console.error("[discord] Failed to send report:", e);
  }
}

async function main(): Promise<void> {
  const { token, channelId } = await getSettings();

  if (!token) {
    console.error("[discord] DISCORD_TOKEN not set. Exiting.");
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once("ready", () => {
    console.log(`[discord] Logged in as ${client.user?.tag}`);

    // 毎朝 7:00 JST に朝レポート
    cron.schedule("0 7 * * *", () => sendMorningReport(client, channelId), {
      timezone: "Asia/Tokyo",
    });

    console.log("[discord] Scheduled morning report at 07:00 JST");
  });

  await client.login(token);
}

main().catch(e => {
  console.error("[discord] Fatal:", e);
  process.exit(1);
});
