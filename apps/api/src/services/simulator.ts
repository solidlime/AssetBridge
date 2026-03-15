import type { SimulatorInput, SimulatorResult } from "@assetbridge/types";

// Box-Muller 変換で標準正規乱数を生成
function boxMullerRandom(): number {
  // Math.random() が 0 を返した場合 log(0) = -Infinity になるため EPSILON で保護
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function runMonteCarlo(input: SimulatorInput): SimulatorResult {
  const { initial, monthly, years, returnRate, volatility, simulations = 1000 } = input;
  const months = years * 12;
  const monthlyReturn = returnRate / 12;
  const monthlyVol = volatility / Math.sqrt(12);

  const allPaths: number[][] = [];

  for (let sim = 0; sim < simulations; sim++) {
    // path[0] = initial, path[y] = y年後の資産額
    const path: number[] = [initial];
    let value = initial;

    for (let m = 0; m < months; m++) {
      const rand = boxMullerRandom();
      // 幾何ブラウン運動による月次成長
      const growth = Math.exp(
        (monthlyReturn - 0.5 * monthlyVol ** 2) + monthlyVol * rand
      );
      value = (value + monthly) * growth;
      // 12ヶ月ごとに年次記録
      if (m % 12 === 11) path.push(value);
    }
    allPaths.push(path);
  }

  const yearLabels = Array.from({ length: years + 1 }, (_, i) => i);
  const percentiles: SimulatorResult["percentiles"] = {
    p10: [],
    p25: [],
    p50: [],
    p75: [],
    p90: [],
  };

  for (let y = 0; y <= years; y++) {
    const vals = allPaths.map((p) => p[y] ?? initial).sort((a, b) => a - b);
    percentiles.p10.push(vals[Math.floor(simulations * 0.1)]);
    percentiles.p25.push(vals[Math.floor(simulations * 0.25)]);
    percentiles.p50.push(vals[Math.floor(simulations * 0.5)]);
    percentiles.p75.push(vals[Math.floor(simulations * 0.75)]);
    percentiles.p90.push(vals[Math.floor(simulations * 0.9)]);
  }

  return { yearLabels, percentiles };
}
