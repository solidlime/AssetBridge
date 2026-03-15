import asyncio
import logging
import random
from abc import ABC, abstractmethod
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from .session_manager import SessionManager

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    # 指数バックオフ（秒）: 1回目失敗後5秒、2回目失敗後15秒、3回目失敗後45秒
    RETRY_DELAYS = [5, 15, 45]

    def __init__(self, scraper_name: str, headless: bool = True):
        self.scraper_name = scraper_name
        self.headless = headless
        self.screenshot_dir = Path("data/screenshots")
        self.screenshot_dir.mkdir(parents=True, exist_ok=True)

        # 設定は遅延インポートで循環参照を回避
        from apps.api.src.config.settings import settings
        self.session_manager = SessionManager(scraper_name, settings.ENCRYPTION_KEY)

        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None

    async def __aenter__(self) -> "BaseScraper":
        await self._init_browser()
        return self

    async def __aexit__(self, *args: object) -> None:
        await self._close_browser()

    async def _init_browser(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        self._context = await self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
        )
        # playwright-stealth: ボット検知回避のため試みる（v2.x 対応）
        try:
            from playwright_stealth import Stealth  # type: ignore[import]
            await Stealth().apply_stealth_async(self._context)
            logger.debug("playwright-stealth 適用完了")
        except Exception as e:
            logger.warning("playwright-stealth 適用スキップ: %s", e)

        self._page = await self._context.new_page()

    async def _close_browser(self) -> None:
        if self._page:
            await self._page.close()
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if hasattr(self, "_playwright"):
            await self._playwright.stop()

    async def _save_screenshot(self, name: str) -> str:
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        path = self.screenshot_dir / f"{self.scraper_name}_{name}_{ts}.png"
        if self._page:
            await self._page.screenshot(path=str(path), full_page=True)
        return str(path)

    async def _random_wait(self, min_sec: float = 2.0, max_sec: float = 5.0) -> None:
        """スクレイピング検知を回避するためランダム待機"""
        await asyncio.sleep(random.uniform(min_sec, max_sec))

    @abstractmethod
    async def login(self) -> bool:
        """ログイン処理。成功したら True を返す。"""
        ...

    @abstractmethod
    async def scrape(self) -> dict:
        """スクレイプ処理。取得データを辞書で返す。"""
        ...

    async def run_with_retry(self) -> dict | None:
        """リトライ付きでスクレイプを実行する。全試行失敗時は例外を送出する。"""
        # RETRY_DELAYS の末尾に None を追加して最終試行を判別する
        delays_with_sentinel: list[int | None] = list(self.RETRY_DELAYS) + [None]
        total_attempts = len(delays_with_sentinel)

        for attempt, delay in enumerate(delays_with_sentinel, 1):
            try:
                logger.info("[%s] 試行 %d/%d", self.scraper_name, attempt, total_attempts)

                cookies = self.session_manager.load_session()
                if cookies and self._context:
                    # 保存済みCookieをコンテキストに注入した上で login() を呼び、
                    # 実際にサイトへアクセスしてセッションが有効かどうかを確認する。
                    # login() は既にログイン済みと判定した場合は即 True を返す設計。
                    await self._context.add_cookies(cookies)
                    logger.info("保存済みCookieを注入: セッション有効性を確認します")

                if not await self.login():
                    # ログイン失敗時はセッションファイルを削除して次のリトライを
                    # クリーンな状態（Cookieなし）から始められるようにする。
                    self.session_manager.clear_session()
                    raise RuntimeError("ログイン失敗")

                return await self.scrape()

            except Exception as e:
                logger.error("[%s] エラー: %s", self.scraper_name, e)
                await self._save_screenshot(f"error_attempt{attempt}")

                if delay is None:
                    logger.error("最大リトライ回数に達しました")
                    raise

                logger.info("%d秒後にリトライ...", delay)
                await asyncio.sleep(delay)

        # ここには到達しないが型チェックのために明示
        return None
