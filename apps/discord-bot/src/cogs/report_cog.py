import discord
from discord import app_commands
from discord.ext import commands
import httpx
import os

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000/api")
API_KEY = os.getenv("API_KEY", "")


def _headers() -> dict:
    return {"X-API-Key": API_KEY}


class ReportCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="scrape", description="手動スクレイプを実行（オーナーのみ）")
    @commands.is_owner()
    async def scrape(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(f"{API_BASE}/scrape/trigger", headers=_headers())
                r.raise_for_status()
            await interaction.followup.send("スクレイプを開始しました。`/scrape_status` で状況を確認できます。", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}", ephemeral=True)

    @app_commands.command(name="analyze", description="AIポートフォリオ分析レポートを生成")
    @app_commands.describe(focus="分析フォーカス（例: 日本株、リスク、全体）")
    async def analyze(self, interaction: discord.Interaction, focus: str = "全体"):
        await interaction.response.defer()
        try:
            import sys
            sys.path.insert(0, ".")
            from apps.api.src.core.reporter import ReportGenerator

            reporter = ReportGenerator()
            report = reporter.generate_daily_report()

            embed = discord.Embed(
                title=f"🤖 AIポートフォリオ分析（{focus}）",
                description=report[:4000],
                color=discord.Color.blue(),
            )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")
