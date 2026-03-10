from fastapi import APIRouter, Depends, HTTPException, Header
from datetime import date
from typing import Optional
from ..config.settings import settings
from ..core.analyzer import PortfolioAnalyzer
from ..db.database import db_session
from ..db.repositories import DailyTotalRepository

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


@router.get("/summary")
def get_summary(date_str: Optional[str] = None, _: None = Depends(verify_api_key)) -> dict:
    analyzer = PortfolioAnalyzer()
    target = date.fromisoformat(date_str) if date_str else None
    return analyzer.analyze_portfolio(target)


@router.get("/history")
def get_history(days: int = 30, _: None = Depends(verify_api_key)) -> list[dict]:
    with db_session() as db:
        repo = DailyTotalRepository(db)
        history = repo.get_history(days=days)
        return [
            {
                "date": h.date.isoformat(),
                "total_jpy": h.total_jpy,
                "prev_day_diff_jpy": h.prev_day_diff_jpy,
                "prev_day_diff_pct": h.prev_day_diff_pct,
            }
            for h in history
        ]
