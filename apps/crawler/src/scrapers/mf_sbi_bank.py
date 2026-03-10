import asyncio
import logging
import re
from datetime import date
from .base import BaseScraper

logger = logging.getLogger(__name__)

# MF のカテゴリ名と DailyTotal カラム名のマッピング
# NOTE: MF の UI 変更によりカテゴリ名が変わる可能性あり。変更時は要確認。
CATEGORY_COLUMN_MAP: dict[str, str] = {
    "日本株": "stock_jp_jpy",
    "外国株": "stock_us_jpy",
    "投資信託": "fund_jpy",
    "仮想通貨": "crypto_jpy",
    "現金・預金": "cash_jpy",
    "年金": "pension_jpy",
    "ポイント": "point_jpy",
}


class MFSBIScraper(BaseScraper):
    LOGIN_URL = "https://id.moneyforward.com/sign_in"
    BASE_URL = "https://netbk.moneyforward.com"
    PORTFOLIO_URL = f"{BASE_URL}/bs/portfolio"

    def __init__(self, headless: bool = True):
        super().__init__("mf_sbi_bank", headless=headless)
        from apps.api.src.config.settings import settings
        self.settings = settings

    async def login(self) -> bool:
        try:
            await self._page.goto(self.LOGIN_URL, wait_until="networkidle")
            await self._random_wait()

            # メールアドレス入力
            await self._page.fill('input[name="email"]', self.settings.MF_EMAIL)
            await self._page.click('button[type="submit"]')
            await self._random_wait()

            # パスワード入力
            await self._page.fill('input[name="password"]', self.settings.MF_PASSWORD)
            await self._page.click('button[type="submit"]')
            await self._random_wait(2.0, 4.0)

            # 2FA チェック（URL でトリガー判定）
            current_url = self._page.url
            if "two_factor" in current_url or "otp" in current_url.lower():
                await self._handle_2fa()

            # ポートフォリオページへのリダイレクトでログイン成功を確認
            await self._page.wait_for_url("**/bs/portfolio**", timeout=15000)

            # セッション Cookie を暗号化保存
            cookies = await self._context.cookies()
            self.session_manager.save_session(cookies)
            logger.info("ログイン成功・セッション保存")
            return True

        except Exception as e:
            logger.error("ログインエラー: %s", e)
            await self._save_screenshot("login_error")
            return False

    async def _handle_2fa(self) -> None:
        if self.settings.MF_TOTP_SEED:
            import pyotp  # type: ignore[import]
            totp = pyotp.TOTP(self.settings.MF_TOTP_SEED)
            code = totp.now()
            logger.info("TOTP 2FA: 自動入力")
            await self._page.fill('input[name="otp"]', code)
            await self._page.click('button[type="submit"]')
        else:
            # SMS 2FA: 将来 Discord 連携で実装予定（現在は手動入力待ち）
            logger.warning("SMS 2FA が必要ですが未実装です。手動でコードを入力してください。")
            await asyncio.sleep(300)  # 5分タイムアウト

    async def scrape(self) -> dict:
        """スクレイプ全体を実行し、実行ログを scrape_logs に記録する。"""
        from apps.api.src.db.database import db_session
        from apps.api.src.db.repositories import ScrapeLogRepository

        # スクレイプ開始ログを記録
        with db_session() as db:
            log_repo = ScrapeLogRepository(db)
            scrape_log = log_repo.start()
            log_id: int = scrape_log.id

        await self._page.goto(self.PORTFOLIO_URL, wait_until="networkidle")
        await self._random_wait()

        data: dict = {}
        error_msg: str | None = None
        screenshot_path: str | None = None

        try:
            try:
                data["total"] = await self._scrape_total()
            except Exception as e:
                logger.error("総資産スクレイプエラー: %s", e)
                screenshot_path = await self._save_screenshot("scrape_total_error")
                data["total"] = {}

            try:
                data["holdings"] = await self._scrape_holdings()
            except Exception as e:
                logger.error("保有銘柄スクレイプエラー: %s", e)
                if screenshot_path is None:
                    screenshot_path = await self._save_screenshot("scrape_holdings_error")
                data["holdings"] = []

            try:
                data["cashflow"] = await self._scrape_cashflow()
            except Exception as e:
                logger.error("収支スクレイプエラー: %s", e)
                if screenshot_path is None:
                    screenshot_path = await self._save_screenshot("scrape_cashflow_error")
                data["cashflow"] = []

            records = await self._save_to_db(data)

        except Exception as e:
            error_msg = str(e)
            records = 0
            logger.error("スクレイプ全体エラー: %s", e)
            screenshot_path = await self._save_screenshot("scrape_fatal_error")

        # スクレイプ終了ログを記録
        with db_session() as db:
            log_repo = ScrapeLogRepository(db)
            log_repo.finish(
                log_id,
                records_saved=records,
                error_message=error_msg,
                screenshot_path=screenshot_path,
            )

        return data

    async def _scrape_total(self) -> dict:
        """総資産とカテゴリ別内訳を取得する。
        NOTE: セレクタは MF の UI 変更により変わる可能性あり。変更時は要確認。
        """
        total_text = await self._page.inner_text(".total-assets-value, .bs-total-assets")
        total_jpy = self._parse_jpy(total_text)

        breakdown: dict[str, float] = {}
        # カテゴリ別内訳（現金/株式/投資信託/暗号資産/年金/ポイント等）
        # NOTE: セレクタは MF の UI 変更により変わる可能性あり
        category_items = await self._page.query_selector_all(
            ".asset-category-item, .category-list-item"
        )
        for item in category_items:
            try:
                name_el = await item.query_selector(".category-name, .asset-type-name")
                value_el = await item.query_selector(".category-value, .asset-type-value")
                if name_el and value_el:
                    name = (await name_el.inner_text()).strip()
                    value = self._parse_jpy(await value_el.inner_text())
                    breakdown[name] = value
            except Exception:
                pass

        return {"total_jpy": total_jpy, "breakdown": breakdown}

    async def _scrape_holdings(self) -> list[dict]:
        """保有銘柄一覧を取得する。
        NOTE: セレクタは MF の UI 変更により変わる可能性あり。変更時は要確認。
        """
        holdings: list[dict] = []
        # NOTE: セレクタは MF の UI 変更により変わる可能性あり
        holding_rows = await self._page.query_selector_all(
            ".portfolio-table tr, .asset-list-item"
        )

        for row in holding_rows:
            try:
                cells = await row.query_selector_all("td")
                if len(cells) < 3:
                    continue

                holding = {
                    "name": (await cells[0].inner_text()).strip(),
                    "quantity": 0.0,
                    "value_jpy": 0.0,
                    "cost_basis_jpy": 0.0,
                    "unrealized_pnl_jpy": 0.0,
                }
                holdings.append(holding)
            except Exception:
                pass

        return holdings

    async def _scrape_cashflow(self) -> list[dict]:
        """月別収支を取得する。
        NOTE: セレクタは MF の UI 変更により変わる可能性あり。変更時は要確認。
        """
        try:
            await self._page.goto(f"{self.BASE_URL}/cf", wait_until="networkidle")
            await self._random_wait()
        except Exception as e:
            logger.error("収支ページへの遷移エラー: %s", e)
            return []

        # TODO: 月別収支データ取得を実装（MF の CF ページ構造確認後に追加）
        return []

    def _parse_jpy(self, text: str) -> float:
        """「1,234,567円」形式のテキストを float に変換する。"""
        cleaned = re.sub(r"[^0-9.]", "", text.replace(",", ""))
        try:
            return float(cleaned)
        except ValueError:
            return 0.0

    async def _save_to_db(self, data: dict) -> int:
        """スクレイプデータを DB に保存する。保存件数を返す。"""
        from apps.api.src.db.database import db_session
        from apps.api.src.db.repositories import DailyTotalRepository

        records = 0
        today = date.today()

        with db_session() as db:
            daily_repo = DailyTotalRepository(db)

            total_data = data.get("total", {})
            total_jpy = total_data.get("total_jpy")
            if total_jpy:
                prev_list = daily_repo.get_history(days=1)
                prev_total = prev_list[-1].total_jpy if prev_list else 0.0
                diff = total_jpy - prev_total
                diff_pct = (diff / prev_total * 100.0) if prev_total else 0.0

                # カテゴリ別内訳を DailyTotal のカラムにマッピング
                breakdown = total_data.get("breakdown", {})
                category_kwargs: dict[str, float] = {}
                for category_name, column_name in CATEGORY_COLUMN_MAP.items():
                    if category_name in breakdown:
                        category_kwargs[column_name] = breakdown[category_name]

                daily_repo.upsert(
                    today,
                    total_jpy=total_jpy,
                    prev_day_diff_jpy=diff,
                    prev_day_diff_pct=diff_pct,
                    **category_kwargs,
                )
                records += 1

        return records
