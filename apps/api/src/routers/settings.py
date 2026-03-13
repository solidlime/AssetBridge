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


# ---- LLM 設定 ----

# プロバイダー別のモデルカタログ（静的リスト）
_LLM_MODELS = [
    # Anthropic
    {"id": "claude-sonnet-4-6",        "name": "Claude Sonnet 4.6",                        "provider": "anthropic"},
    {"id": "claude-opus-4-6",          "name": "Claude Opus 4.6",                          "provider": "anthropic"},
    {"id": "claude-haiku-4-5-20251001","name": "Claude Haiku 4.5",                         "provider": "anthropic"},
    {"id": "claude-3-5-sonnet-20241022","name": "Claude 3.5 Sonnet",                       "provider": "anthropic"},
    # OpenAI
    {"id": "gpt-4o",                   "name": "GPT-4o",                                   "provider": "openai"},
    {"id": "gpt-4o-mini",              "name": "GPT-4o Mini",                              "provider": "openai"},
    {"id": "o1",                       "name": "o1",                                       "provider": "openai"},
    {"id": "o3-mini",                  "name": "o3-mini",                                  "provider": "openai"},
    # Gemini（直接）
    {"id": "gemini/gemini-2.0-flash",  "name": "Gemini 2.0 Flash",                        "provider": "gemini"},
    {"id": "gemini/gemini-2.5-pro",    "name": "Gemini 2.5 Pro",                          "provider": "gemini"},
    {"id": "google/gemini-2.0-flash",  "name": "Gemini 2.0 Flash (Google)",               "provider": "gemini"},
    # OpenRouter 経由
    {"id": "google/gemini-3-flash-preview",              "name": "Gemini 3 Flash Preview (→OpenRouter)",  "provider": "openrouter_auto"},
    {"id": "openrouter/anthropic/claude-sonnet-4-6",     "name": "Claude Sonnet 4.6 (OpenRouter)",        "provider": "openrouter"},
    {"id": "openrouter/anthropic/claude-3.5-sonnet",     "name": "Claude 3.5 Sonnet (OpenRouter)",        "provider": "openrouter"},
    {"id": "openrouter/google/gemini-2.0-flash",         "name": "Gemini 2.0 Flash (OpenRouter)",         "provider": "openrouter"},
    {"id": "openrouter/google/gemini-3-flash-preview",   "name": "Gemini 3 Flash Preview (OpenRouter)",   "provider": "openrouter"},
    {"id": "openrouter/openai/gpt-4o",                   "name": "GPT-4o (OpenRouter)",                   "provider": "openrouter"},
    {"id": "openrouter/meta-llama/llama-3.3-70b-instruct","name": "Llama 3.3 70B (OpenRouter)",           "provider": "openrouter"},
]

# プロバイダーと対応する環境変数名のマッピング
_PROVIDER_KEY_MAP = {
    "anthropic":       "ANTHROPIC_API_KEY",
    "openai":          "OPENAI_API_KEY",
    "gemini":          "GEMINI_API_KEY",
    "openrouter":      "OPENROUTER_API_KEY",
    # openrouter_auto: プレフィックスなしだが OpenRouter にルーティングされる
    "openrouter_auto": "OPENROUTER_API_KEY",
}


class LlmSettingsPayload(BaseModel):
    model: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""


@router.get("/llm")
def get_llm_settings(_: None = Depends(verify_api_key)) -> dict:
    """現在の LLM モデルと各プロバイダーの API キー設定状況（マスク）を返す。"""
    import os
    with db_session() as db:
        repo = AppSettingsRepository(db)
        # DB に保存されたモデルを優先し、未設定なら settings.LLM_MODEL を使う
        model = repo.get_llm_model() or settings.LLM_MODEL

    def _masked(env_key: str) -> dict:
        """API キーの設定有無と先頭6文字+末尾4文字のマスク済み文字列を返す。"""
        val = os.environ.get(env_key, "")
        return {
            "set": bool(val),
            "masked": f"{val[:6]}...{val[-4:]}" if len(val) > 10 else ("****" if val else ""),
        }

    return {
        "model": model,
        "providers": {
            "anthropic":  _masked("ANTHROPIC_API_KEY"),
            "openai":     _masked("OPENAI_API_KEY"),
            "gemini":     _masked("GEMINI_API_KEY"),
            "openrouter": _masked("OPENROUTER_API_KEY"),
        },
    }


@router.get("/llm/models")
def list_llm_models(_: None = Depends(verify_api_key)) -> dict:
    """利用可能なモデル一覧を返す。API キーが設定されているプロバイダーのモデルを available=true にする。"""
    import os
    key_set = {
        "anthropic":       bool(os.environ.get("ANTHROPIC_API_KEY")),
        "openai":          bool(os.environ.get("OPENAI_API_KEY")),
        "gemini":          bool(os.environ.get("GEMINI_API_KEY")),
        "openrouter":      bool(os.environ.get("OPENROUTER_API_KEY")),
        "openrouter_auto": bool(os.environ.get("OPENROUTER_API_KEY")),
    }
    models = [
        {**m, "available": key_set.get(m["provider"], False)}
        for m in _LLM_MODELS
    ]
    return {"models": models}


@router.put("/llm")
def update_llm_settings(
    payload: LlmSettingsPayload,
    _: None = Depends(verify_api_key),
) -> dict:
    """LLM モデルと API キーを更新する。API キーは os.environ にも即時反映する。"""
    import os
    with db_session() as db:
        repo = AppSettingsRepository(db)
        if payload.model:
            repo.set_llm_model(payload.model)
        # (provider, 環境変数名, ペイロードの値) の組み合わせを一括処理する
        key_pairs = [
            ("anthropic",  "ANTHROPIC_API_KEY",  payload.anthropic_api_key),
            ("openai",     "OPENAI_API_KEY",      payload.openai_api_key),
            ("gemini",     "GEMINI_API_KEY",      payload.gemini_api_key),
            ("openrouter", "OPENROUTER_API_KEY",  payload.openrouter_api_key),
        ]
        for provider, env_key, val in key_pairs:
            if val:
                repo.set_llm_api_key(provider, val)
                # litellm は os.environ から直接読むため、プロセス内のキャッシュも更新する
                os.environ[env_key] = val

    # _resolve_model() が参照する settings.LLM_MODEL をプロセス内で即時更新する
    if payload.model:
        settings.LLM_MODEL = payload.model

    return {"status": "ok"}
