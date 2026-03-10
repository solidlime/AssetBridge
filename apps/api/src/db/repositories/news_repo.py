from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from datetime import datetime, timedelta
from typing import Optional
from ..models import NewsCache, ScrapeLog, ScrapeStatus, Sentiment


class NewsCacheRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_valid(self, symbol: str, limit: int = 5) -> list[NewsCache]:
        now = datetime.utcnow()
        stmt = (
            select(NewsCache)
            .where(
                NewsCache.symbol == symbol,
                NewsCache.expires_at > now,
            )
            .order_by(NewsCache.published_at.desc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())

    def save(self, symbol: str, title: str, url: str,
             published_at: datetime | None = None, source: str | None = None,
             summary: str | None = None, sentiment: Sentiment = Sentiment.NEUTRAL,
             ttl_hours: int = 24) -> NewsCache:
        # 期限切れキャッシュを削除
        self.delete_expired()

        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        news = NewsCache(
            symbol=symbol,
            title=title,
            url=url,
            published_at=published_at,
            source=source,
            summary=summary,
            sentiment=sentiment,
            expires_at=expires_at,
        )
        self.db.add(news)
        self.db.flush()
        return news

    def delete_expired(self) -> int:
        now = datetime.utcnow()
        stmt = delete(NewsCache).where(NewsCache.expires_at <= now)
        result = self.db.execute(stmt)
        return result.rowcount

    def has_valid_cache(self, symbol: str) -> bool:
        now = datetime.utcnow()
        stmt = select(NewsCache.id).where(
            NewsCache.symbol == symbol,
            NewsCache.expires_at > now,
        ).limit(1)
        return self.db.execute(stmt).scalar_one_or_none() is not None


class ScrapeLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_latest(self) -> Optional[ScrapeLog]:
        stmt = select(ScrapeLog).order_by(ScrapeLog.started_at.desc()).limit(1)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_recent(self, limit: int = 10) -> list[ScrapeLog]:
        stmt = select(ScrapeLog).order_by(ScrapeLog.started_at.desc()).limit(limit)
        return list(self.db.execute(stmt).scalars().all())

    def start(self) -> ScrapeLog:
        log = ScrapeLog(
            started_at=datetime.utcnow(),
            status=ScrapeStatus.RUNNING,
        )
        self.db.add(log)
        self.db.flush()
        return log

    def finish(self, log_id: int, records_saved: int = 0,
               error_message: str | None = None,
               screenshot_path: str | None = None) -> Optional[ScrapeLog]:
        log = self.db.get(ScrapeLog, log_id)
        if not log:
            return None
        log.finished_at = datetime.utcnow()
        log.status = ScrapeStatus.FAILED if error_message else ScrapeStatus.SUCCESS
        log.records_saved = records_saved
        log.error_message = error_message
        log.screenshot_path = screenshot_path
        self.db.flush()
        return log
