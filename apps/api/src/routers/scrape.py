import asyncio
from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks
from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import ScrapeLogRepository

router = APIRouter(prefix="/scrape", tags=["scrape"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


async def _run_scrape() -> None:
    """バックグラウンドでスクレイプを実行"""
    try:
        import sys
        sys.path.insert(0, ".")
        from apps.crawler.src.scrapers.mf_sbi_bank import MFSBIScraper
        async with MFSBIScraper(headless=True) as scraper:
            await scraper.run_with_retry()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"スクレイプエラー: {e}")


@router.post("/trigger")
def trigger_scrape(background_tasks: BackgroundTasks, _: None = Depends(verify_api_key)) -> dict:
    with db_session() as db:
        repo = ScrapeLogRepository(db)
        latest = repo.get_latest()
        if latest and latest.status.value == "running":
            raise HTTPException(status_code=409, detail="スクレイプが既に実行中です")

    background_tasks.add_task(asyncio.run, _run_scrape())
    return {"message": "スクレイプを開始しました"}


@router.get("/status")
def get_scrape_status(_: None = Depends(verify_api_key)) -> dict:
    with db_session() as db:
        repo = ScrapeLogRepository(db)
        latest = repo.get_latest()
        recent = repo.get_recent(limit=5)

        return {
            "latest": {
                "id": latest.id,
                "started_at": latest.started_at.isoformat(),
                "finished_at": latest.finished_at.isoformat() if latest.finished_at else None,
                "status": latest.status.value,
                "records_saved": latest.records_saved,
                "error_message": latest.error_message,
            } if latest else None,
            "is_running": latest.status.value == "running" if latest else False,
            "recent": [
                {
                    "id": log.id,
                    "started_at": log.started_at.isoformat(),
                    "status": log.status.value,
                    "records_saved": log.records_saved,
                }
                for log in recent
            ],
        }
