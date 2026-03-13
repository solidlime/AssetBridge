import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Tokyo")


def setup_scheduler() -> AsyncIOScheduler:
    """スケジューラーを初期化してジョブを登録する。

    スクレイプ時刻は DB の scrape_hour / scrape_minute から読み込む。
    DB 未設定の場合は毎日 6:00 JST を使用する。
    """
    hour, minute = _load_scrape_schedule()

    scheduler.add_job(
        _scrape_job,
        CronTrigger(hour=hour, minute=minute),
        id="daily_scrape",
        replace_existing=True,
    )
    # 株価更新はスクレイプの 30 分後に実行する（スクレイプ完了待ちのため）
    update_minute = (minute + 30) % 60
    scheduler.add_job(
        _update_prices_job,
        CronTrigger(hour=hour, minute=update_minute),
        id="update_prices",
        replace_existing=True,
    )
    return scheduler


def reschedule_scrape(hour: int, minute: int) -> None:
    """スクレイプ時刻を即時変更する。settings PUT API から呼ぶ。

    スケジューラーが起動中でない場合は何もしない。
    """
    if not scheduler.running:
        return

    update_minute = (minute + 30) % 60
    scheduler.reschedule_job(
        "daily_scrape",
        trigger=CronTrigger(hour=hour, minute=minute),
    )
    scheduler.reschedule_job(
        "update_prices",
        trigger=CronTrigger(hour=hour, minute=update_minute),
    )
    logger.info("スクレイプスケジュール変更: %02d:%02d JST", hour, minute)


def _load_scrape_schedule() -> tuple[int, int]:
    """DB からスクレイプ時刻を読み込む。失敗した場合はデフォルト 6:00 を返す。"""
    try:
        from ..db.database import db_session
        from ..db.repositories import AppSettingsRepository
        with db_session() as db:
            repo = AppSettingsRepository(db)
            sched = repo.get_scrape_schedule()
            return sched["hour"], sched["minute"]
    except Exception:
        return 6, 0


async def _scrape_job() -> None:
    logger.info("スケジュールスクレイプ開始")
    try:
        from apps.crawler.src.scrapers.mf_sbi_bank import MFSBIScraper
        async with MFSBIScraper(headless=True) as scraper:
            await scraper.run_with_retry()
        logger.info("スケジュールスクレイプ完了")
    except Exception as e:
        logger.error("スケジュールスクレイプエラー: %s", e)


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
                        logger.debug("%s: ¥%,.0f", asset.symbol, price)
        logger.info("株価更新完了")
    except Exception as e:
        logger.error("株価更新エラー: %s", e)
