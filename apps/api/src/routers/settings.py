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
