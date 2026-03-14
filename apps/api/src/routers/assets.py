from fastapi import APIRouter, Depends, HTTPException, Header
from datetime import date
from typing import Optional
from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import AssetRepository, SnapshotRepository
from ..db.models import AssetType

router = APIRouter(prefix="/assets", tags=["assets"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


@router.get("")
def get_assets(asset_type: Optional[str] = None, _: None = Depends(verify_api_key)) -> list[dict]:
    with db_session() as db:
        asset_repo = AssetRepository(db)
        snapshot_repo = SnapshotRepository(db)

        at = AssetType(asset_type) if asset_type else None
        assets = asset_repo.get_all(asset_type=at)
        today = date.today()

        result = []
        for asset in assets:
            snap = snapshot_repo.get_by_asset_date(asset.id, today)
            result.append({
                "id": asset.id,
                "symbol": asset.symbol,
                "name": asset.name,
                "asset_type": asset.asset_type.value,
                "exchange": asset.exchange,
                "currency": asset.currency,
                "quantity": snap.quantity if snap else 0,
                "price_jpy": snap.price_jpy if snap else 0,
                "value_jpy": snap.value_jpy if snap else 0,
                "cost_basis_jpy": snap.cost_basis_jpy if snap else 0,
                "cost_per_unit_jpy": round((snap.cost_basis_jpy / snap.quantity), 0) if snap and snap.quantity and snap.quantity > 0 else 0,
                "unrealized_pnl_jpy": snap.unrealized_pnl_jpy if snap else 0,
                "unrealized_pnl_pct": snap.unrealized_pnl_pct if snap else 0,
            })
        return result


@router.get("/{asset_id}/history")
def get_asset_history(asset_id: int, days: int = 30, _: None = Depends(verify_api_key)) -> list[dict]:
    with db_session() as db:
        repo = SnapshotRepository(db)
        history = repo.get_history(asset_id, days=days)
        return [
            {
                "date": h.date.isoformat(),
                "value_jpy": h.value_jpy,
                "unrealized_pnl_jpy": h.unrealized_pnl_jpy,
                "unrealized_pnl_pct": h.unrealized_pnl_pct,
            }
            for h in history
        ]
