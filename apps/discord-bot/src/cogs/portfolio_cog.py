import discord
from discord import app_commands
from discord.ext import commands
import httpx
import io
import os

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000/api")
API_KEY = os.getenv("API_KEY", "")


def _headers() -> dict:
    return {"X-API-Key": API_KEY}


async def _get(path: str, params: dict | None = None):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{API_BASE}{path}", params=params, headers=_headers())
        r.raise_for_status()
        return r.json()


class PortfolioCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="portfolio", description="今日の総資産サマリーを表示")
    async def portfolio(self, interaction: discord.Interaction):
        await interaction.response.defer()
        try:
            data = await _get("/portfolio/summary")
            diff_jpy = data.get("prev_day_diff_jpy", 0)
            diff_pct = data.get("prev_day_diff_pct", 0)
            color = discord.Color.green() if diff_jpy >= 0 else discord.Color.red()
            sign = "+" if diff_jpy >= 0 else ""

            embed = discord.Embed(title="📊 資産サマリー", color=color)
            embed.add_field(name="総資産", value=f"¥{data.get('total_jpy', 0):,.0f}", inline=False)
            embed.add_field(name="前日比", value=f"{sign}¥{diff_jpy:,.0f} ({sign}{diff_pct:.2f}%)", inline=False)

            breakdown = data.get("breakdown", {})
            if breakdown:
                lines = [
                    f"日本株: ¥{breakdown.get('stock_jp_jpy', 0):,.0f}",
                    f"米国株: ¥{breakdown.get('stock_us_jpy', 0):,.0f}",
                    f"投資信託: ¥{breakdown.get('fund_jpy', 0):,.0f}",
                    f"暗号資産: ¥{breakdown.get('crypto_jpy', 0):,.0f}",
                    f"現金: ¥{breakdown.get('cash_jpy', 0):,.0f}",
                ]
                embed.add_field(name="内訳", value="\n".join(lines), inline=False)

            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")

    @app_commands.command(name="holdings", description="保有銘柄一覧を表示")
    @app_commands.describe(type="資産種別 (stock_jp/stock_us/fund/crypto/all)")
    async def holdings(self, interaction: discord.Interaction, type: str = "all"):
        await interaction.response.defer()
        try:
            params = {} if type == "all" else {"asset_type": type}
            data = await _get("/assets", params)

            embed = discord.Embed(title=f"💼 保有銘柄 ({type})", color=discord.Color.blue())
            for item in data[:10]:  # 最大10件
                pnl = item.get("unrealized_pnl_jpy", 0)
                pnl_pct = item.get("unrealized_pnl_pct", 0)
                sign = "+" if pnl >= 0 else ""
                embed.add_field(
                    name=f"{item['symbol']} {item['name'][:15]}",
                    value=f"¥{item['value_jpy']:,.0f} ({sign}{pnl_pct:.1f}%)",
                    inline=True,
                )

            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")

    @app_commands.command(name="pnl", description="含み損益ランキングを表示")
    @app_commands.describe(top="表示件数")
    async def pnl(self, interaction: discord.Interaction, top: int = 10):
        await interaction.response.defer()
        try:
            data = await _get("/insights/pnl-ranking", {"top": top})
            ranking = data.get("ranking", [])

            embed = discord.Embed(title=f"📈 含み損益ランキング TOP{top}", color=discord.Color.gold())
            for i, item in enumerate(ranking[:10], 1):
                pnl = item.get("unrealized_pnl_jpy", 0)
                pnl_pct = item.get("unrealized_pnl_pct", 0)
                sign = "+" if pnl >= 0 else ""
                emoji = "📈" if pnl >= 0 else "📉"
                embed.add_field(
                    name=f"{i}. {item.get('name', '')[:20]}",
                    value=f"{emoji} {sign}¥{pnl:,.0f} ({sign}{pnl_pct:.1f}%)",
                    inline=False,
                )

            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")

    @app_commands.command(name="income", description="月別収支サマリーを表示")
    @app_commands.describe(months="表示月数")
    async def income(self, interaction: discord.Interaction, months: int = 3):
        await interaction.response.defer()
        try:
            data = await _get("/income-expense", {"months": months})

            embed = discord.Embed(title=f"💰 収支サマリー（直近{months}ヶ月）", color=discord.Color.teal())
            embed.add_field(name="平均収入", value=f"¥{data.get('avg_income_jpy', 0):,.0f}/月", inline=True)
            embed.add_field(name="平均支出", value=f"¥{data.get('avg_expense_jpy', 0):,.0f}/月", inline=True)
            embed.add_field(name="平均純収支", value=f"¥{data.get('avg_net_jpy', 0):,.0f}/月", inline=True)

            for cf in data.get("data", [])[-3:]:
                ym = cf["year_month"]
                net = cf["net_jpy"]
                sign = "+" if net >= 0 else ""
                embed.add_field(
                    name=f"{ym[:4]}/{ym[4:]}",
                    value=f"収入: ¥{cf['income_jpy']:,.0f}\n支出: ¥{cf['expense_jpy']:,.0f}\n純収支: {sign}¥{net:,.0f}",
                    inline=True,
                )

            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")

    @app_commands.command(name="history", description="資産推移グラフを表示")
    @app_commands.describe(days="表示日数")
    async def history(self, interaction: discord.Interaction, days: int = 30):
        await interaction.response.defer()
        try:
            import sys
            sys.path.insert(0, ".")
            from apps.api.src.core.reporter import ReportGenerator

            reporter = ReportGenerator()
            chart_bytes = reporter.generate_portfolio_chart(days=days)

            file = discord.File(io.BytesIO(chart_bytes), filename="portfolio.png")
            embed = discord.Embed(title=f"📊 資産推移（直近{days}日）", color=discord.Color.purple())
            embed.set_image(url="attachment://portfolio.png")

            await interaction.followup.send(embed=embed, file=file)
        except Exception as e:
            await interaction.followup.send(f"エラー: {e}")
