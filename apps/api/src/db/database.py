from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from typing import Generator
import os

from .models import Base

# DATABASE_URL は環境変数から取得（遅延インポートで循環回避）
def get_database_url() -> str:
    from ..config.settings import settings
    return settings.DATABASE_URL


def create_db_engine(database_url: str | None = None):
    url = database_url or get_database_url()
    # SQLite の場合はスレッドチェックを無効化
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        # DB ディレクトリが存在しない場合は作成
        db_path = url.replace("sqlite:///", "").replace("sqlite://", "")
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

    return create_engine(
        url,
        connect_args=connect_args,
        echo=False,
    )


# シングルトンエンジン
_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_db_engine()
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal


def init_db():
    """テーブルを作成する"""
    engine = get_engine()
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI の Depends で使う DB セッションジェネレータ"""
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def db_session() -> Generator[Session, None, None]:
    """スクレイパー / スクリプトから使う DB セッションコンテキストマネージャ"""
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
