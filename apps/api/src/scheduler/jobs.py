import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Tokyo")


def setup_scheduler() -> AsyncIOScheduler:
    # 毎日 6:00 JST: スクレイプ実行
    scheduler.add_job(
        _scrape_job,
        CronTrigger(hour=6, minute=0),
        id="daily_scrape",
        replace_existing=True,
    )
    # 毎日 6:30 JST: yfinance 株価更新
    scheduler.add_job(
        _update_prices_job,
        CronTrigger(hour=6, minute=30),
        id="update_prices",
        replace_existing=True,
    )
    return scheduler


async def _scrape_job() -> None:
    logger.info("スケジュールスクレイプ開始")
    try:
        import sys
        sys.path.insert(0, ".")
        from apps.crawler.src.scrapers.mf_sbi_bank import MFSBIScraper
        async with MFSBIScraper(headless=True) as scraper:
            await scraper.run_with_retry()
        logger.info("スケジュールスクレイプ完了")
    except Exception as e:
        logger.error(f"スケジュールスクレイプエラー: {e}")


async def _update_prices_job() -> None:
    logger.info("株価更新開始")
    try:
        from ..db.database import db_session
        from ..db.repositories import AssetRepository
        from ..data_sources.yfinance_client import get_current_price
        from ..db.models import AssetType

        with db_session() as db:
            asset_repo = AssetRepository(db)
            assets = asset_repo.get_all()
            for asset in assets:
                if asset.asset_type in (AssetType.STOCK_JP, AssetType.STOCK_US):
                    price = get_current_price(asset.symbol)
                    if price:
                        logger.debug(f"{asset.symbol}: ¥{price:,.0f}")
        logger.info("株価更新完了")
    except Exception as e:
        logger.error(f"株価更新エラー: {e}")
