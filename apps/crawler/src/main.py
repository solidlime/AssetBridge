#!/usr/bin/env python3
import asyncio
import argparse
import logging
import sys
import os

# プロジェクトルートを sys.path に追加して絶対 import を有効化
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from apps.crawler.src.scrapers.mf_sbi_bank import MFSBIScraper

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def run_once(headless: bool = True) -> dict | None:
    async with MFSBIScraper(headless=headless) as scraper:
        result = await scraper.run_with_retry()
    if result:
        logger.info("スクレイプ完了")
    else:
        logger.error("スクレイプ失敗")
    return result


async def run_scheduled() -> None:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import]

    scheduler = AsyncIOScheduler(timezone="Asia/Tokyo")
    scheduler.add_job(run_once, "cron", hour=6, minute=0)
    scheduler.start()
    logger.info("スケジューラ起動（毎日 6:00 JST）")
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser(description="AssetBridge Crawler")
    parser.add_argument("--once", action="store_true", help="1回だけ実行")
    parser.add_argument("--schedule", action="store_true", help="スケジュール実行")
    parser.add_argument("--headful", action="store_true", help="ブラウザを表示")
    args = parser.parse_args()

    headless = not args.headful

    if args.schedule:
        asyncio.run(run_scheduled())
    else:
        # --once も未指定もデフォルトで1回実行
        asyncio.run(run_once(headless=headless))


if __name__ == "__main__":
    main()
