import datetime
import discord
from discord.ext import tasks
import io
import logging
import os

logger = logging.getLogger(__name__)

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000/api")
API_KEY = os.getenv("API_KEY", "")
CHANNEL_ID = int(os.getenv("DISCORD_CHANNEL_ID", "0"))


def _headers() -> dict:
    return {"X-API-Key": API_KEY}


class MorningReportTask:
    def __init__(self, bot):
        self.bot = bot

    def start(self):
        self._loop.start()

    @tasks.loop(time=datetime.time(hour=22, minute=30, tzinfo=datetime.timezone.utc))  # 7:30 JST = 22:30 UTC
    async def _loop(self):
        await self._send_report()

    @_loop.before_loop
    async def _before_loop(self):
        await self.bot.wait_until_ready()

    async def _send_report(self):
        if not CHANNEL_ID:
            logger.warning("DISCORD_CHANNEL_ID が設定されていません")
            return

        channel = self.bot.get_channel(CHANNEL_ID)
        if not channel:
            logger.error(f"チャンネル {CHANNEL_ID} が見つかりません")
            return

        try:
            import httpx
            import sys
            sys.path.insert(0, ".")

            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.get(f"{API_BASE}/portfolio/summary", headers=_headers())
                summary = r.json()

            # Embed 1: 総資産
            diff_jpy = summary.get("prev_day_diff_jpy", 0)
            diff_pct = summary.get("prev_day_diff_pct", 0)
            color = discord.Color.green() if diff_jpy >= 0 else discord.Color.red()
            sign = "+" if diff_jpy >= 0 else ""

            embed1 = discord.Embed(title="📊 おはよう！本日の資産状況", color=color)
            embed1.add_field(name="総資産", value=f"¥{summary.get('total_jpy', 0):,.0f}", inline=False)
            embed1.add_field(name="前日比", value=f"{sign}¥{diff_jpy:,.0f} ({sign}{diff_pct:.2f}%)", inline=False)

            # Embed 2: 含み損益
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{API_BASE}/insights/pnl-ranking", params={"top": 3}, headers=_headers())
                pnl_data = r.json()

            ranking = pnl_data.get("ranking", [])
            embed2 = discord.Embed(title="📈 注目銘柄", color=discord.Color.gold())
            for item in ranking[:6]:
                pnl = item.get("unrealized_pnl_jpy", 0)
                pnl_pct = item.get("unrealized_pnl_pct", 0)
                s = "+" if pnl >= 0 else ""
                emoji = "📈" if pnl >= 0 else "📉"
                embed2.add_field(
                    name=f"{emoji} {item.get('name', '')[:20]}",
                    value=f"{s}¥{pnl:,.0f} ({s}{pnl_pct:.1f}%)",
                    inline=True,
                )

            # Embed 3: AI コメント
            from apps.api.src.core.reporter import ReportGenerator
            reporter = ReportGenerator()
            report_text = reporter.generate_daily_report()
            embed3 = discord.Embed(title="🤖 AI コメント", description=report_text[:2000], color=discord.Color.blue())

            # 資産推移グラフ
            chart_bytes = reporter.generate_portfolio_chart(days=30)
            file = discord.File(io.BytesIO(chart_bytes), filename="portfolio.png")
            embed3.set_image(url="attachment://portfolio.png")

            await channel.send(embeds=[embed1, embed2, embed3], file=file)
            logger.info("朝次レポート送信完了")

        except Exception as e:
            logger.error(f"朝次レポートエラー: {e}")
