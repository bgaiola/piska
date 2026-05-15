/**
 * ScoreManager keeps a running total and exposes a pure helper to compute the
 * point breakdown for a single resolved match.
 *
 * Formula:
 *   base       = comboSize * 10
 *   comboBonus = 50  if comboSize == 4
 *                100 if comboSize == 5
 *                200 if comboSize >= 6
 *                0   otherwise
 *   chainBonus = comboSize * chain * chain * 5  if chain >= 2
 *                0                              otherwise
 */
export class ScoreManager {
  score: number = 0;

  add(amount: number): void {
    this.score += amount;
  }

  reset(): void {
    this.score = 0;
  }

  pointsFor(
    comboSize: number,
    chain: number,
  ): { base: number; comboBonus: number; chainBonus: number } {
    const base = comboSize * 10;
    let comboBonus = 0;
    if (comboSize >= 6) comboBonus = 200;
    else if (comboSize === 5) comboBonus = 100;
    else if (comboSize === 4) comboBonus = 50;
    const chainBonus = chain >= 2 ? comboSize * chain * chain * 5 : 0;
    return { base, comboBonus, chainBonus };
  }
}
