import asyncio
import logging
import re
from datetime import date
from .base import BaseScraper

logger = logging.getLogger(__name__)

# MF のカテゴリ名と DailyTotal カラム名のマッピング
# NOTE: MF の UI 変更によりカテゴリ名が変わる可能性あり。変更時は要確認。
CATEGORY_COLUMN_MAP: dict[str, str] = {
    "預金・現金・暗号資産": "cash_jpy",
    "株式（現物）": "stock_jp_jpy",
    "投資信託": "fund_jpy",
    "年金": "pension_jpy",
    "ポイント・マイル": "point_jpy",
}


class MFSBIScraper(BaseScraper):
    BASE_URL = "https://ssnb.x.moneyforward.com"
    LOGIN_URL = f"{BASE_URL}/"        # トップからSSO（id.moneyforward.com）へリダイレクト
    PORTFOLIO_URL = f"{BASE_URL}/bs/portfolio"

    def __init__(self, headless: bool = True):
        super().__init__("mf_sbi_bank", headless=headless)
        from apps.api.src.config.settings import settings
        self.settings = settings

    async def login(self) -> bool:
        try:
            # ポートフォリオページに直接アクセス（認証済みなら到達できる）
            await self._page.goto(self.PORTFOLIO_URL, wait_until="networkidle")
            await self._random_wait()

            current_url = self._page.url
            # ログイン不要（sign_in でも two_step でもない ssnb ページにいる）
            # NOTE: two_step を除外しないと 2FA ページを「ログイン済み」と誤認識する
            if (
                "ssnb.x.moneyforward.com" in current_url
                and "sign_in" not in current_url
                and "two_step" not in current_url
            ):
                logger.info("既にログイン済み (URL: %s)", current_url)
                return True

            logger.info("ログインページ検出 (URL: %s) — 認証情報でログイン試行", current_url)

            if not self.settings.MF_EMAIL or not self.settings.MF_PASSWORD:
                logger.error("MF_EMAIL / MF_PASSWORD が未設定です。~/.assetbridge/.env を確認してください。")
                return False

            # ssnb ログインフォームのセレクタ（実際の DOM に合わせた名前）
            EMAIL_SEL = 'input[name="sign_in_session_service[email]"]'
            PASS_SEL = 'input[name="sign_in_session_service[password]"]'
            SUBMIT_SEL = 'input[name="commit"][type="submit"]'

            await self._page.wait_for_selector(EMAIL_SEL, timeout=10000)
            await self._page.fill(EMAIL_SEL, self.settings.MF_EMAIL)
            await self._page.fill(PASS_SEL, self.settings.MF_PASSWORD)
            await self._page.click(SUBMIT_SEL)
            await self._random_wait(2.0, 4.0)

            # 2FA チェック（URL でトリガー判定）
            current_url = self._page.url
            _2fa_patterns = ("two_factor", "two_step_verif", "otp", "mfa")
            if any(p in current_url.lower() for p in _2fa_patterns):
                ok = await self._handle_2fa()
                if not ok:
                    return False

            # ログイン完了待ち（sign_in / two_step 以外の ssnb ページへ遷移を確認）
            await self._page.wait_for_function(
                "() => {"
                "  const url = window.location.href;"
                "  return url.includes('ssnb.x.moneyforward.com')"
                "    && !url.includes('sign_in')"
                "    && !url.includes('two_step');"
                "}",
                timeout=360000,  # 2FAコード入力を最大6分待つ
            )

            # セッション Cookie を暗号化保存
            cookies = await self._context.cookies()
            self.session_manager.save_session(cookies)
            logger.info("ログイン成功・セッション保存 (URL: %s)", self._page.url)
            return True

        except Exception as e:
            import traceback
            logger.error("ログインエラー: %s\n%s", e, traceback.format_exc())
            await self._save_screenshot("login_error")
            return False

    async def _handle_2fa(self) -> bool:
        """2FA（TOTP / メール認証）を処理する。成功したら True を返す。"""
        current_url = self._page.url
        logger.info("2FA ページ検出: %s", current_url)

        # TOTP 自動入力（MF_TOTP_SEED が有効な Base32 の場合）
        import os, base64
        totp_seed = self.settings.MF_TOTP_SEED
        if totp_seed:
            try:
                # Base32 デコードで妥当性確認（非ASCII や無効なBase32はここで弾く）
                base64.b32decode(totp_seed.upper().replace(" ", ""), casefold=True)
                import pyotp  # type: ignore[import]
                totp = pyotp.TOTP(totp_seed)
                code = totp.now()
                logger.info("TOTP 2FA: 自動入力")
                await self._page.fill('input[name="verification_code"]', code)
                await self._page.click('input[name="commit"][type="submit"]')
                # 送信後にリダイレクトが完了するまで待機する
                await self._random_wait(2.0, 4.0)
                return True
            except Exception as e:
                logger.warning("TOTP_SEED が無効なため TOTP をスキップ: %s", e)

        # メール認証: 環境変数 MF_2FA_CODE が設定されていれば即時入力
        env_code = os.environ.get("MF_2FA_CODE", "")
        if env_code:
            logger.info("MF_2FA_CODE からコード入力: %s", env_code)
            # 方法1: 認証URLへ直接ナビゲート（MF メール認証の場合）
            verify_url = f"{self.BASE_URL}/users/two_step_verifications/verify/{env_code}"
            try:
                await self._page.goto(verify_url, wait_until="networkidle")
                # 認証URLへのナビゲート成功の確認:
                # ssnb.x.moneyforward.com のページにいて、かつ two_step ページでない場合のみ成功とみなす。
                # id.moneyforward.com 等の外部ドメインに飛ばされた場合は失敗扱いにしてフォーム方式を試みる。
                if (
                    "ssnb.x.moneyforward.com" in self._page.url
                    and "two_step" not in self._page.url
                ):
                    logger.info("URL 認証成功: %s", self._page.url)
                    return True
            except Exception:
                pass
            # 方法2: フォームに入力して送信
            await self._page.fill('input[name="verification_code"]', env_code)
            await self._page.click('input[name="commit"][type="submit"]')
            # 送信後にリダイレクトが完了するまで待機する
            await self._random_wait(2.0, 4.0)
            return True

        # 手動入力モード: DB（app_settings: mf_2fa_pending_code）またはファイルを監視（10分タイムアウト）
        # NOTE: Windows では /tmp は Git Bash 仮想パスであり Python の tempfile と不一致になるため、
        #       DB ポーリングを優先し、ファイルは tempfile.gettempdir() の実パスを使用する。
        import tempfile
        code_file = os.path.join(tempfile.gettempdir(), "mf_2fa_code.txt")
        logger.warning(
            "メール 2FA が必要です。以下のいずれかでコードを入力してください:\n"
            "  1) Web UI の設定ページ → '2FA コード入力' セクションに入力\n"
            "  2) echo <コード> > %s\n"
            "  3) 環境変数 MF_2FA_CODE=<コード> を設定して再実行",
            code_file,
        )
        for _ in range(60):  # 10秒×60回 = 10分
            await asyncio.sleep(10)

            # 方法1: DB から取得（Web UI 経由で POST /scrape/2fa が書き込んだコード）
            try:
                from apps.api.src.db.database import db_session
                from apps.api.src.db.repositories import AppSettingsRepository
                with db_session() as db:
                    repo = AppSettingsRepository(db)
                    db_code = repo.get("mf_2fa_pending_code")
                    if db_code:
                        # 消費済みとして空文字にリセットしてから使用する
                        repo.set("mf_2fa_pending_code", "")
                        code = db_code.strip()
                        if code:
                            logger.info("DB からコード取得: %s", code)
                            await self._page.fill('input[name="verification_code"]', code)
                            await self._page.click('input[name="commit"][type="submit"]')
                            await self._random_wait(2.0, 4.0)
                            return True
            except Exception as e:
                logger.debug("DB ポーリングエラー（継続）: %s", e)

            # 方法2: ファイルから取得（tempfile.gettempdir() の実パスを使用）
            if os.path.exists(code_file):
                with open(code_file) as f:
                    code = f.read().strip()
                os.remove(code_file)
                if code:
                    logger.info("ファイルからコード取得: %s", code)
                    await self._page.fill('input[name="verification_code"]', code)
                    await self._page.click('input[name="commit"][type="submit"]')
                    await self._random_wait(2.0, 4.0)
                    return True

        logger.error("2FA タイムアウト（10分）")
        return False

    async def scrape(self) -> dict:
        """スクレイプ全体を実行し、実行ログを scrape_logs に記録する。"""
        from apps.api.src.db.database import db_session
        from apps.api.src.db.repositories import ScrapeLogRepository

        # スクレイプ開始ログを記録
        with db_session() as db:
            log_repo = ScrapeLogRepository(db)
            scrape_log = log_repo.start()
            log_id: int = scrape_log.id

        # 一括更新ボタンをクリックして最新データを取得
        try:
            await self._page.goto(f"{self.BASE_URL}/", wait_until="networkidle")
            refresh_btn = await self._page.query_selector('a.refresh, a[href*="aggregation_queue"]')
            if refresh_btn:
                await refresh_btn.click()
                logger.info("一括更新クリック済み。30分後にスクレイプ開始...")
                await asyncio.sleep(1800)  # MF のサーバー側集計完了まで30分待機
            else:
                logger.warning("一括更新ボタンが見つかりませんでした")
        except Exception as e:
            logger.warning("一括更新エラー（継続）: %s", e)

        await self._page.goto(self.PORTFOLIO_URL, wait_until="networkidle")
        await self._random_wait()

        # ログインページへのリダイレクトを検出した場合はセッションが期限切れと判断し、
        # 保存済みセッションを削除してから RuntimeError を送出する。
        # 上位の run_with_retry() が次のリトライでクリーンなログインを行う。
        current_url = self._page.url
        if "sign_in" in current_url or "id.moneyforward.com" in current_url:
            logger.warning("スクレイプ中にログインリダイレクト検出 — セッションが無効 (URL: %s)", current_url)
            self.session_manager.clear_session()
            raise RuntimeError("セッション期限切れ: 再ログインが必要")

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

        HTML 構造:
          - 総資産: div.heading-radius-box の inner_text に "資産総額：\n38,247,980円" 形式
          - カテゴリ行: table tr 要素で th=1, td=2 の構造（最初の5行がカテゴリサマリー）
            - th > a = カテゴリ名
            - 最初の td = 金額
        """
        # 総資産テキストから金額を抽出（"資産総額：\n38,247,980円" 形式）
        total_el = await self._page.query_selector(".heading-radius-box")
        total_text = await total_el.inner_text() if total_el else ""
        total_jpy = self._parse_jpy(total_text)

        # カテゴリ別内訳（th=1, td=2 の行をカテゴリサマリーとして取得）
        breakdown: dict[str, float] = {}
        trs = await self._page.query_selector_all("table tr")
        for tr in trs:
            try:
                ths = await tr.query_selector_all("th")
                tds = await tr.query_selector_all("td")
                # カテゴリサマリー行の判定: th=1, td=2
                if len(ths) == 1 and len(tds) == 2:
                    link = await ths[0].query_selector("a")
                    if link:
                        name = (await link.inner_text()).strip()
                        value = self._parse_jpy(await tds[0].inner_text())
                        if name and value > 0:
                            breakdown[name] = value
            except Exception:
                pass

        return {"total_jpy": total_jpy, "breakdown": breakdown}

    async def _scrape_holdings(self) -> list[dict]:
        """保有銘柄一覧を取得する。
        NOTE: セレクタは MF の UI 変更により変わる可能性あり。変更時は要確認。

        HTML 構造:
          - 株式等の保有行: table tr で td=13
            - td[0]=コード, td[1]=銘柄名, td[2]=保有数, td[3]=平均取得単価,
              td[4]=現在値, td[5]=評価額(円含む), td[6]=前日比,
              td[7]=評価損益(円含む), td[8]=評価損益率(%含む), td[9]=保有機関
          - 現金・預金行: table tr で td=5
            - td[0]=名称, td[1]=残高(円含む), td[2]=保有機関
        """
        holdings: list[dict] = []
        trs = await self._page.query_selector_all("table tr")

        for tr in trs:
            try:
                cells = await tr.query_selector_all("td")

                if len(cells) == 13:
                    # 株式・ETF・投資信託の保有行
                    name = (await cells[1].inner_text()).strip()
                    if not name:
                        continue
                    holding = {
                        "code": (await cells[0].inner_text()).strip(),
                        "name": name,
                        "quantity": self._parse_number(await cells[2].inner_text()),
                        "cost_price": self._parse_number(await cells[3].inner_text()),
                        "current_price": self._parse_number(await cells[4].inner_text()),
                        "value_jpy": self._parse_jpy(await cells[5].inner_text()),
                        "prev_day_diff_jpy": self._parse_jpy(await cells[6].inner_text()),
                        "unrealized_pnl_jpy": self._parse_jpy(await cells[7].inner_text()),
                        "unrealized_pnl_pct": self._parse_pct(await cells[8].inner_text()),
                        "broker": (await cells[9].inner_text()).strip(),
                        "asset_type": "stock",
                    }
                    holdings.append(holding)

                elif len(cells) == 5:
                    # 現金・預金・ポイント行
                    name = (await cells[0].inner_text()).strip()
                    value_text = (await cells[1].inner_text()).strip()
                    value = self._parse_jpy(value_text)
                    if not name or value <= 0:
                        continue
                    broker = (await cells[2].inner_text()).strip()
                    holding = {
                        "code": "",
                        "name": name,
                        "quantity": 1.0,
                        "cost_price": value,
                        "current_price": value,
                        "value_jpy": value,
                        "prev_day_diff_jpy": 0.0,
                        "unrealized_pnl_jpy": 0.0,
                        "unrealized_pnl_pct": 0.0,
                        "broker": broker,
                        "asset_type": "cash",
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

    def _parse_number(self, text: str) -> float:
        """「1,717」「19.65」形式のテキストを float に変換する。"""
        cleaned = re.sub(r"[^0-9.]", "", text.replace(",", ""))
        try:
            return float(cleaned)
        except ValueError:
            return 0.0

    def _parse_pct(self, text: str) -> float:
        """「138.26%」形式のテキストを float に変換する。"""
        cleaned = re.sub(r"[^0-9.\-]", "", text)
        try:
            return float(cleaned)
        except ValueError:
            return 0.0

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
        from apps.api.src.db.repositories import DailyTotalRepository, AssetRepository, SnapshotRepository

        records = 0
        today = date.today()

        with db_session() as db:
            daily_repo = DailyTotalRepository(db)
            asset_repo = AssetRepository(db)
            snap_repo = SnapshotRepository(db)

            # 1. DailyTotal（総資産・カテゴリ別内訳）を保存
            total_data = data.get("total", {})
            total_jpy = total_data.get("total_jpy")
            if total_jpy:
                prev_list = daily_repo.get_history(days=1)
                if prev_list:
                    prev_total = prev_list[-1].total_jpy
                    diff = total_jpy - prev_total
                    diff_pct = (diff / prev_total * 100.0) if prev_total else 0.0
                else:
                    diff = 0.0
                    diff_pct = 0.0

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

            # 2. 保有銘柄を assets + portfolio_snapshots に保存
            for holding in data.get("holdings", []):
                symbol = (holding.get("code") or holding.get("name", ""))[:50]
                name = holding.get("name", symbol)
                if not symbol or not name:
                    continue

                asset_type = self._detect_asset_type(holding.get("code", ""))
                asset = asset_repo.upsert(
                    symbol=symbol,
                    name=name,
                    asset_type=asset_type,
                    currency="JPY",
                )
                quantity = holding.get("quantity", 0.0)
                cost_price = holding.get("cost_price", 0.0)
                snap_repo.upsert(
                    asset_id=asset.id,
                    snapshot_date=today,
                    quantity=quantity,
                    price_jpy=holding.get("current_price", 0.0),
                    value_jpy=holding.get("value_jpy", 0.0),
                    cost_basis_jpy=cost_price * quantity,
                    unrealized_pnl_jpy=holding.get("unrealized_pnl_jpy", 0.0),
                    unrealized_pnl_pct=holding.get("unrealized_pnl_pct", 0.0),
                )
                records += 1

        logger.info("DB保存完了: %d 件 (daily_totals + %d holdings)", records, records - 1)
        return records

    @staticmethod
    def _detect_asset_type(code: str) -> "AssetType":
        """銘柄コードから AssetType を推測する。
        - 4〜5桁の数字     → STOCK_JP（日本株・ETF）
        - 英字のみ 1〜6文字 → STOCK_US（米国株）
        - 英数字混在       → FUND（投資信託）
        - 空文字           → CASH
        """
        from apps.api.src.db.models import AssetType
        c = code.strip()
        if not c:
            return AssetType.CASH
        if re.match(r"^\d{4,5}$", c):
            return AssetType.STOCK_JP
        if re.match(r"^[A-Za-z]{1,6}$", c):
            return AssetType.STOCK_US
        return AssetType.FUND
