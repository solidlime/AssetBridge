import os
import logging
import litellm
from ..config.settings import settings

logger = logging.getLogger(__name__)

# settings から LiteLLM が必要とする環境変数に転写する
# （.env は pydantic-settings が読むが、litellm は os.environ から直接読む）
_KEY_MAP = {
    "ANTHROPIC_API_KEY": settings.ANTHROPIC_API_KEY,
    "OPENAI_API_KEY": settings.OPENAI_API_KEY,
    "GEMINI_API_KEY": settings.GEMINI_API_KEY,
    "OPENROUTER_API_KEY": settings.OPENROUTER_API_KEY,
}
for _k, _v in _KEY_MAP.items():
    if _v and not os.environ.get(_k):
        os.environ[_k] = _v


def _resolve_model() -> tuple[str, dict]:
    """設定されている APIキーと LLM_MODEL から実際に使うモデル名と追加パラメータを返す。

    解決ルール:
      - 既に "openrouter/" / "anthropic/" 等のプロバイダープレフィックスがある → そのまま使用
      - claude-*      → ANTHROPIC_API_KEY があれば anthropic/<model>、
                        なければ OPENROUTER_API_KEY で openrouter/anthropic/<model>
      - gpt-* / o1-* → OPENAI_API_KEY があれば <model>、
                        なければ OPENROUTER_API_KEY で openrouter/openai/<model>
      - gemini-* / google/* → GEMINI_API_KEY があれば <model>、
                        なければ OPENROUTER_API_KEY で openrouter/<model>
      - その他        → OPENROUTER_API_KEY があれば openrouter/<model>、なければそのまま
    """
    model: str = settings.LLM_MODEL
    extra: dict = {}

    # 既にプロバイダープレフィックス付き
    known_prefixes = ("openrouter/", "anthropic/", "openai/", "azure/", "bedrock/",
                      "vertex_ai/", "huggingface/")
    if any(model.startswith(p) for p in known_prefixes):
        return model, extra

    # settings.* はモジュール読み込み時に固定されるため os.environ を動的に参照する
    # （Web UI からキーを更新した際に PUT /settings/llm が os.environ を即時書き換えるため）
    has_anthropic  = bool(os.environ.get("ANTHROPIC_API_KEY"))
    has_openai     = bool(os.environ.get("OPENAI_API_KEY"))
    has_gemini     = bool(os.environ.get("GEMINI_API_KEY"))
    has_openrouter = bool(os.environ.get("OPENROUTER_API_KEY"))

    # claude-* モデル
    if model.startswith("claude"):
        if has_anthropic:
            return model, extra
        if has_openrouter:
            return f"openrouter/anthropic/{model}", extra
        logger.warning("claude モデル使用にはANTHROPIC_API_KEYまたはOPENROUTER_API_KEYが必要です")
        return model, extra

    # OpenAI モデル
    if model.startswith(("gpt-", "o1-", "o3-", "text-davinci")):
        if has_openai:
            return model, extra
        if has_openrouter:
            return f"openrouter/openai/{model}", extra
        return model, extra

    # Google / Gemini モデル
    if model.startswith(("gemini", "google/")):
        if has_gemini:
            return model, extra
        if has_openrouter:
            # google/xxx → openrouter/google/xxx
            if model.startswith("google/"):
                return f"openrouter/{model}", extra
            return f"openrouter/google/{model}", extra
        return model, extra

    # その他: OPENROUTER にフォールバック
    if has_openrouter:
        return f"openrouter/{model}", extra

    return model, extra


async def chat(messages: list[dict], stream: bool = False) -> str:
    """LLMと対話。モデルは settings.LLM_MODEL で切り替え可能。

    利用可能な APIキーに基づいて自動的に適切なプロバイダーを選択する。
    """
    model, extra_params = _resolve_model()
    logger.debug("LLM呼び出し: model=%s", model)
    response = await litellm.acompletion(
        model=model,
        messages=messages,
        stream=stream,
        **extra_params,
    )
    if stream:
        return response
    return response.choices[0].message.content or ""
