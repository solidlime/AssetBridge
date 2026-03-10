import yfinance as yf
from typing import Optional


def get_current_price(symbol: str) -> Optional[float]:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        return float(info.last_price) if info.last_price else None
    except Exception:
        return None


def get_price_history(symbol: str, days: int = 30) -> list[dict]:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=f"{days}d")
        return [
            {"date": str(idx.date()), "close": float(row["Close"])}
            for idx, row in hist.iterrows()
        ]
    except Exception:
        return []
