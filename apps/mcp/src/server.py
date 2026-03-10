import httpx
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from fastmcp import FastMCP
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000/api")
API_KEY = os.getenv("API_KEY", "")

app = FastMCP("AssetBridge")


def _headers() -> dict:
    return {"X-API-Key": API_KEY}


async def _get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{API_BASE}{path}", params=params, headers=_headers())
        r.raise_for_status()
        return r.json()


async def _post(path: str, json: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{API_BASE}{path}", json=json, headers=_headers())
        r.raise_for_status()
        return r.json()


@app.tool()
async def get_portfolio_summary(date: str | None = None) -> dict:
    """総資産サマリーを取得する（日付指定可）"""
    params = {"date_str": date} if date else {}
    return await _get("/portfolio/summary", params)


@app.tool()
async def get_holdings(type: str = "all") -> dict:
    """保有銘柄一覧を取得する（type: stock_jp/stock_us/fund/crypto/cash/all）"""
    params = {} if type == "all" else {"asset_type": type}
    data = await _get("/assets", params)
    return {"holdings": data, "type_filter": type}


@app.tool()
async def get_asset_history(days: int = 30) -> dict:
    """総資産の推移を取得する"""
    return {"history": await _get("/portfolio/history", {"days": days})}


@app.tool()
async def get_income_expense(months: int = 3) -> dict:
    """月別収支を取得する"""
    return await _get("/income-expense", {"months": months})


@app.tool()
async def get_news(symbol: str) -> dict:
    """銘柄ニュースを取得する（キャッシュ優先）"""
    # TODO: /api/news/{symbol} エンドポイント追加後に実装
    return {"symbol": symbol, "message": "NewsAPIエンドポイントは別途実装予定"}


@app.tool()
async def analyze_portfolio(focus: str = "全体") -> dict:
    """ポートフォリオの分析レポートを生成する"""
    summary = await _get("/portfolio/summary")
    allocation = await _get("/insights/allocation")
    pnl = await _get("/insights/pnl-ranking", {"top": 5})
    return {
        "focus": focus,
        "summary": summary,
        "allocation": allocation,
        "pnl_ranking": pnl,
    }


@app.tool()
async def get_sector_allocation() -> dict:
    """セクター・アセットクラス別配分を取得する"""
    return await _get("/insights/allocation")


@app.tool()
async def get_unrealized_pnl_ranking(top: int = 10) -> dict:
    """含み損益ランキングを取得する"""
    return await _get("/insights/pnl-ranking", {"top": top})


@app.tool()
async def run_monte_carlo(
    initial: float = 1_000_000,
    monthly: float = 50_000,
    years: int = 20,
    return_rate: float = 0.05,
    volatility: float = 0.15,
) -> dict:
    """モンテカルロシミュレーションを実行する"""
    return await _post("/simulator/run", {
        "initial_amount": initial,
        "monthly_investment": monthly,
        "years": years,
        "expected_return": return_rate,
        "volatility": volatility,
    })


@app.tool()
async def trigger_scrape() -> dict:
    """手動スクレイプを実行する"""
    return await _post("/scrape/trigger")


@app.tool()
async def get_scrape_status() -> dict:
    """スクレイプ実行状況を取得する"""
    return await _get("/scrape/status")


@app.tool()
async def ask_portfolio(question: str) -> dict:
    """ポートフォリオについて自然言語で質問する"""
    summary = await _get("/portfolio/summary")
    allocation = await _get("/insights/allocation")

    context = f"""
ポートフォリオデータ:
- 総資産: ¥{summary.get('total_jpy', 0):,.0f}
- 前日比: {summary.get('prev_day_diff_pct', 0):.2f}%
- 配分: {allocation}
    """

    import sys
    sys.path.insert(0, ".")
    from apps.api.src.core import llm_client

    answer = await llm_client.chat([
        {"role": "system", "content": "あなたはポートフォリオアドバイザーです。提供されたデータを元に質問に答えてください。"},
        {"role": "user", "content": f"データ:\n{context}\n\n質問: {question}"},
    ])
    return {"question": question, "answer": answer}


@app.tool()
async def get_transactions(days: int = 30, type: str | None = None) -> dict:
    """取引履歴を取得する"""
    params: dict = {"days": days}
    if type:
        params["type"] = type
    # TODO: /api/transactions エンドポイント追加後に実装
    return {"message": "transactionsエンドポイントは別途実装予定", "days": days}


if __name__ == "__main__":
    import os
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_PORT", "8001"))
    app.run(transport="streamable-http", host=host, port=port)
