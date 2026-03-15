"""
AssetBridge ダッシュボード バグ洗い出しスクリプト

各ページを巡回してスクリーンショット撮影 + コンソールエラー / ネットワークエラーを収集する。
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Page, Route, sync_playwright

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:3000"
API_URL = "http://localhost:8000"
API_KEY = "test"

SCREENSHOT_DIR = Path("D:/VSCode/AssetBridge/logs/screenshots")
WAIT_SECONDS = 5  # 各ページでの待機秒数（描画・非同期データロード完了待ち）

PAGES = [
    {"name": "ダッシュボード", "path": "/", "slug": "dashboard"},
    {"name": "資産一覧",       "path": "/assets",          "slug": "assets"},
    {"name": "収支",           "path": "/income-expense",  "slug": "income_expense"},
    {"name": "インサイト",     "path": "/insights",        "slug": "insights"},
    {"name": "連携サービス",   "path": "/linked-services", "slug": "linked_services"},
    {"name": "設定",           "path": "/settings",        "slug": "settings"},
    {"name": "シミュレーター", "path": "/simulator",       "slug": "simulator"},
]

# ---------------------------------------------------------------------------
# ロガー
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# データクラス
# ---------------------------------------------------------------------------


@dataclass
class PageReport:
    name: str
    path: str
    slug: str
    console_errors: list[str] = field(default_factory=list)
    console_warnings: list[str] = field(default_factory=list)
    network_errors: list[dict[str, Any]] = field(default_factory=list)
    screenshot_path: str = ""
    page_title: str = ""
    load_ok: bool = True
    load_error: str = ""
    element_checks: list[dict[str, Any]] = field(default_factory=list)
    button_interactions: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class FullReport:
    pages: list[PageReport] = field(default_factory=list)


# ---------------------------------------------------------------------------
# ページ巡回
# ---------------------------------------------------------------------------


def visit_page(page: Page, page_info: dict[str, str]) -> PageReport:
    report = PageReport(
        name=page_info["name"],
        path=page_info["path"],
        slug=page_info["slug"],
    )

    # コンソールエラー収集
    def on_console(msg: Any) -> None:
        if msg.type == "error":
            report.console_errors.append(msg.text)
        elif msg.type == "warning":
            report.console_warnings.append(msg.text)

    # ネットワークエラー収集（4xx / 5xx）
    def on_response(response: Any) -> None:
        if response.status >= 400:
            report.network_errors.append({
                "status": response.status,
                "url": response.url,
            })

    page.on("console", on_console)
    page.on("response", on_response)

    url = f"{BASE_URL}{page_info['path']}"
    logger.info("訪問中: %s (%s)", page_info["name"], url)

    try:
        page.goto(url, wait_until="networkidle", timeout=30_000)
    except Exception as exc:
        report.load_ok = False
        report.load_error = str(exc)
        logger.warning("ページロード失敗: %s — %s", url, exc)
        # 失敗してもスクリーンショットを撮る
        _take_screenshot(page, report)
        return report

    # 追加待機（非同期データロード完了）
    page.wait_for_timeout(WAIT_SECONDS * 1000)

    report.page_title = page.title()

    # スクリーンショット（初期表示）
    _take_screenshot(page, report)

    # ページごとのインタラクション
    _interact_page(page, report)

    # イベントリスナーを除去
    page.remove_listener("console", on_console)
    page.remove_listener("response", on_response)

    return report


def _take_screenshot(page: Page, report: PageReport, suffix: str = "") -> None:
    filename = f"{report.slug}{suffix}.png"
    path = str(SCREENSHOT_DIR / filename)
    try:
        page.screenshot(path=path, full_page=True)
        if not suffix:
            report.screenshot_path = path
        logger.info("スクリーンショット保存: %s", path)
    except Exception as exc:
        logger.warning("スクリーンショット失敗: %s", exc)


def _interact_page(page: Page, report: PageReport) -> None:
    """ページごとのボタンクリック等のインタラクションを実行する。"""
    slug = report.slug

    if slug == "dashboard":
        _interact_dashboard(page, report)
    elif slug == "assets":
        _interact_assets(page, report)
    elif slug == "settings":
        _interact_settings(page, report)
    elif slug == "linked_services":
        _interact_linked_services(page, report)
    elif slug == "insights":
        _interact_insights(page, report)
    elif slug == "income_expense":
        _interact_income_expense(page, report)
    elif slug == "simulator":
        _interact_simulator(page, report)


def _record_interaction(
    report: PageReport,
    action: str,
    target: str,
    result: str,
    error: str = "",
) -> None:
    report.button_interactions.append({
        "action": action,
        "target": target,
        "result": result,
        "error": error,
    })


def _check_element(
    report: PageReport,
    label: str,
    found: bool,
    detail: str = "",
) -> None:
    report.element_checks.append({
        "label": label,
        "found": found,
        "detail": detail,
    })


# ---------------------------------------------------------------------------
# ページ別インタラクション
# ---------------------------------------------------------------------------


def _interact_dashboard(page: Page, report: PageReport) -> None:
    # 総資産カードの存在確認
    total_card = page.locator("text=総資産").first
    _check_element(report, "総資産カード", total_card.count() > 0)

    # 資産推移グラフの存在確認
    chart = page.locator("canvas").first
    _check_element(report, "資産推移グラフ (canvas)", chart.count() > 0)

    # 含み損益 TOP5 テーブルの存在確認
    pnl_table = page.locator("text=含み損益 TOP5").first
    _check_element(report, "含み損益 TOP5", pnl_table.count() > 0)

    # AIコメントセクションの存在確認
    ai_section = page.locator("text=AIコメント").first
    _check_element(report, "AIコメントセクション", ai_section.count() > 0)

    # AIコメント生成ボタンのクリック
    ai_btn = page.locator("button", has_text="AIコメントを生成").first
    if ai_btn.count() > 0:
        try:
            ai_btn.click()
            page.wait_for_timeout(3000)
            _take_screenshot(page, report, suffix="_after_ai_click")
            _record_interaction(report, "click", "AIコメントを生成ボタン", "クリック成功")
        except Exception as exc:
            _record_interaction(report, "click", "AIコメントを生成ボタン", "失敗", str(exc))
    else:
        _record_interaction(report, "click", "AIコメントを生成ボタン", "ボタンが見つからない")

    # 「データがありません」メッセージの検出（バグの可能性）
    no_data = page.locator("text=データがありません").first
    if no_data.count() > 0:
        _check_element(report, "「データがありません」表示（バグ候補）", True, "データが空の可能性")


def _interact_assets(page: Page, report: PageReport) -> None:
    # タブの存在確認
    tabs = page.locator("nav[aria-label='資産タイプフィルタ'] button")
    tab_count = tabs.count()
    _check_element(report, f"タブボタン ({tab_count}個)", tab_count > 0, f"expected 7, got {tab_count}")

    # 資産テーブルの存在確認
    table = page.locator("table[aria-label='資産一覧テーブル']").first
    _check_element(report, "資産一覧テーブル", table.count() > 0)

    if table.count() > 0:
        rows = page.locator("table[aria-label='資産一覧テーブル'] tbody tr")
        row_count = rows.count()
        _check_element(report, f"資産行数 ({row_count}行)", True, f"表示されている銘柄数: {row_count}")

    # 「日本株」タブのクリック
    jp_tab = page.locator("button", has_text="日本株").first
    if jp_tab.count() > 0:
        try:
            jp_tab.click()
            page.wait_for_timeout(2000)
            _take_screenshot(page, report, suffix="_tab_stock_jp")
            _record_interaction(report, "click", "日本株タブ", "クリック成功")
        except Exception as exc:
            _record_interaction(report, "click", "日本株タブ", "失敗", str(exc))

    # 最初の銘柄行をクリックしてモーダルを開く
    first_row = page.locator("tbody tr[role='button']").first
    if first_row.count() > 0:
        try:
            first_row.click()
            page.wait_for_timeout(1000)
            modal = page.locator("div[role='dialog']").first
            _check_element(report, "銘柄詳細モーダル", modal.count() > 0)
            if modal.count() > 0:
                _take_screenshot(page, report, suffix="_modal_open")
                _record_interaction(report, "click", "銘柄行 → モーダル表示", "成功")

                # モーダルを ESC で閉じる
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)
                _record_interaction(report, "keypress", "ESCでモーダルを閉じる", "実行")
            else:
                _record_interaction(report, "click", "銘柄行クリック", "モーダルが出現しない（バグ候補）")
        except Exception as exc:
            _record_interaction(report, "click", "銘柄行クリック", "失敗", str(exc))
    else:
        _check_element(report, "銘柄行 (tbody tr[role='button'])", False, "行が存在しない")


def _interact_settings(page: Page, report: PageReport) -> None:
    # システムプロンプト テキストエリアの存在確認
    textarea = page.locator("textarea[aria-label='AIエージェント システムプロンプト']").first
    _check_element(report, "システムプロンプト テキストエリア", textarea.count() > 0)

    if textarea.count() > 0:
        current_text = textarea.input_value()
        _check_element(
            report,
            "システムプロンプト（内容あり）",
            len(current_text) > 0,
            f"文字数: {len(current_text)}",
        )

    # 保存ボタンのクリック（テキストエリアが空でも実行）
    save_btn = page.locator("button[aria-label='システムプロンプトを保存']").first
    if save_btn.count() > 0:
        try:
            save_btn.click()
            page.wait_for_timeout(2000)
            _take_screenshot(page, report, suffix="_after_save")
            _record_interaction(report, "click", "システムプロンプト保存ボタン", "クリック成功")
        except Exception as exc:
            _record_interaction(report, "click", "システムプロンプト保存ボタン", "失敗", str(exc))

    # スクレイプスケジュール保存ボタン
    sched_btn = page.locator("button[aria-label='スクレイプスケジュールを保存']").first
    if sched_btn.count() > 0:
        try:
            sched_btn.click()
            page.wait_for_timeout(1500)
            _record_interaction(report, "click", "スクレイプスケジュール保存", "クリック成功")
        except Exception as exc:
            _record_interaction(report, "click", "スクレイプスケジュール保存", "失敗", str(exc))

    # AI コメント TTL 保存ボタン
    ttl_btn = page.locator("button[aria-label='AI コメント TTL を保存']").first
    if ttl_btn.count() > 0:
        try:
            ttl_btn.click()
            page.wait_for_timeout(1500)
            _record_interaction(report, "click", "AI TTL 保存", "クリック成功")
        except Exception as exc:
            _record_interaction(report, "click", "AI TTL 保存", "失敗", str(exc))

    # Discord Bot 状態確認
    discord_badge = page.locator("text=Discord Bot").first
    _check_element(report, "Discord Bot セクション", discord_badge.count() > 0)

    # MCP Server 状態確認
    mcp_badge = page.locator("text=MCP Server").first
    _check_element(report, "MCP Server セクション", mcp_badge.count() > 0)

    # 2FA コード入力フィールド
    twofa_input = page.locator("input[aria-label='2FA 認証コード']").first
    _check_element(report, "2FA コード入力フィールド", twofa_input.count() > 0)

    _take_screenshot(page, report, suffix="_after_interactions")


def _interact_linked_services(page: Page, report: PageReport) -> None:
    # サービスカードの存在確認
    mf_card = page.locator("text=マネーフォワード for 住信SBI銀行").first
    _check_element(report, "マネーフォワード サービスカード", mf_card.count() > 0)

    discord_card = page.locator("text=Discord Bot").first
    _check_element(report, "Discord Bot サービスカード", discord_card.count() > 0)

    mcp_card = page.locator("text=MCP Server").first
    _check_element(report, "MCP Server サービスカード", mcp_card.count() > 0)

    # ステータスバッジの確認
    badges = page.locator("[role='status']")
    badge_count = badges.count()
    _check_element(report, f"ステータスバッジ ({badge_count}個)", badge_count > 0)

    # エラー表示の検出
    error_alert = page.locator("[role='alert']").first
    if error_alert.count() > 0:
        _check_element(report, "エラーアラート（バグ候補）", True, error_alert.text_content() or "")


def _interact_insights(page: Page, report: PageReport) -> None:
    # アセット配分グラフ
    alloc_heading = page.locator("text=アセット配分").first
    _check_element(report, "アセット配分セクション", alloc_heading.count() > 0)

    canvas_els = page.locator("canvas")
    canvas_count = canvas_els.count()
    _check_element(report, f"グラフ (canvas) ({canvas_count}個)", canvas_count > 0)

    # 含み損益ランキング
    pnl_heading = page.locator("text=含み損益ランキング").first
    _check_element(report, "含み損益ランキングセクション", pnl_heading.count() > 0)

    # 「データがありません」の検出
    no_data = page.locator("text=データがありません")
    no_data_count = no_data.count()
    if no_data_count > 0:
        _check_element(
            report,
            f"「データがありません」表示（{no_data_count}箇所）",
            True,
            "グラフデータが空の可能性",
        )


def _interact_income_expense(page: Page, report: PageReport) -> None:
    # 月別収支グラフ
    canvas_els = page.locator("canvas")
    canvas_count = canvas_els.count()
    _check_element(report, f"グラフ (canvas) ({canvas_count}個)", canvas_count > 0)

    # サマリーカード（平均月収等）
    avg_income = page.locator("text=平均月収").first
    _check_element(report, "平均月収カード", avg_income.count() > 0)


def _interact_simulator(page: Page, report: PageReport) -> None:
    # シミュレーターページの基本要素確認
    heading = page.locator("h1").first
    heading_text = heading.text_content() if heading.count() > 0 else ""
    _check_element(report, "h1 見出し", heading.count() > 0, heading_text)

    # 実行ボタンの存在確認
    run_btn = page.locator("button", has_text="シミュレーション").first
    _check_element(report, "シミュレーション実行ボタン", run_btn.count() > 0)

    # 「データがありません」の検出
    no_data = page.locator("text=データがありません").first
    if no_data.count() > 0:
        _check_element(report, "「データがありません」表示", True, "データ欠如の可能性")


# ---------------------------------------------------------------------------
# レポート出力
# ---------------------------------------------------------------------------


def print_report(full_report: FullReport) -> None:
    print("\n" + "=" * 80)
    print("AssetBridge バグ洗い出しレポート")
    print("=" * 80)

    all_bugs: list[str] = []

    for pr in full_report.pages:
        print(f"\n{'─' * 60}")
        print(f"[{pr.name}] {pr.path}")
        print(f"  ページタイトル : {pr.page_title or '(取得失敗)'}")
        print(f"  スクリーンショット : {pr.screenshot_path or '(なし)'}")

        if not pr.load_ok:
            bug = f"[{pr.name}] ページロード失敗: {pr.load_error}"
            print(f"  ERROR: {bug}")
            all_bugs.append(bug)

        # コンソールエラー
        if pr.console_errors:
            for err in pr.console_errors:
                print(f"  CONSOLE ERROR: {err}")
                all_bugs.append(f"[{pr.name}] コンソールエラー: {err}")

        # ネットワークエラー
        if pr.network_errors:
            for ne in pr.network_errors:
                msg = f"HTTP {ne['status']}: {ne['url']}"
                print(f"  NETWORK ERROR: {msg}")
                all_bugs.append(f"[{pr.name}] ネットワークエラー: {msg}")

        # 要素チェック
        if pr.element_checks:
            print("  要素チェック:")
            for chk in pr.element_checks:
                mark = "OK" if chk["found"] else "MISSING"
                detail = f" — {chk['detail']}" if chk["detail"] else ""
                print(f"    [{mark}] {chk['label']}{detail}")
                if not chk["found"]:
                    all_bugs.append(f"[{pr.name}] 要素なし: {chk['label']}{detail}")

        # インタラクション結果
        if pr.button_interactions:
            print("  インタラクション:")
            for bi in pr.button_interactions:
                err_str = f" エラー={bi['error']}" if bi["error"] else ""
                print(f"    {bi['action'].upper()} {bi['target']} → {bi['result']}{err_str}")
                if bi["error"]:
                    all_bugs.append(f"[{pr.name}] インタラクション失敗: {bi['target']} — {bi['error']}")

    # サマリー
    print(f"\n{'=' * 80}")
    print(f"バグ候補一覧 (合計 {len(all_bugs)} 件)")
    print("=" * 80)
    if all_bugs:
        for i, bug in enumerate(all_bugs, 1):
            print(f"  {i:2d}. {bug}")
    else:
        print("  バグは検出されませんでした。")
    print()


# ---------------------------------------------------------------------------
# エントリポイント
# ---------------------------------------------------------------------------


def main() -> None:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Playwright バグ洗い出し開始")
    logger.info("対象: %s", BASE_URL)

    full_report = FullReport()

    with sync_playwright() as pw:
        browser: Browser = pw.chromium.launch(headless=True)
        context: BrowserContext = browser.new_context(
            viewport={"width": 1440, "height": 900},
            # API Key をリクエストヘッダーに付与する（ブラウザ側 Next.js は NEXT_PUBLIC_API_KEY で解決するが
            # 念のため context レベルでは設定しない — Next.js のクライアント側コードが使う環境変数は
            # ビルド時に埋め込まれているため。）
        )

        for page_info in PAGES:
            page: Page = context.new_page()
            try:
                report = visit_page(page, page_info)
            except Exception as exc:
                logger.exception("予期せぬエラー: %s", exc)
                report = PageReport(
                    name=page_info["name"],
                    path=page_info["path"],
                    slug=page_info["slug"],
                    load_ok=False,
                    load_error=str(exc),
                )
            finally:
                page.close()

            full_report.pages.append(report)

        context.close()
        browser.close()

    print_report(full_report)

    # JSON でも保存
    json_path = Path("D:/VSCode/AssetBridge/logs/debug_report.json")
    with json_path.open("w", encoding="utf-8") as f:
        # dataclass を dict に変換
        data = [
            {
                "name": pr.name,
                "path": pr.path,
                "slug": pr.slug,
                "load_ok": pr.load_ok,
                "load_error": pr.load_error,
                "page_title": pr.page_title,
                "screenshot_path": pr.screenshot_path,
                "console_errors": pr.console_errors,
                "console_warnings": pr.console_warnings,
                "network_errors": pr.network_errors,
                "element_checks": pr.element_checks,
                "button_interactions": pr.button_interactions,
            }
            for pr in full_report.pages
        ]
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info("JSON レポート保存: %s", json_path)


if __name__ == "__main__":
    main()
