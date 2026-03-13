"""デモ用ポートフォリオデータをDBに投入するスクリプト。

再スクレイプを待たずにダッシュボードの全機能を確認するために使用する。
実際のスクレイプデータで上書きされるまでの暫定データとして活用できる。

使い方:
    python scripts/seed_demo_data.py

    # 既存データを削除してから投入する場合:
    python scripts/seed_demo_data.py --reset
"""

import sys
import argparse
import random
from datetime import date, timedelta
from pathlib import Path

# プロジェクトルートを sys.path に追加
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from apps.api.src.db.database import db_session
from apps.api.src.db.models import (
    Base, Asset, AssetType, PortfolioSnapshot, DailyTotal,
    MonthlyCashflow
)
from apps.api.src.db.repositories import (
    AssetRepository, SnapshotRepository, DailyTotalRepository
)

# ──────────────────────────────────────────────
# デモポートフォリオ定義
# ──────────────────────────────────────────────
DEMO_HOLDINGS = [
    # 日本株
    {"code": "7203", "name": "トヨタ自動車",       "type": AssetType.STOCK_JP,
     "qty": 200,  "cost": 2800.0,  "price": 3520.0,  "exchange": "TSE"},
    {"code": "6758", "name": "ソニーグループ",       "type": AssetType.STOCK_JP,
     "qty": 100,  "cost": 11000.0, "price": 13200.0, "exchange": "TSE"},
    {"code": "9984", "name": "ソフトバンクグループ", "type": AssetType.STOCK_JP,
     "qty": 300,  "cost": 7200.0,  "price": 8100.0,  "exchange": "TSE"},
    {"code": "8306", "name": "三菱UFJフィナンシャル", "type": AssetType.STOCK_JP,
     "qty": 500,  "cost": 900.0,   "price": 1420.0,  "exchange": "TSE"},
    {"code": "4063", "name": "信越化学工業",         "type": AssetType.STOCK_JP,
     "qty": 50,   "cost": 38000.0, "price": 41500.0, "exchange": "TSE"},
    # 米国株
    {"code": "NVDA",  "name": "NVIDIA",           "type": AssetType.STOCK_US,
     "qty": 20,   "cost": 70000.0,  "price": 115000.0, "exchange": "NASDAQ"},
    {"code": "AAPL",  "name": "Apple",            "type": AssetType.STOCK_US,
     "qty": 15,   "cost": 22000.0,  "price": 29000.0,  "exchange": "NASDAQ"},
    {"code": "ASTS",  "name": "AST SpaceMobile",  "type": AssetType.STOCK_US,
     "qty": 500,  "cost": 1500.0,   "price": 2200.0,   "exchange": "NASDAQ"},
    # 投資信託
    {"code": "0231118A", "name": "eMAXIS Slim 全世界株式(除く日本)", "type": AssetType.FUND,
     "qty": 100000, "cost": 2.10, "price": 2.85, "exchange": ""},
    {"code": "03311187", "name": "eMAXIS Slim 米国株式(S&P500)",    "type": AssetType.FUND,
     "qty": 80000,  "cost": 2.50, "price": 3.20, "exchange": ""},
    {"code": "04311187", "name": "eMAXIS Slim バランス(8資産均等型)", "type": AssetType.FUND,
     "qty": 50000,  "cost": 1.80, "price": 2.10, "exchange": ""},
    # 現金
    {"code": "", "name": "住信SBIネット銀行 円普通預金", "type": AssetType.CASH,
     "qty": 1, "cost": 5000000.0, "price": 5000000.0, "exchange": ""},
    {"code": "", "name": "住信SBIネット銀行 外貨預金(USD)", "type": AssetType.CASH,
     "qty": 1, "cost": 800000.0,  "price": 850000.0,  "exchange": ""},
    # 年金
    {"code": "", "name": "iDeCo（確定拠出年金）", "type": AssetType.PENSION,
     "qty": 1, "cost": 2000000.0, "price": 2800000.0, "exchange": ""},
]

# 30日分の総資産推移（実際の ¥38.6M 付近で微変動）
TOTAL_BASE = 38_680_247.0
CATEGORY_WEIGHTS = {
    "stock_jp_jpy": 0.30,
    "stock_us_jpy": 0.25,
    "fund_jpy":     0.20,
    "cash_jpy":     0.15,
    "pension_jpy":  0.07,
    "crypto_jpy":   0.02,
    "point_jpy":    0.01,
}

MONTHLY_CASHFLOW = [
    {"ym": "202501", "income": 450000, "expense": 280000},
    {"ym": "202502", "income": 450000, "expense": 310000},
    {"ym": "202503", "income": 450000, "expense": 265000},
    {"ym": "202504", "income": 530000, "expense": 290000},  # 賞与あり
    {"ym": "202505", "income": 450000, "expense": 320000},
    {"ym": "202506", "income": 450000, "expense": 275000},
    {"ym": "202507", "income": 450000, "expense": 340000},
    {"ym": "202508", "income": 650000, "expense": 480000},  # 賞与あり
    {"ym": "202509", "income": 450000, "expense": 290000},
    {"ym": "202510", "income": 450000, "expense": 310000},
    {"ym": "202511", "income": 450000, "expense": 285000},
    {"ym": "202512", "income": 450000, "expense": 260000},
]


def seed(reset: bool = False) -> None:
    random.seed(42)  # 再現性のため固定シード

    if reset:
        print("既存データを削除中...")
        with db_session() as db:
            db.query(PortfolioSnapshot).delete()
            db.query(Asset).delete()
            db.query(DailyTotal).delete()
            db.query(MonthlyCashflow).delete()
            db.commit()
        print("削除完了")

    today = date.today()

    # 1. assets + portfolio_snapshots を投入
    print("資産データを投入中...")
    with db_session() as db:
        asset_repo = AssetRepository(db)
        snap_repo = SnapshotRepository(db)

        for h in DEMO_HOLDINGS:
            sym = (h["code"] or h["name"])[:50]
            asset = asset_repo.upsert(
                symbol=sym,
                name=h["name"],
                asset_type=h["type"],
                exchange=h.get("exchange") or None,
                currency="JPY",
            )
            qty    = float(h["qty"])
            cost   = float(h["cost"])
            price  = float(h["price"])
            value  = qty * price
            basis  = qty * cost
            pnl    = value - basis
            pnl_pct = (pnl / basis * 100.0) if basis > 0 else 0.0
            snap_repo.upsert(
                asset_id=asset.id,
                snapshot_date=today,
                quantity=qty,
                price_jpy=price,
                value_jpy=value,
                cost_basis_jpy=basis,
                unrealized_pnl_jpy=pnl,
                unrealized_pnl_pct=pnl_pct,
            )
        db.commit()
    print(f"  → {len(DEMO_HOLDINGS)} 銘柄投入完了")

    # 2. 過去30日分の daily_totals を投入
    print("総資産推移データを投入中...")
    with db_session() as db:
        daily_repo = DailyTotalRepository(db)

        prev_total = TOTAL_BASE * 0.97  # 30日前の基準値
        for i in range(30, -1, -1):
            d = today - timedelta(days=i)
            # ランダムウォーク（日次 -0.8% ~ +0.8% の変動）
            change_pct = random.uniform(-0.008, 0.008)
            total = prev_total * (1.0 + change_pct)
            diff  = total - prev_total
            diff_pct = change_pct * 100.0
            prev_total = total

            kwargs = {f: total * w for f, w in CATEGORY_WEIGHTS.items()}
            daily_repo.upsert(
                d,
                total_jpy=total,
                prev_day_diff_jpy=diff,
                prev_day_diff_pct=diff_pct,
                **kwargs,
            )
        db.commit()
    print("  → 30日分 投入完了")

    # 3. 月別収支データを投入
    print("月別収支データを投入中...")
    with db_session() as db:
        for cf in MONTHLY_CASHFLOW:
            existing = db.query(MonthlyCashflow).filter_by(year_month=cf["ym"]).first()
            if existing:
                existing.income_jpy  = float(cf["income"])
                existing.expense_jpy = float(cf["expense"])
                existing.net_jpy     = float(cf["income"]) - float(cf["expense"])
            else:
                db.add(MonthlyCashflow(
                    year_month=cf["ym"],
                    income_jpy=float(cf["income"]),
                    expense_jpy=float(cf["expense"]),
                    net_jpy=float(cf["income"]) - float(cf["expense"]),
                ))
        db.commit()
    print(f"  → {len(MONTHLY_CASHFLOW)} ヶ月分 投入完了")

    # 結果確認
    with db_session() as db:
        from sqlalchemy import func
        snap_count  = db.query(func.count(PortfolioSnapshot.id)).scalar()
        asset_count = db.query(func.count(Asset.id)).scalar()
        daily_count = db.query(func.count(DailyTotal.id)).scalar()
        print(f"\n確認:")
        print(f"  assets:               {asset_count} 件")
        print(f"  portfolio_snapshots:  {snap_count} 件")
        print(f"  daily_totals:         {daily_count} 件")
        print(f"  monthly_cashflow:     {len(MONTHLY_CASHFLOW)} 件")

    print("\nシード完了！")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="デモデータをDBに投入する")
    parser.add_argument("--reset", action="store_true", help="既存データを削除してから投入する")
    args = parser.parse_args()
    seed(reset=args.reset)
