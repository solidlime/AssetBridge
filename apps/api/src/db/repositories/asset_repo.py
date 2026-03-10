from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional
from ..models import Asset, AssetType


class AssetRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, asset_id: int) -> Optional[Asset]:
        return self.db.get(Asset, asset_id)

    def get_by_symbol(self, symbol: str, asset_type: AssetType | None = None) -> Optional[Asset]:
        stmt = select(Asset).where(Asset.symbol == symbol)
        if asset_type:
            stmt = stmt.where(Asset.asset_type == asset_type)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_all(self, asset_type: AssetType | None = None) -> list[Asset]:
        stmt = select(Asset)
        if asset_type:
            stmt = stmt.where(Asset.asset_type == asset_type)
        return list(self.db.execute(stmt).scalars().all())

    def upsert(self, symbol: str, name: str, asset_type: AssetType,
               exchange: str | None = None, currency: str = "JPY") -> Asset:
        existing = self.get_by_symbol(symbol, asset_type)
        if existing:
            existing.name = name
            if exchange:
                existing.exchange = exchange
            existing.currency = currency
            self.db.flush()
            return existing

        asset = Asset(
            symbol=symbol,
            name=name,
            asset_type=asset_type,
            exchange=exchange,
            currency=currency,
        )
        self.db.add(asset)
        self.db.flush()
        return asset

    def delete(self, asset_id: int) -> bool:
        asset = self.get_by_id(asset_id)
        if not asset:
            return False
        self.db.delete(asset)
        self.db.flush()
        return True
