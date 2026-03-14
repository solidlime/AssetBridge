import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Header

from ..config.settings import settings
from ..core.dividend_calculator import get_dividend_summary
from ..db.database import db_session
from ..db.models import AssetType
from ..db.repositories import AssetRepository, SnapshotRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dividends", tags=["dividends"])

_CACHE_TTL = timedelta(hours=24)
_cache: dict[str, tuple[dict, datetime]] = {}


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


@router.get("/summary")
async def get_dividend_summary_endpoint(_: None = Depends(verify_api_key)) -> dict:
    """配当予想サマリーを返す（24時間キャッシュ）。"""
    cache_key = "dividend_summary"
    if cache_key in _cache:
        data, expires_at = _cache[cache_key]
        if datetime.utcnow() < expires_at:
            return data

    today = date.today()
    with db_session() as db:
        asset_repo = AssetRepository(db)
        snapshot_repo = SnapshotRepository(db)

        assets_jp = asset_repo.get_all(asset_type=AssetType.STOCK_JP)
        assets_us = asset_repo.get_all(asset_type=AssetType.STOCK_US)
        all_assets = list(assets_jp) + list(assets_us)

        asset_dicts = []
        for asset in all_assets:
            snap = snapshot_repo.get_by_asset_date(asset.id, today)
            asset_dicts.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "asset_type": asset.asset_type.value,
                "value_jpy": float(snap.value_jpy) if snap else 0.0,
                "quantity": float(snap.quantity) if snap else 0.0,
            })

    result = await get_dividend_summary(asset_dicts)
    _cache[cache_key] = (result, datetime.utcnow() + _CACHE_TTL)
    return result
