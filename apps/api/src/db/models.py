from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Date,
    ForeignKey, Text, Enum, UniqueConstraint, Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship
import enum


class Base(DeclarativeBase):
    pass


class AssetType(str, enum.Enum):
    STOCK_JP = "stock_jp"
    STOCK_US = "stock_us"
    FUND = "fund"
    CRYPTO = "crypto"
    CASH = "cash"
    PENSION = "pension"
    POINT = "point"


class TransactionType(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"
    DIVIDEND = "dividend"
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    FEE = "fee"


class Sentiment(str, enum.Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class ScrapeStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    RUNNING = "running"


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    asset_type = Column(Enum(AssetType), nullable=False)
    exchange = Column(String(50), nullable=True)
    currency = Column(String(10), default="JPY")
    created_at = Column(DateTime, default=datetime.utcnow)

    snapshots = relationship("PortfolioSnapshot", back_populates="asset", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="asset")

    __table_args__ = (
        UniqueConstraint("symbol", "asset_type", name="uq_asset_symbol_type"),
    )


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    date = Column(Date, nullable=False)
    quantity = Column(Float, default=0.0)
    price_jpy = Column(Float, default=0.0)
    value_jpy = Column(Float, default=0.0)
    cost_basis_jpy = Column(Float, default=0.0)
    unrealized_pnl_jpy = Column(Float, default=0.0)
    unrealized_pnl_pct = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="snapshots")

    __table_args__ = (
        UniqueConstraint("asset_id", "date", name="uq_snapshot_asset_date"),
        Index("ix_snapshot_date", "date"),
    )


class DailyTotal(Base):
    __tablename__ = "daily_totals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    total_jpy = Column(Float, default=0.0)
    stock_jp_jpy = Column(Float, default=0.0)
    stock_us_jpy = Column(Float, default=0.0)
    fund_jpy = Column(Float, default=0.0)
    crypto_jpy = Column(Float, default=0.0)
    cash_jpy = Column(Float, default=0.0)
    pension_jpy = Column(Float, default=0.0)
    point_jpy = Column(Float, default=0.0)
    prev_day_diff_jpy = Column(Float, default=0.0)
    prev_day_diff_pct = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_daily_totals_date", "date"),)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    date = Column(Date, nullable=False)
    type = Column(Enum(TransactionType), nullable=False)
    quantity = Column(Float, nullable=True)
    price_jpy = Column(Float, nullable=True)
    amount_jpy = Column(Float, default=0.0)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="transactions")

    __table_args__ = (Index("ix_transactions_date", "date"),)


class MonthlyCashflow(Base):
    __tablename__ = "monthly_cashflow"

    id = Column(Integer, primary_key=True, autoincrement=True)
    year_month = Column(String(6), nullable=False, unique=True)  # YYYYMM
    income_jpy = Column(Float, default=0.0)
    expense_jpy = Column(Float, default=0.0)
    net_jpy = Column(Float, default=0.0)
    categories_json = Column(Text, nullable=True)  # JSON文字列
    created_at = Column(DateTime, default=datetime.utcnow)


class NewsCache(Base):
    __tablename__ = "news_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False)
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    published_at = Column(DateTime, nullable=True)
    source = Column(String(100), nullable=True)
    summary = Column(Text, nullable=True)
    sentiment = Column(Enum(Sentiment), default=Sentiment.NEUTRAL)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_news_cache_symbol", "symbol"),)


class ScrapeLog(Base):
    __tablename__ = "scrape_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(Enum(ScrapeStatus), default=ScrapeStatus.RUNNING)
    records_saved = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    screenshot_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AppSettings(Base):
    """アプリケーション設定を KV 形式で永続化するテーブル。
    system_prompt などの可変設定を DB で管理することで、再起動なしに変更可能にする。
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
