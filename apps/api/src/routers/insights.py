from fastapi import APIRouter, Depends, HTTPException, Header
from ..config.settings import settings
from ..core.analyzer import PortfolioAnalyzer

router = APIRouter(prefix="/insights", tags=["insights"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


@router.get("/allocation")
def get_allocation(_: None = Depends(verify_api_key)) -> dict:
    analyzer = PortfolioAnalyzer()
    return {"allocations": analyzer.get_sector_allocation()}


@router.get("/pnl-ranking")
def get_pnl_ranking(top: int = 10, _: None = Depends(verify_api_key)) -> dict:
    analyzer = PortfolioAnalyzer()
    return {"ranking": analyzer.get_unrealized_pnl_ranking(top=top)}
