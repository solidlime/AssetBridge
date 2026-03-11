from fastapi import APIRouter, Depends, Header, HTTPException
from ..config.settings import settings
from ..core.ai_comments import generate_portfolio_comment, generate_pnl_comment, clear_cache

router = APIRouter(prefix="/ai", tags=["ai"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    """X-Api-Key ヘッダーが settings.API_KEY と一致しない場合は 403 を返す。"""
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


@router.get("/comments/portfolio")
async def get_portfolio_comment(_: None = Depends(verify_api_key)) -> dict:
    """総資産サマリーに対する AI コメントを返す。キャッシュが有効な間は DB/LLM アクセスなし。"""
    comment = await generate_portfolio_comment()
    return {"comment": comment}


@router.get("/comments/pnl")
async def get_pnl_comment(_: None = Depends(verify_api_key)) -> dict:
    """含み損益上位5銘柄に対する AI コメントを返す。キャッシュが有効な間は DB/LLM アクセスなし。"""
    comment = await generate_pnl_comment()
    return {"comment": comment}


@router.post("/comments/refresh")
async def refresh_comments(_: None = Depends(verify_api_key)) -> dict:
    """キャッシュを強制クリアして両コメントを再生成する。スクレイプ後の即時反映に使う。"""
    clear_cache()
    portfolio_comment = await generate_portfolio_comment()
    pnl_comment = await generate_pnl_comment()
    return {
        "portfolio": portfolio_comment,
        "pnl": pnl_comment,
    }
