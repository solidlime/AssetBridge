import logging
from datetime import datetime, timedelta
from ..db.database import db_session
from ..db.repositories import AppSettingsRepository, DailyTotalRepository, SnapshotRepository
from .llm_client import chat

logger = logging.getLogger(__name__)

# コメントのメモリ内キャッシュ。スクレイプ完了後に clear_cache() で破棄する。
# キー: キャッシュ識別子, 値: (コメント文字列, 有効期限 UTC datetime)
_cache: dict[str, tuple[str, datetime]] = {}
_CACHE_TTL = timedelta(hours=6)


def _get_cached(key: str) -> str | None:
    """キャッシュを返す。存在しないか TTL 切れの場合は None を返す。"""
    if key in _cache:
        comment, expires_at = _cache[key]
        if datetime.utcnow() < expires_at:
            return comment
    return None


def _set_cached(key: str, comment: str) -> None:
    """コメントをキャッシュに格納する。有効期限は現在時刻 + _CACHE_TTL。"""
    _cache[key] = (comment, datetime.utcnow() + _CACHE_TTL)


async def generate_portfolio_comment(system_prompt: str | None = None) -> str:
    """総資産・カテゴリ別内訳に対する AI コメントを生成する。

    キャッシュヒット時はそのまま返す。ミス時は DB から直近7日分のデータを取得して
    LLM にコメントを生成させ、キャッシュに格納してから返す。
    """
    cache_key = "portfolio_summary"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    with db_session() as db:
        dt_repo = DailyTotalRepository(db)
        sp_repo = AppSettingsRepository(db)
        # system_prompt 引数が渡された場合は優先する（テスト等での上書きを想定）
        sp = system_prompt or sp_repo.get_system_prompt()
        history = dt_repo.get_history(days=7)

    if not history:
        return "データがありません。スクレイパーを実行してください。"

    latest = history[-1]

    diff_jpy = latest.get("prev_day_diff_jpy", 0)
    diff_pct = latest.get("prev_day_diff_pct", 0)
    sign = "+" if diff_jpy >= 0 else ""

    context = f"""現在の資産状況:
- 総資産: ¥{latest.get('total_jpy', 0):,.0f}
- 前日比: {sign}¥{diff_jpy:,.0f} ({sign}{diff_pct:.2f}%)
- 日本株: ¥{latest.get('stock_jp_jpy', 0):,.0f}
- 米国株: ¥{latest.get('stock_us_jpy', 0):,.0f}
- 投資信託: ¥{latest.get('fund_jpy', 0):,.0f}
- 現金・暗号資産: ¥{latest.get('cash_jpy', 0):,.0f}
- 年金: ¥{latest.get('pension_jpy', 0):,.0f}
"""

    messages = [
        {"role": "system", "content": sp},
        {"role": "user", "content": f"{context}\n\nこの資産状況について100文字以内で簡潔にコメントしてください。"},
    ]

    try:
        comment = await chat(messages)
        _set_cached(cache_key, comment)
        return comment
    except Exception as e:
        logger.error("AI コメント生成エラー: %s", e)
        return "AIコメントの生成に失敗しました。"


async def generate_pnl_comment(system_prompt: str | None = None) -> str:
    """含み損益上位5銘柄に対する AI コメントを生成する。

    キャッシュヒット時はそのまま返す。ミス時は DB から PnL ランキングを取得して
    LLM にコメントを生成させ、キャッシュに格納してから返す。
    """
    cache_key = "pnl_comment"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    with db_session() as db:
        snap_repo = SnapshotRepository(db)
        sp_repo = AppSettingsRepository(db)
        sp = system_prompt or sp_repo.get_system_prompt()
        ranking = snap_repo.get_pnl_ranking(top=5)

    if not ranking:
        return "保有銘柄データがありません。"

    lines = []
    for item in ranking[:5]:
        pnl = item.get("unrealized_pnl_jpy", 0)
        pct = item.get("unrealized_pnl_pct", 0)
        s = "+" if pnl >= 0 else ""
        lines.append(f"- {item.get('name', '')}: {s}¥{pnl:,.0f} ({s}{pct:.1f}%)")

    context = "含み損益上位5銘柄:\n" + "\n".join(lines)
    messages = [
        {"role": "system", "content": sp},
        {"role": "user", "content": f"{context}\n\n含み損益の状況について80文字以内で一言コメントしてください。"},
    ]

    try:
        comment = await chat(messages)
        _set_cached(cache_key, comment)
        return comment
    except Exception as e:
        logger.error("PnL コメント生成エラー: %s", e)
        return "AIコメントの生成に失敗しました。"


def clear_cache() -> None:
    """メモリ内キャッシュを全クリアする。スクレイプ完了後に呼ぶことで最新データを反映させる。"""
    _cache.clear()
