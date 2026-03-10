#!/usr/bin/env python3
"""ログイン疎通確認スクリプト（headful モード）"""
import asyncio
import sys
import os

# プロジェクトルートを sys.path に追加して絶対 import を有効化
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))


async def main() -> None:
    from apps.crawler.src.scrapers.mf_sbi_bank import MFSBIScraper
    print("ブラウザを起動してログインを試みます...")
    async with MFSBIScraper(headless=False) as scraper:
        success = await scraper.login()
        if success:
            print("ログイン成功。セッションが保存されました。")
        else:
            print("ログイン失敗。.env の認証情報を確認してください。")
        input("Enterキーで終了...")


if __name__ == "__main__":
    asyncio.run(main())
