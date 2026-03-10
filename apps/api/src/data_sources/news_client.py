from datetime import datetime
from typing import Optional
from newsapi import NewsApiClient
from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import NewsCacheRepository
from ..db.models import Sentiment


def get_news(symbol: str, limit: int = 5) -> list[dict]:
    with db_session() as db:
        repo = NewsCacheRepository(db)

        # キャッシュが有効なら即返却
        cached = repo.get_valid(symbol, limit)
        if cached:
            return [
                {
                    "symbol": n.symbol,
                    "title": n.title,
                    "url": n.url,
                    "published_at": n.published_at.isoformat() if n.published_at else None,
                    "source": n.source,
                    "summary": n.summary,
                    "sentiment": n.sentiment.value,
                }
                for n in cached
            ]

        # API キーが未設定なら空リストを返す
        if not settings.NEWS_API_KEY:
            return []

        try:
            client = NewsApiClient(api_key=settings.NEWS_API_KEY)
            articles = client.get_everything(q=symbol, language="ja", sort_by="publishedAt", page_size=limit)

            results = []
            for article in (articles.get("articles") or [])[:limit]:
                published_at: Optional[datetime] = None
                if article.get("publishedAt"):
                    try:
                        published_at = datetime.fromisoformat(article["publishedAt"].replace("Z", "+00:00"))
                    except Exception:
                        pass

                news = repo.save(
                    symbol=symbol,
                    title=article.get("title", ""),
                    url=article.get("url", ""),
                    published_at=published_at,
                    source=article.get("source", {}).get("name"),
                    summary=article.get("description"),
                )
                results.append({
                    "symbol": symbol,
                    "title": news.title,
                    "url": news.url,
                    "published_at": news.published_at.isoformat() if news.published_at else None,
                    "source": news.source,
                    "summary": news.summary,
                    "sentiment": news.sentiment.value,
                })
            return results
        except Exception:
            return []
