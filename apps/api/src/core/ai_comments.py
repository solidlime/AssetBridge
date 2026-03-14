import asyncio
import logging
import httpx
import yfinance as yf
from datetime import datetime, timedelta
from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import AppSettingsRepository, DailyTotalRepository
from .llm_client import chat

logger = logging.getLogger(__name__)

# コメントのメモリ内キャッシュ。スクレイプ完了後に clear_cache() で破棄する。
# キー: キャッシュ識別子, 値: (コメント文字列, 有効期限 UTC datetime)
_cache: dict[str, tuple[str, datetime]] = {}

# 市場コンテキストのキャッシュ（1時間TTL）
_market_cache: dict[str, tuple[str, datetime]] = {}


async def _fetch_market_context() -> str:
    """日経225・S&P500・TOPIXの現在値と前日比を取得する（1時間キャッシュ）。"""
    cache_key = "market"
    if cache_key in _market_cache:
        text, expires_at = _market_cache[cache_key]
        if datetime.utcnow() < expires_at:
            return text

    indices = [
        ("日経225", "^N225"),
        ("S&P500", "^GSPC"),
        ("TOPIX", "^TOPX"),
    ]

    lines = []
    for name, symbol in indices:
        try:
            ticker = await asyncio.to_thread(yf.Ticker, symbol)
            fast_info = await asyncio.to_thread(lambda t=ticker: t.fast_info)
            last = getattr(fast_info, "last_price", None)
            prev = getattr(fast_info, "previous_close", None)
            if last is None or prev is None:
                continue
            diff_pct = (last - prev) / prev * 100
            sign = "+" if diff_pct >= 0 else ""
            if symbol == "^GSPC":
                lines.append(f"- {name}: ${last:,.0f}（前日比 {sign}{diff_pct:.2f}%）")
            else:
                lines.append(f"- {name}: {last:,.0f}（前日比 {sign}{diff_pct:.2f}%）")
        except Exception as e:
            logger.debug("市場データ取得失敗 %s: %s", symbol, e)

    if not lines:
        _market_cache[cache_key] = ("", datetime.utcnow() + timedelta(hours=1))
        return ""

    text = "市場情報:\n" + "\n".join(lines)
    _market_cache[cache_key] = (text, datetime.utcnow() + timedelta(hours=1))
    return text


async def _fetch_news_context() -> str:
    """SearXNG から日本株ニュースを取得する（1時間キャッシュ）。"""
    cache_key = "news"
    if cache_key in _market_cache:
        text, expires_at = _market_cache[cache_key]
        if datetime.utcnow() < expires_at:
            return text

    try:
        url = f"{settings.SEARXNG_URL}/search"
        params = {
            "q": "日本株 株式市場 経済",
            "format": "json",
            "language": "ja",
            "time_range": "day",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])[:5]
        if not results:
            _market_cache[cache_key] = ("", datetime.utcnow() + timedelta(hours=1))
            return ""

        titles = "\n".join(f"- {r.get('title', '')}" for r in results if r.get("title"))
        text = f"最新ニュース（タイトルのみ）:\n{titles}"
        _market_cache[cache_key] = (text, datetime.utcnow() + timedelta(hours=1))
        return text
    except Exception as e:
        logger.debug("ニュース取得失敗: %s", e)
        _market_cache[cache_key] = ("", datetime.utcnow() + timedelta(hours=1))
        return ""


def _get_ttl() -> timedelta:
    """DB の ai_comment_ttl_hours 設定（なければデフォルト 6h）を返す。"""
    try:
        with db_session() as db:
            repo = AppSettingsRepository(db)
            v = repo.get("ai_comment_ttl_hours")
            return timedelta(hours=int(v)) if v and v.isdigit() else timedelta(hours=6)
    except Exception:
        return timedelta(hours=6)


def _get_cached(key: str) -> str | None:
    """キャッシュを返す。存在しないか TTL 切れの場合は None を返す。"""
    if key in _cache:
        comment, expires_at = _cache[key]
        if datetime.utcnow() < expires_at:
            return comment
    return None


def _set_cached(key: str, comment: str) -> None:
    """コメントをキャッシュに格納する。有効期限は現在時刻 + DB 設定の TTL。"""
    _cache[key] = (comment, datetime.utcnow() + _get_ttl())


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
        history_orm = dt_repo.get_history(days=7)
        # セッションが閉じると ORM オブジェクトが DetachedInstanceError を起こすため、
        # with ブロック内で dict に変換してセッション依存を切る。
        history = [
            {
                "date": str(h.date),
                "total_jpy": float(h.total_jpy or 0),
                "prev_day_diff_jpy": float(h.prev_day_diff_jpy or 0),
                "prev_day_diff_pct": float(h.prev_day_diff_pct or 0),
                "stock_jp_jpy": float(h.stock_jp_jpy or 0),
                "stock_us_jpy": float(h.stock_us_jpy or 0),
                "fund_jpy": float(h.fund_jpy or 0),
                "cash_jpy": float(h.cash_jpy or 0),
                "pension_jpy": float(h.pension_jpy or 0),
            }
            for h in history_orm
        ]

    if not history:
        return "データがありません。スクレイパーを実行してください。"

    latest = history[-1]

    diff_jpy = latest["prev_day_diff_jpy"]
    diff_pct = latest["prev_day_diff_pct"]
    sign = "+" if diff_jpy >= 0 else ""

    # 7日間のトレンドを計算（history の先頭が最古レコード）
    first = history[0]
    trend_jpy = latest["total_jpy"] - first["total_jpy"]
    trend_sign = "+" if trend_jpy >= 0 else ""

    context = f"""現在の資産状況 ({latest['date']}):
- 総資産: ¥{latest['total_jpy']:,.0f}
- 前日比: {sign}¥{diff_jpy:,.0f} ({sign}{diff_pct:.2f}%)
- 7日間変動: {trend_sign}¥{trend_jpy:,.0f}
- 日本株: ¥{latest['stock_jp_jpy']:,.0f}
- 米国株: ¥{latest['stock_us_jpy']:,.0f}
- 投資信託: ¥{latest['fund_jpy']:,.0f}
- 現金・暗号資産: ¥{latest['cash_jpy']:,.0f}
- 年金: ¥{latest['pension_jpy']:,.0f}
"""

    # 市場コンテキストとニュースを取得（失敗しても続行）
    market_ctx = await _fetch_market_context()
    news_ctx = await _fetch_news_context()

    if market_ctx:
        context += f"\n{market_ctx}\n"
    if news_ctx:
        context += f"\n{news_ctx}\n"

    messages = [
        {"role": "system", "content": sp},
        {"role": "user", "content": f"{context}\n\n市場状況も踏まえてこの資産状況について150文字以内で簡潔にコメントしてください。"},
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

    キャッシュヒット時はそのまま返す。ミス時は PortfolioAnalyzer から PnL ランキングを取得して
    LLM にコメントを生成させ、キャッシュに格納してから返す。
    """
    cache_key = "pnl_comment"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    with db_session() as db:
        sp_repo = AppSettingsRepository(db)
        sp = system_prompt or sp_repo.get_system_prompt()

    # PortfolioAnalyzer は内部で db_session を開くので with ブロックの外で呼ぶ
    from .analyzer import PortfolioAnalyzer
    analyzer = PortfolioAnalyzer()
    # get_unrealized_pnl_ranking は gainers + losers を返すため先頭5件が含み益上位
    ranking = analyzer.get_unrealized_pnl_ranking(top=5)

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


async def generate_asset_comment(
    symbol: str,
    name: str,
    value_jpy: float,
    unrealized_pnl_jpy: float,
    unrealized_pnl_pct: float,
    system_prompt: str | None = None,
) -> str:
    """特定銘柄の AI コメントを生成する（キャッシュなし、毎回生成）。

    Args:
        symbol: 銘柄コード（例: "7203", "NVDA"）
        name: 銘柄名（例: "トヨタ自動車"）
        value_jpy: 評価額（円）
        unrealized_pnl_jpy: 含み損益額（円、損失は負値）
        unrealized_pnl_pct: 含み損益率（%、損失は負値）
        system_prompt: 上書き用システムプロンプト（None の場合は DB 設定を使用）
    """
    with db_session() as db:
        sp_repo = AppSettingsRepository(db)
        sp = system_prompt or sp_repo.get_system_prompt()

    pnl = unrealized_pnl_jpy
    pct = unrealized_pnl_pct
    sign = "+" if pnl >= 0 else ""

    context = (
        f"銘柄: {name} ({symbol})\n"
        f"- 評価額: ¥{value_jpy:,.0f}\n"
        f"- 含み損益: {sign}¥{abs(pnl):,.0f} ({sign}{pct:.2f}%)\n"
    )

    # yfinance で銘柄情報を取得
    yf_symbol = f"{symbol}.T" if (symbol.isdigit() and 4 <= len(symbol) <= 5) else symbol
    ticker_info_str = ""
    try:
        ticker = await asyncio.to_thread(yf.Ticker, yf_symbol)
        info = await asyncio.to_thread(lambda: ticker.info)
        per = info.get("trailingPE")
        pbr = info.get("priceToBook")
        div_yield = info.get("dividendYield")
        week52_high = info.get("fiftyTwoWeekHigh")
        week52_low = info.get("fiftyTwoWeekLow")
        parts = []
        if per:
            parts.append(f"PER: {per:.1f}倍")
        if pbr:
            parts.append(f"PBR: {pbr:.2f}倍")
        if div_yield:
            parts.append(f"配当利回り: {div_yield*100:.2f}%")
        if week52_high and week52_low:
            parts.append(f"52週高値/安値: {week52_high:,.0f}/{week52_low:,.0f}")
        if parts:
            ticker_info_str = "財務指標: " + ", ".join(parts)
    except Exception as e:
        logger.debug("銘柄情報取得失敗 %s: %s", yf_symbol, e)

    # SearXNG で銘柄ニュースを取得
    asset_news_str = ""
    try:
        url = f"{settings.SEARXNG_URL}/search"
        params = {"q": f"{name} 株価 決算", "format": "json", "language": "ja", "time_range": "week"}
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        titles = [r.get("title", "") for r in data.get("results", [])[:5] if r.get("title")]
        if titles:
            asset_news_str = "最新ニュース:\n" + "\n".join(f"- {t}" for t in titles)
    except Exception as e:
        logger.debug("銘柄ニュース取得失敗 %s: %s", name, e)

    if ticker_info_str:
        context += f"{ticker_info_str}\n"
    if asset_news_str:
        context += f"{asset_news_str}\n"

    messages = [
        {"role": "system", "content": sp},
        {"role": "user", "content": f"{context}\nこの銘柄について業績指標・最新ニュースを踏まえた200文字程度の詳細コメントを書いてください。"},
    ]
    try:
        return await chat(messages)
    except Exception as e:
        logger.error("銘柄コメント生成エラー: %s", e)
        return "コメントの生成に失敗しました。"


def clear_cache() -> None:
    """メモリ内キャッシュを全クリアする。スクレイプ完了後に呼ぶことで最新データを反映させる。"""
    _cache.clear()
