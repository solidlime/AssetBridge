from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.database import init_db
from .scheduler.jobs import setup_scheduler
from .routers import portfolio, assets, income_expense, insights, simulator, scrape


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # 起動時: DB 初期化とスケジューラ開始
    init_db()
    sched = setup_scheduler()
    sched.start()
    yield
    # 終了時: スケジューラ停止
    sched.shutdown()


app = FastAPI(
    title="AssetBridge API",
    description="ポートフォリオ管理AIエージェント API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録（全て /api プレフィックス付き）
app.include_router(portfolio.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(income_expense.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(simulator.router, prefix="/api")
app.include_router(scrape.router, prefix="/api")


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
