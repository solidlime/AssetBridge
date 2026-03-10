#!/usr/bin/env python3
"""DB初期化スクリプト。テーブルを作成する。"""
import sys
import os

# プロジェクトルートをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))

from apps.api.src.db.database import init_db
from apps.api.src.config.settings import settings


def main():
    print(f"DB URL: {settings.DATABASE_URL}")
    print("テーブルを作成しています...")
    init_db()
    print("完了！")


if __name__ == "__main__":
    main()
