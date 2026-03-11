import io
import matplotlib
# GUIバックエンドを使わない（サーバ環境対応）
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.font_manager as fm
from .analyzer import PortfolioAnalyzer
from ..db.database import db_session
from ..db.repositories import DailyTotalRepository

# 日本語フォント設定（優先順位: BIZ UDGothic → Yu Gothic → MS Gothic → fallback）
_JP_FONT_CANDIDATES = ["BIZ UDGothic", "Yu Gothic", "MS Gothic", "Meiryo", "Noto Sans CJK JP"]
_available = {f.name for f in fm.fontManager.ttflist}
_jp_font = next((f for f in _JP_FONT_CANDIDATES if f in _available), None)
if _jp_font:
    plt.rcParams["font.family"] = _jp_font


class ReportGenerator:
    def generate_daily_report(self) -> str:
        analyzer = PortfolioAnalyzer()
        data = analyzer.analyze_portfolio()

        diff_sign = "+" if data["prev_day_diff_jpy"] >= 0 else ""
        lines = [
            f"**本日の資産状況** ({data['date']})",
            f"総資産: ¥{data['total_jpy']:,.0f}",
            f"前日比: {diff_sign}¥{data['prev_day_diff_jpy']:,.0f} ({diff_sign}{data['prev_day_diff_pct']:.2f}%)",
        ]

        if data.get("top_gainers"):
            lines.append("\n**含み益 TOP3**")
            for item in data["top_gainers"][:3]:
                lines.append(f"  {item['name']}: +¥{item['unrealized_pnl_jpy']:,.0f}")

        if data.get("top_losers"):
            lines.append("\n**含み損 BOTTOM3**")
            for item in data["top_losers"][:3]:
                lines.append(f"  {item['name']}: ¥{item['unrealized_pnl_jpy']:,.0f}")

        return "\n".join(lines)

    def generate_portfolio_chart(self, days: int = 30) -> bytes:
        with db_session() as db:
            repo = DailyTotalRepository(db)
            history = repo.get_history(days=days)

        if not history:
            fig, ax = plt.subplots(figsize=(10, 4))
            ax.text(0.5, 0.5, "データがありません", ha="center", va="center", transform=ax.transAxes)
        else:
            dates = [h.date for h in history]
            values = [h.total_jpy for h in history]

            fig, ax = plt.subplots(figsize=(10, 4), facecolor="#1a1a2e")
            ax.set_facecolor("#16213e")
            ax.plot(dates, values, color="#0f3460", linewidth=2, marker="o", markersize=3)
            ax.fill_between(dates, values, alpha=0.3, color="#0f3460")

            ax.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
            ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"¥{x/1e6:.1f}M"))

            ax.tick_params(colors="white")
            ax.spines["bottom"].set_color("#333")
            ax.spines["left"].set_color("#333")
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)
            ax.grid(True, alpha=0.2, color="#333")

        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=100, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
