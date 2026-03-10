from datetime import date as date_type
from sqlalchemy.orm import Session
from ..db.database import db_session
from ..db.repositories import SnapshotRepository, DailyTotalRepository, AssetRepository
from . import llm_client


class PortfolioAnalyzer:
    def analyze_portfolio(self, target_date: date_type | None = None) -> dict:
        target = target_date or date_type.today()
        with db_session() as db:
            daily_repo = DailyTotalRepository(db)
            snapshot_repo = SnapshotRepository(db)

            latest = daily_repo.get_by_date(target) or daily_repo.get_latest()
            snapshots = snapshot_repo.get_by_date(target)

            # 含み損益ランキング（降順）
            ranked = sorted(snapshots, key=lambda s: s.unrealized_pnl_jpy, reverse=True)

            return {
                "date": target.isoformat(),
                "total_jpy": latest.total_jpy if latest else 0,
                "prev_day_diff_jpy": latest.prev_day_diff_jpy if latest else 0,
                "prev_day_diff_pct": latest.prev_day_diff_pct if latest else 0,
                "top_gainers": [self._snapshot_to_dict(s, db) for s in ranked[:5]],
                "top_losers": [self._snapshot_to_dict(s, db) for s in ranked[-5:]],
            }

    def _snapshot_to_dict(self, snapshot, db: Session) -> dict:
        asset_repo = AssetRepository(db)
        asset = asset_repo.get_by_id(snapshot.asset_id)
        return {
            "asset_id": snapshot.asset_id,
            "symbol": asset.symbol if asset else "",
            "name": asset.name if asset else "",
            "value_jpy": snapshot.value_jpy,
            "unrealized_pnl_jpy": snapshot.unrealized_pnl_jpy,
            "unrealized_pnl_pct": snapshot.unrealized_pnl_pct,
        }

    def get_sector_allocation(self) -> list[dict]:
        with db_session() as db:
            daily_repo = DailyTotalRepository(db)
            latest = daily_repo.get_latest()
            if not latest:
                return []
            # ゼロ除算を防ぐため total が 0 の場合は 1 にフォールバック
            total = latest.total_jpy if latest.total_jpy else 1
            return [
                {"name": "日本株", "asset_type": "stock_jp", "value_jpy": latest.stock_jp_jpy, "percentage": latest.stock_jp_jpy / total * 100},
                {"name": "米国株", "asset_type": "stock_us", "value_jpy": latest.stock_us_jpy, "percentage": latest.stock_us_jpy / total * 100},
                {"name": "投資信託", "asset_type": "fund", "value_jpy": latest.fund_jpy, "percentage": latest.fund_jpy / total * 100},
                {"name": "暗号資産", "asset_type": "crypto", "value_jpy": latest.crypto_jpy, "percentage": latest.crypto_jpy / total * 100},
                {"name": "現金", "asset_type": "cash", "value_jpy": latest.cash_jpy, "percentage": latest.cash_jpy / total * 100},
                {"name": "年金", "asset_type": "pension", "value_jpy": latest.pension_jpy, "percentage": latest.pension_jpy / total * 100},
                {"name": "ポイント", "asset_type": "point", "value_jpy": latest.point_jpy, "percentage": latest.point_jpy / total * 100},
            ]

    def get_unrealized_pnl_ranking(self, top: int = 10) -> list[dict]:
        with db_session() as db:
            snapshot_repo = SnapshotRepository(db)
            snapshots = snapshot_repo.get_by_date(date_type.today())
            ranked = sorted(snapshots, key=lambda s: s.unrealized_pnl_jpy, reverse=True)
            top_n = ranked[:top]
            # top_n と bottom_n が重複しないよう len > top の場合のみ取得
            bottom_n = ranked[-top:] if len(ranked) > top else []
            all_ranked = top_n + bottom_n
            return [self._snapshot_to_dict(s, db) for s in all_ranked]
