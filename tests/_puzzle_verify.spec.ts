/**
 * Author-only verification of puzzle solvability.
 *
 * Uses the REAL engine with a tight tick loop to settle the grid between
 * swaps. After replaying the intended optimal swaps, the grid must be empty,
 * and the number of swaps must be <= movesAllowed - 2 (the 3-star bar).
 *
 * This spec is intended to be deleted before committing once all puzzles
 * pass; it would otherwise add ~16 simulation runs to the CI test budget.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/engine';
import { PUZZLES, getPuzzleById } from '@/data/puzzles';

interface SolutionStep {
  row: number;
  col: number;
}
interface Solution {
  id: string;
  steps: SolutionStep[];
}

// To be filled in as puzzles are authored.
const SOLUTIONS: Solution[] = [
  // p9-p24 entries appended below
];

function seedPuzzle(engine: GameEngine, id: string): void {
  const def = getPuzzleById(id)!;
  for (let r = 0; r < engine.grid.rows; r++) {
    for (let c = 0; c < engine.grid.cols; c++) engine.grid.cells[r][c] = null;
  }
  for (let r = 0; r < engine.grid.rows; r++) {
    const src = def.rows[r];
    if (!src) continue;
    for (let c = 0; c < engine.grid.cols; c++) {
      const color = src[c];
      if (!color) continue;
      engine.grid.cells[r][c] = {
        id: -(r * engine.grid.cols + c + 1),
        color,
        kind: 'color',
        state: 'idle',
        swapTimer: 0,
        clearTimer: 0,
        fallTimer: 0,
        swapDir: 0,
      };
    }
  }
}

function settle(engine: GameEngine, ticks = 200): void {
  for (let i = 0; i < ticks; i++) engine.tick(16);
}

function gridOccupancy(engine: GameEngine): number {
  let n = 0;
  for (let r = 0; r < engine.grid.rows; r++) {
    for (let c = 0; c < engine.grid.cols; c++) {
      if (engine.grid.cells[r][c] !== null) n++;
    }
  }
  return n;
}

describe('PISKA puzzles — author-only solvability check', () => {
  for (const sol of SOLUTIONS) {
    const def = getPuzzleById(sol.id);
    if (!def) continue;
    const star3 = def.movesAllowed - 2;
    it(`${sol.id} solves in ${sol.steps.length} swaps (3-star bar = ${star3})`, () => {
      const engine = new GameEngine({
        rows: 8,
        cols: 6,
        numColors: 5,
        initialStackHeight: 0,
        baseRiseSpeed: 0,
      });
      seedPuzzle(engine, sol.id);
      // Resolve any initial-state matches and gravity.
      settle(engine, 100);
      for (const step of sol.steps) {
        engine.setCursor(step.row, step.col);
        const ok = engine.swap();
        if (!ok) {
          throw new Error(
            `[${sol.id}] swap (${step.row},${step.col})↔(${step.row},${step.col + 1}) was rejected (likely non-idle cells).`,
          );
        }
        settle(engine, 200);
      }
      settle(engine, 200);
      expect(sol.steps.length, `[${sol.id}] uses more than 3-star budget`).toBeLessThanOrEqual(
        star3,
      );
      expect(gridOccupancy(engine), `[${sol.id}] grid not empty`).toBe(0);
    });
  }

  it('all p9-p24 puzzles have a SOLUTIONS entry', () => {
    const wantIds = PUZZLES.filter((p) => /^p(9|1\d|2[0-4])-/.test(p.id)).map((p) => p.id);
    const haveIds = SOLUTIONS.map((s) => s.id);
    for (const id of wantIds) {
      expect(haveIds, `missing solution for ${id}`).toContain(id);
    }
  });
});
