"""
AssetBridge バグ修正検証スクリプト

BUG-2: ダッシュボード前日比が ¥0 (0.00%) 表示
BUG-4: /simulator でシミュレーション実行後にグラフが表示される
BUG-5: /linked-services でスクレイプステータスが「同期済み」と表示される
"""

import os
import sys
import json
import time
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, ConsoleMessage, Page

SCREENSHOT_DIR = "D:/VSCode/AssetBridge/logs/screenshots"
BASE_URL = "http://localhost:3000"
API_URL = "http://localhost:8000"
API_KEY = "test"

# コンソールエラー・ネットワークエラーを収集するための型
@dataclass
class VerifyResult:
    name: str
    passed: bool
    details: str
    console_errors: list[str]
    network_errors: list[str]


def collect_page_errors(page: Page) -> tuple[list[str], list[str]]:
    """コンソールエラーとネットワークエラーを収集するリスナーを登録し、収集リストを返す。"""
    console_errors: list[str] = []
    network_errors: list[str] = []

    def on_console(msg: ConsoleMessage) -> None:
        if msg.type in ("error", "warning"):
            console_errors.append(f"[{msg.type}] {msg.text}")

    def on_response(response) -> None:
        if response.status >= 400:
            network_errors.append(f"HTTP {response.status}: {response.url}")

    page.on("console", on_console)
    page.on("response", on_response)

    return console_errors, network_errors


def verify_bug2_dashboard(page: Page) -> VerifyResult:
    """BUG-2: ダッシュボード前日比が ¥0 (0.00%) と表示されること。"""
    console_errors, network_errors = collect_page_errors(page)

    page.goto(f"{BASE_URL}/", wait_until="networkidle", timeout=30000)
    # データロード待機（Server Component のレンダリング完了）
    page.wait_for_timeout(2000)

    screenshot_path = os.path.join(SCREENSHOT_DIR, "dashboard_fixed.png")
    page.screenshot(path=screenshot_path, full_page=True)

    # 前日比のテキストを探す（+¥0 or ¥0 の形式）
    body_text = page.inner_text("body")
    lines = [line.strip() for line in body_text.splitlines() if line.strip()]

    # 前日比ゼロの表示パターンを確認
    # 期待: "¥0" または "+¥0" または "0.00%" が含まれること
    has_zero_diff = any(
        token in body_text
        for token in ["¥0", "+¥0", "0.00%", "±¥0"]
    )
    # 前日比マイナスや大きな値が表示されていないことを確認
    # APIからは prev_day_diff_jpy=0.0, prev_day_diff_pct=0.0 が返っている

    # ページに「前日比」か「前日」というラベルが存在するか確認
    has_label = "前日" in body_text

    passed = has_zero_diff and has_label
    detail_lines = [l for l in lines if "前日" in l or "0.00" in l or "¥0" in l]
    details = (
        f"前日比ゼロ表示: {'あり' if has_zero_diff else 'なし'}\n"
        f"前日ラベル: {'あり' if has_label else 'なし'}\n"
        f"関連行: {detail_lines[:5]}"
    )

    return VerifyResult(
        name="BUG-2: ダッシュボード前日比",
        passed=passed,
        details=details,
        console_errors=console_errors,
        network_errors=network_errors,
    )


def verify_bug4_simulator(page: Page) -> VerifyResult:
    """BUG-4: /simulator でシミュレーション実行後にグラフが表示されること。"""
    console_errors, network_errors = collect_page_errors(page)

    page.goto(f"{BASE_URL}/simulator", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1000)

    # 実行前スクリーンショット（参考用）
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "simulator_before.png"))

    # 「シミュレーション実行」ボタンをクリック
    btn = page.get_by_role("button", name="シミュレーション実行")
    btn.click()

    # 計算中 → 完了まで待機（最大 15 秒）
    # ボタンが「シミュレーション実行」に戻ったら完了とみなす
    page.wait_for_function(
        "() => { const b = document.querySelector('button[aria-label=\"シミュレーション実行\"]'); return b && b.textContent.includes('シミュレーション実行'); }",
        timeout=15000,
    )
    # 描画完了まで少し待つ
    page.wait_for_timeout(1000)

    screenshot_path = os.path.join(SCREENSHOT_DIR, "simulator_fixed.png")
    page.screenshot(path=screenshot_path, full_page=True)

    # グラフ要素が存在するか確認（recharts の svg または canvas）
    has_svg = page.locator("svg").count() > 0
    # 「年間の資産推移シミュレーション」テキストが表示されているか
    has_chart_title = "年間の資産推移シミュレーション" in page.inner_text("body")
    # 「年後の試算結果」テキストが表示されているか
    has_result_title = "年後の試算結果" in page.inner_text("body")
    # パーセンタイル値（悲観的/楽観的）が表示されているか
    body = page.inner_text("body")
    has_percentile = "悲観的" in body and "楽観的" in body

    passed = has_svg and has_chart_title and has_result_title and has_percentile

    details = (
        f"SVG要素: {'あり' if has_svg else 'なし'} (count={page.locator('svg').count()})\n"
        f"グラフタイトル: {'あり' if has_chart_title else 'なし'}\n"
        f"試算結果タイトル: {'あり' if has_result_title else 'なし'}\n"
        f"パーセンタイル表示: {'あり' if has_percentile else 'なし'}"
    )

    return VerifyResult(
        name="BUG-4: シミュレーターグラフ",
        passed=passed,
        details=details,
        console_errors=console_errors,
        network_errors=network_errors,
    )


def verify_bug5_linked_services(page: Page) -> VerifyResult:
    """BUG-5: /linked-services でMFステータスバッジが「同期済み」と表示されること。"""
    console_errors, network_errors = collect_page_errors(page)

    page.goto(f"{BASE_URL}/linked-services", wait_until="networkidle", timeout=30000)
    # API フェッチ完了まで待機
    page.wait_for_timeout(3000)

    screenshot_path = os.path.join(SCREENSHOT_DIR, "linked_services_fixed.png")
    page.screenshot(path=screenshot_path, full_page=True)

    body_text = page.inner_text("body")

    # ステータスバッジのテキストを取得（role=status の要素）
    status_elements = page.get_by_role("status").all()
    badge_texts = [el.inner_text() for el in status_elements]

    # MF カード（マネーフォワード）の「同期済み」表示を確認
    has_synced = "同期済み" in body_text
    # 「起動中」と誤表示されていないか（MFカードに限定）
    # MFカードは最初のカード → status_elements[0] が対象
    mf_badge_text = badge_texts[0] if badge_texts else "（取得失敗）"
    mf_is_synced = "同期済み" in mf_badge_text
    mf_is_not_running = "起動中" not in mf_badge_text

    passed = mf_is_synced and mf_is_not_running

    details = (
        f"全バッジテキスト: {badge_texts}\n"
        f"MFバッジ: {mf_badge_text!r}\n"
        f"「同期済み」表示: {'あり' if has_synced else 'なし'}\n"
        f"「起動中」誤表示なし: {'OK' if mf_is_not_running else 'NG — 起動中と表示されている'}"
    )

    return VerifyResult(
        name="BUG-5: 連携サービスMFステータス",
        passed=passed,
        details=details,
        console_errors=console_errors,
        network_errors=network_errors,
    )


def main() -> None:
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    results: list[VerifyResult] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            # Next.js の API コールに X-API-Key が必要
            extra_http_headers={"X-API-Key": API_KEY},
        )

        # BUG-4: simulator
        page = context.new_page()
        try:
            results.append(verify_bug4_simulator(page))
        except Exception as e:
            results.append(VerifyResult(
                name="BUG-4: シミュレーターグラフ",
                passed=False,
                details=f"例外発生: {e}",
                console_errors=[],
                network_errors=[],
            ))
        finally:
            page.close()

        # BUG-5: linked-services
        page = context.new_page()
        try:
            results.append(verify_bug5_linked_services(page))
        except Exception as e:
            results.append(VerifyResult(
                name="BUG-5: 連携サービスMFステータス",
                passed=False,
                details=f"例外発生: {e}",
                console_errors=[],
                network_errors=[],
            ))
        finally:
            page.close()

        # BUG-2: dashboard
        page = context.new_page()
        try:
            results.append(verify_bug2_dashboard(page))
        except Exception as e:
            results.append(VerifyResult(
                name="BUG-2: ダッシュボード前日比",
                passed=False,
                details=f"例外発生: {e}",
                console_errors=[],
                network_errors=[],
            ))
        finally:
            page.close()

        browser.close()

    # 結果レポート出力
    print("\n" + "=" * 60)
    print("  AssetBridge バグ修正検証レポート")
    print("=" * 60)

    all_passed = True
    for r in results:
        status_icon = "PASS" if r.passed else "FAIL"
        print(f"\n[{status_icon}] {r.name}")
        print(f"  {r.details.replace(chr(10), chr(10) + '  ')}")
        if r.console_errors:
            print(f"  コンソールエラー ({len(r.console_errors)}件):")
            for err in r.console_errors[:5]:
                print(f"    - {err}")
        if r.network_errors:
            print(f"  ネットワークエラー ({len(r.network_errors)}件):")
            for err in r.network_errors[:5]:
                print(f"    - {err}")
        if not r.passed:
            all_passed = False

    print("\n" + "=" * 60)
    print(f"  総合結果: {'全テスト PASS' if all_passed else '一部 FAIL あり'}")
    print("=" * 60)
    print(f"\nスクリーンショット保存先: {SCREENSHOT_DIR}")

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
