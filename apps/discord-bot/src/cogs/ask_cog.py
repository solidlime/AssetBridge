import discord
from discord import app_commands
from discord.ext import commands
import httpx
import os

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000/api")
API_KEY = os.getenv("API_KEY", "")


def _headers() -> dict:
    return {"X-API-Key": API_KEY}


class AskCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="ask", description="AIにポートフォリオについて質問する")
    @app_commands.describe(question="質問内容")
    async def ask(self, interaction: discord.Interaction, question: str):
        await interaction.response.defer()
        try:
            import sys
            sys.path.insert(0, ".")
            from apps.api.src.core import llm_client

            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{API_BASE}/portfolio/summary", headers=_headers())
                summary = r.json() if r.status_code == 200 else {}

            context = f"総資産: ¥{summary.get('total_jpy', 0):,.0f}, 前日比: {summary.get('prev_day_diff_pct', 0):.2f}%"

            answer = await llm_client.chat([
                {"role": "system", "content": f"あなたはポートフォリオアドバイザーです。現在のポートフォリオ情報: {context}"},
                {"role": "user", "content": question},
            ])

            embed = discord.Embed(
                title=f"💬 Q: {question[:100]}",
                description=answer[:4000],
                color=discord.Color.green(),
            )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")

    @app_commands.command(name="news", description="銘柄ニュースを表示")
    @app_commands.describe(symbol="銘柄コード（例: 7203, BTC）")
    async def news(self, interaction: discord.Interaction, symbol: str):
        await interaction.response.defer()
        try:
            import sys
            sys.path.insert(0, ".")
            from apps.api.src.data_sources.news_client import get_news

            items = get_news(symbol, limit=5)

            embed = discord.Embed(title=f"📰 {symbol} ニュース", color=discord.Color.orange())
            if not items:
                embed.description = "ニュースが見つかりませんでした。"
            else:
                for item in items:
                    embed.add_field(
                        name=item.get("title", "")[:50],
                        value=f"[記事を読む]({item.get('url', '#')})\n{item.get('source', '')}",
                        inline=False,
                    )

            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")
