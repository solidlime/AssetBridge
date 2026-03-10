from fastapi import APIRouter, Depends, HTTPException, Header
from ..config.settings import settings
from ..db.database import db_session
from ..db.repositories import MonthlyCashflowRepository

router = APIRouter(prefix="/income-expense", tags=["income_expense"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


@router.get("")
def get_income_expense(months: int = 12, _: None = Depends(verify_api_key)) -> dict:
    with db_session() as db:
        repo = MonthlyCashflowRepository(db)
        data = repo.get_recent(months=months)
        items = [
            {
                "year_month": cf.year_month,
                "income_jpy": cf.income_jpy,
                "expense_jpy": cf.expense_jpy,
                "net_jpy": cf.net_jpy,
            }
            for cf in data
        ]
        avg_income = sum(i["income_jpy"] for i in items) / len(items) if items else 0
        avg_expense = sum(i["expense_jpy"] for i in items) / len(items) if items else 0
        return {
            "data": items,
            "avg_income_jpy": avg_income,
            "avg_expense_jpy": avg_expense,
            "avg_net_jpy": avg_income - avg_expense,
        }
