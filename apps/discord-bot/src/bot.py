import discord
from discord.ext import commands
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../.."))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree


@bot.event
async def on_ready():
    logger.info(f"ログイン: {bot.user} (ID: {bot.user.id})")
    await tree.sync()
    logger.info("スラッシュコマンド同期完了")

    # タスク起動
    from .tasks.morning_report import MorningReportTask
    task = MorningReportTask(bot)
    task.start()


async def load_cogs():
    from .cogs.portfolio_cog import PortfolioCog
    from .cogs.report_cog import ReportCog
    from .cogs.ask_cog import AskCog
    await bot.add_cog(PortfolioCog(bot))
    await bot.add_cog(ReportCog(bot))
    await bot.add_cog(AskCog(bot))


def main():
    import asyncio

    async def runner():
        await load_cogs()
        token = os.getenv("DISCORD_TOKEN", "")
        if not token:
            logger.error("DISCORD_TOKEN が設定されていません")
            return
        await bot.start(token)

    asyncio.run(runner())


if __name__ == "__main__":
    main()
