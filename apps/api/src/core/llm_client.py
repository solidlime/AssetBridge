import litellm
from ..config.settings import settings


async def chat(messages: list[dict], stream: bool = False) -> str:
    """LLMと対話。モデルは settings.LLM_MODEL で切り替え可能。"""
    response = await litellm.acompletion(
        model=settings.LLM_MODEL,
        messages=messages,
        stream=stream,
    )
    if stream:
        return response
    return response.choices[0].message.content or ""
