from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import AppSettingsRepository

router = APIRouter(prefix="/settings", tags=["settings"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    """X-Api-Key ヘッダーが settings.API_KEY と一致しない場合は 403 を返す。"""
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


class SystemPromptPayload(BaseModel):
    prompt: str


class ScrapeSchedulePayload(BaseModel):
    hour: int    # 0-23
    minute: int  # 0-59


class AiCommentTtlPayload(BaseModel):
    hours: int  # 1-24


@router.get("/system-prompt")
def get_system_prompt(_: None = Depends(verify_api_key)) -> dict:
    """現在の LLM システムプロンプトを返す。DB 未設定の場合はデフォルト値を返す。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        return {"prompt": repo.get_system_prompt()}


@router.put("/system-prompt")
def update_system_prompt(
    payload: SystemPromptPayload,
    _: None = Depends(verify_api_key),
) -> dict:
    """LLM システムプロンプトを更新する。変更は即時 DB に反映され、次回のコメント生成から有効になる。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        repo.set_system_prompt(payload.prompt)
    return {"status": "ok", "prompt": payload.prompt}


@router.get("/scrape-schedule")
def get_scrape_schedule(_: None = Depends(verify_api_key)) -> dict:
    """現在のスクレイプスケジュール（時・分）を返す。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        return repo.get_scrape_schedule()


@router.put("/scrape-schedule")
def update_scrape_schedule(
    payload: ScrapeSchedulePayload,
    _: None = Depends(verify_api_key),
) -> dict:
    """スクレイプスケジュールを更新する。スケジューラーが起動中であれば即時反映される。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        repo.set_scrape_schedule(payload.hour, payload.minute)
    from ..scheduler.jobs import reschedule_scrape
    reschedule_scrape(payload.hour, payload.minute)
    return {"status": "ok", "hour": payload.hour, "minute": payload.minute}


@router.get("/ai-comment-ttl")
def get_ai_comment_ttl(_: None = Depends(verify_api_key)) -> dict:
    """AI コメントキャッシュの TTL（時間）を返す。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        return {"hours": repo.get_ai_comment_ttl_hours()}


@router.put("/ai-comment-ttl")
def update_ai_comment_ttl(
    payload: AiCommentTtlPayload,
    _: None = Depends(verify_api_key),
) -> dict:
    """AI コメントキャッシュの TTL を更新する。既存のキャッシュは即時クリアされる。"""
    with db_session() as db:
        repo = AppSettingsRepository(db)
        repo.set_ai_comment_ttl_hours(payload.hours)
    from ..core.ai_comments import clear_cache
    clear_cache()
    return {"status": "ok", "hours": payload.hours}
