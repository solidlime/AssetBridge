from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from datetime import date, timedelta
from typing import Optional
from ..models import PortfolioSnapshot, DailyTotal


class SnapshotRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_asset_date(self, asset_id: int, snapshot_date: date) -> Optional[PortfolioSnapshot]:
        stmt = select(PortfolioSnapshot).where(
            PortfolioSnapshot.asset_id == asset_id,
            PortfolioSnapshot.date == snapshot_date,
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_date(self, snapshot_date: date) -> list[PortfolioSnapshot]:
        stmt = (
            select(PortfolioSnapshot)
            .where(PortfolioSnapshot.date == snapshot_date)
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_history(self, asset_id: int, days: int = 30) -> list[PortfolioSnapshot]:
        since = date.today() - timedelta(days=days)
        stmt = (
            select(PortfolioSnapshot)
            .where(
                PortfolioSnapshot.asset_id == asset_id,
                PortfolioSnapshot.date >= since,
            )
            .order_by(PortfolioSnapshot.date)
        )
        return list(self.db.execute(stmt).scalars().all())

    def upsert(self, asset_id: int, snapshot_date: date, **kwargs) -> PortfolioSnapshot:
        existing = self.get_by_asset_date(asset_id, snapshot_date)
        if existing:
            for k, v in kwargs.items():
                setattr(existing, k, v)
            self.db.flush()
            return existing

        snapshot = PortfolioSnapshot(asset_id=asset_id, date=snapshot_date, **kwargs)
        self.db.add(snapshot)
        self.db.flush()
        return snapshot


class DailyTotalRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_date(self, total_date: date) -> Optional[DailyTotal]:
        stmt = select(DailyTotal).where(DailyTotal.date == total_date)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_latest(self) -> Optional[DailyTotal]:
        stmt = select(DailyTotal).order_by(desc(DailyTotal.date)).limit(1)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_history(self, days: int = 30) -> list[DailyTotal]:
        since = date.today() - timedelta(days=days)
        stmt = (
            select(DailyTotal)
            .where(DailyTotal.date >= since)
            .order_by(DailyTotal.date)
        )
        return list(self.db.execute(stmt).scalars().all())

    def upsert(self, total_date: date, **kwargs) -> DailyTotal:
        existing = self.get_by_date(total_date)
        if existing:
            for k, v in kwargs.items():
                setattr(existing, k, v)
            self.db.flush()
            return existing

        total = DailyTotal(date=total_date, **kwargs)
        self.db.add(total)
        self.db.flush()
        return total
