import numpy as np
from dataclasses import dataclass


@dataclass
class SimulatorResult:
    years: int
    year_labels: list[int]
    percentiles: dict  # p10, p25, p50, p75, p90: list[float]
    final_values: dict  # p10, p25, p50, p75, p90: float


class MonteCarloSimulator:
    def run(
        self,
        initial_amount: float,
        monthly_investment: float,
        years: int,
        expected_return: float = 0.05,
        volatility: float = 0.15,
        simulations: int = 1000,
    ) -> SimulatorResult:
        months = years * 12
        monthly_return = expected_return / 12
        monthly_vol = volatility / np.sqrt(12)

        # simulations × months の乱数行列（対数正規分布に近似するため正規分布を使用）
        random_returns = np.random.normal(monthly_return, monthly_vol, (simulations, months))

        # 資産推移シミュレーション
        portfolio = np.zeros((simulations, months + 1))
        portfolio[:, 0] = initial_amount

        for m in range(months):
            portfolio[:, m + 1] = portfolio[:, m] * (1 + random_returns[:, m]) + monthly_investment

        # 年次データに変換（12ヶ月ごとにサンプリング）
        year_indices = [m * 12 for m in range(years + 1)]
        yearly = portfolio[:, year_indices]

        percentile_levels = [10, 25, 50, 75, 90]
        percentiles: dict = {}
        for p in percentile_levels:
            key = f"p{p}"
            percentiles[key] = np.percentile(yearly, p, axis=0).tolist()

        final_col = yearly[:, -1]
        final_values: dict = {f"p{p}": float(np.percentile(final_col, p)) for p in percentile_levels}

        return SimulatorResult(
            years=years,
            year_labels=list(range(years + 1)),
            percentiles=percentiles,
            final_values=final_values,
        )
