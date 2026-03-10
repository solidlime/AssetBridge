from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import date, timedelta
from typing import Optional
from ..models import Transaction, TransactionType, MonthlyCashflow


class TransactionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, tx_id: int) -> Optional[Transaction]:
        return self.db.get(Transaction, tx_id)

    def get_by_date_range(
        self,
        start_date: date,
        end_date: date,
        tx_type: TransactionType | None = None,
    ) -> list[Transaction]:
        stmt = select(Transaction).where(
            Transaction.date >= start_date,
            Transaction.date <= end_date,
        )
        if tx_type:
            stmt = stmt.where(Transaction.type == tx_type)
        stmt = stmt.order_by(Transaction.date.desc())
        return list(self.db.execute(stmt).scalars().all())

    def get_recent(self, days: int = 30, tx_type: TransactionType | None = None) -> list[Transaction]:
        since = date.today() - timedelta(days=days)
        return self.get_by_date_range(since, date.today(), tx_type)

    def add(self, tx_date: date, tx_type: TransactionType, amount_jpy: float,
            asset_id: int | None = None, quantity: float | None = None,
            price_jpy: float | None = None, note: str | None = None) -> Transaction:
        tx = Transaction(
            date=tx_date,
            type=tx_type,
            amount_jpy=amount_jpy,
            asset_id=asset_id,
            quantity=quantity,
            price_jpy=price_jpy,
            note=note,
        )
        self.db.add(tx)
        self.db.flush()
        return tx


class MonthlyCashflowRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_year_month(self, year_month: str) -> Optional[MonthlyCashflow]:
        stmt = select(MonthlyCashflow).where(MonthlyCashflow.year_month == year_month)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_recent(self, months: int = 12) -> list[MonthlyCashflow]:
        stmt = (
            select(MonthlyCashflow)
            .order_by(MonthlyCashflow.year_month.desc())
            .limit(months)
        )
        result = list(self.db.execute(stmt).scalars().all())
        return list(reversed(result))

    def upsert(self, year_month: str, income_jpy: float, expense_jpy: float,
               categories_json: str | None = None) -> MonthlyCashflow:
        existing = self.get_by_year_month(year_month)
        if existing:
            existing.income_jpy = income_jpy
            existing.expense_jpy = expense_jpy
            existing.net_jpy = income_jpy - expense_jpy
            if categories_json is not None:
                existing.categories_json = categories_json
            self.db.flush()
            return existing

        cf = MonthlyCashflow(
            year_month=year_month,
            income_jpy=income_jpy,
            expense_jpy=expense_jpy,
            net_jpy=income_jpy - expense_jpy,
            categories_json=categories_json,
        )
        self.db.add(cf)
        self.db.flush()
        return cf
