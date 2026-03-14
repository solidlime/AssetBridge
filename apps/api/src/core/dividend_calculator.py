import asyncio
import logging
from datetime import datetime

import yfinance as yf

logger = logging.getLogger(__name__)


def _symbol_to_yf(symbol: str, asset_type: str) -> str:
    """銘柄コード → yfinance シンボルに変換。日本株は .T を付加。"""
    if asset_type == "stock_jp" or (symbol.isdigit() and 4 <= len(symbol) <= 5):
        return f"{symbol}.T"
    return symbol


def _get_monthly_pattern(dividends) -> list[float]:
    """過去の配当履歴から月別比率（12要素リスト）を返す。データがない場合は均等配分。"""
    if dividends is None or len(dividends) == 0:
        return [1.0 / 12] * 12
    monthly = [0.0] * 12
    for date_idx, amount in dividends.items():
        month = date_idx.month - 1  # 0-indexed
        monthly[month] += float(amount)
    total = sum(monthly)
    if total == 0:
        return [1.0 / 12] * 12
    return [m / total for m in monthly]


async def _fetch_ticker_dividend(symbol: str, yf_symbol: str) -> dict:
    """yfinance から配当情報を非同期で取得する。失敗時は空dictを返す。"""
    try:
        def _get_info():
            ticker = yf.Ticker(yf_symbol)
            return ticker.info, ticker.dividends

        info, dividends = await asyncio.to_thread(_get_info)

        dividend_yield = info.get("dividendYield") or 0.0
        ex_date_ts = info.get("exDividendDate")
        if ex_date_ts:
            try:
                ex_date_str = datetime.fromtimestamp(ex_date_ts).strftime("%Y-%m-%d")
            except Exception:
                ex_date_str = None
        else:
            ex_date_str = None

        monthly_pattern = _get_monthly_pattern(dividends)
        return {
            "dividend_yield_pct": round(float(dividend_yield) * 100, 2),
            "ex_dividend_date": ex_date_str,
            "monthly_pattern": monthly_pattern,
        }
    except Exception as e:
        logger.warning("配当情報取得失敗 %s: %s", yf_symbol, e)
        return {}


async def get_dividend_summary(assets: list[dict]) -> dict:
    """保有銘柄リストから配当予想サマリーを生成する。

    Args:
        assets: 銘柄情報リスト（symbol, name, asset_type, value_jpy を含む）

    Returns:
        配当サマリー辞書
    """
    # 株式のみ対象（投信・現金・年金はスキップ）
    stock_assets = [a for a in assets if a.get("asset_type") in ("stock_jp", "stock_us")]

    if not stock_assets:
        return {
            "total_annual_est_jpy": 0,
            "portfolio_yield_pct": 0.0,
            "monthly_breakdown": [0] * 12,
            "holdings": [],
        }

    # 各銘柄の配当情報を並列取得
    tasks = [
        _fetch_ticker_dividend(
            a.get("symbol", ""),
            _symbol_to_yf(a.get("symbol", ""), a.get("asset_type", "")),
        )
        for a in stock_assets
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    holdings: list[dict] = []
    for asset, result in zip(stock_assets, results):
        if isinstance(result, Exception) or not result:
            result = {}

        value_jpy = float(asset.get("value_jpy", 0))
        dividend_yield_pct = float(result.get("dividend_yield_pct", 0.0))
        annual_est_jpy = round(value_jpy * dividend_yield_pct / 100)
        monthly_pattern = result.get("monthly_pattern", [1.0 / 12] * 12)
        monthly_est_jpy = [round(annual_est_jpy * p) for p in monthly_pattern]

        holdings.append({
            "symbol": asset.get("symbol", ""),
            "name": asset.get("name", ""),
            "asset_type": asset.get("asset_type", ""),
            "value_jpy": value_jpy,
            "dividend_yield_pct": dividend_yield_pct,
            "annual_est_jpy": annual_est_jpy,
            "monthly_est_jpy": monthly_est_jpy,
            "ex_dividend_date": result.get("ex_dividend_date"),
        })

    total_annual_est = sum(h["annual_est_jpy"] for h in holdings)
    total_value = sum(float(a.get("value_jpy", 0)) for a in stock_assets) or 1.0
    portfolio_yield_pct = round(total_annual_est / total_value * 100, 2)

    monthly_breakdown = [0] * 12
    for h in holdings:
        for i, m in enumerate(h["monthly_est_jpy"]):
            monthly_breakdown[i] += m

    return {
        "total_annual_est_jpy": total_annual_est,
        "portfolio_yield_pct": portfolio_yield_pct,
        "monthly_breakdown": monthly_breakdown,
        "holdings": sorted(holdings, key=lambda x: x["annual_est_jpy"], reverse=True),
    }
