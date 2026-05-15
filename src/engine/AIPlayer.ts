import type { GameEngine } from './GameEngine';
import { Grid } from './Grid';
import { findMatches } from './MatchDetector';
import type { Block, BlockColor, Cell } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Difficulty profiles
// ─────────────────────────────────────────────────────────────────────────

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export interface AIDifficultyProfile {
  /** Min/max ms between input actions. The AI picks a random delay in this range. */
  actionDelayMsMin: number;
  actionDelayMsMax: number;
  /** How many candidate swaps to evaluate per decision. */
  candidateLimit: number;
  /** Probability that the AI deliberately makes a mistake (picks a suboptimal candidate). 0..1 */
  mistakeRate: number;
  /** Probability that the AI considers chain setups (looking 1+ steps ahead). 0..1 */
  chainSetupRate: number;
  /** If true, AI uses manual raise pressure when the board is low. */
  usesPressure: boolean;
  /** Search depth for cascading chains (lookahead in simulation steps). 0 = none. */
  chainSearchDepth: number;
}

export const AI_PROFILES: Record<AIDifficulty, AIDifficultyProfile> = {
  easy: {
    actionDelayMsMin: 800,
    actionDelayMsMax: 1200,
    candidateLimit: 6,
    mistakeRate: 0.45,
    chainSetupRate: 0.0,
    usesPressure: false,
    chainSearchDepth: 0,
  },
  medium: {
    actionDelayMsMin: 400,
    actionDelayMsMax: 700,
    candidateLimit: 12,
    mistakeRate: 0.2,
    chainSetupRate: 0.35,
    usesPressure: false,
    chainSearchDepth: 1,
  },
  hard: {
    actionDelayMsMin: 130,
    actionDelayMsMax: 280,
    candidateLimit: 32,
    mistakeRate: 0.03,
    chainSetupRate: 0.9,
    usesPressure: true,
    chainSearchDepth: 3,
  },
  master: {
    // Mestre plays at near-superhuman pace: ~10 actions/second, looking 4
    // cascade steps deep, never makes a mistake, and aggressively pushes
    // the player by holding raise whenever the board has any breathing room.
    actionDelayMsMin: 55,
    actionDelayMsMax: 130,
    candidateLimit: 96,
    mistakeRate: 0.0,
    chainSetupRate: 1.0,
    usesPressure: true,
    chainSearchDepth: 5,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────

type AIInput =
  | { kind: 'cursorMove'; dRow: number; dCol: number }
  | { kind: 'cursorSet'; row: number; col: number }
  | { kind: 'swap' };

interface SwapPlan {
  /** swap occurs at (row, col) <-> (row, col+1) */
  row: number;
  col: number;
  score: number;
}

interface ScoredCandidate {
  row: number;
  col: number;
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Local deterministic RNG (mulberry32, copy of utils/seedRandom.ts)
// ─────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// AIPlayer
// ─────────────────────────────────────────────────────────────────────────

/**
 * Heuristic, goal-oriented planner that drives a `GameEngine` via its public
 * input API only — exactly like a human player would.
 *
 * Lifecycle:
 *   1. `update(dtMs)` is called every game tick by the host (scene / Vs controller).
 *   2. While the AI has queued micro-actions (cursor moves, swaps), it executes
 *      them one at a time with a small inter-step delay (`humanise feel`).
 *   3. When the input queue is empty and the per-decision idle timer elapses,
 *      the AI inspects the grid, ranks candidate swaps and queues the chosen one.
 *
 * Determinism:
 *   The internal `rng` is seeded independently from the engine, so an AI
 *   instance with the same seed and the same observed engine state produces
 *   the same decisions and timings.
 */
export class AIPlayer {
  difficulty: AIDifficulty;
  profile: AIDifficultyProfile;
  private engine: GameEngine;
  private rng: () => number;
  private idleTimer = 0;
  private inputQueue: AIInput[] = [];
  // Pressure-mode bookkeeping. While > 0, the AI keeps `manualRaise` engaged.
  private raiseHeldUntil = 0;
  // Tracks accumulated game time so that `raiseHeldUntil` can be compared
  // without depending on wall-clock. Updated every `update()`.
  private elapsedMs = 0;

  constructor(
    engine: GameEngine,
    difficulty: AIDifficulty,
    rngSeed: number = 0xa11b0b,
  ) {
    this.engine = engine;
    this.difficulty = difficulty;
    this.profile = AI_PROFILES[difficulty];
    this.rng = mulberry32(rngSeed);
  }

  /**
   * Call once per tick from the host (scene / Vs controller). `dtMs` is the
   * same `dt` passed to `engine.tick`.
   */
  update(dtMs: number): void {
    if (this.engine.gameOver || this.engine.paused) return;
    this.elapsedMs += dtMs;
    this.idleTimer -= dtMs;

    // Execute queued micro-actions in sequence, paced by a short delay.
    if (this.inputQueue.length > 0) {
      if (this.idleTimer <= 0) {
        const next = this.inputQueue.shift();
        if (next !== undefined) {
          this.executeInput(next);
        }
        // Short inter-step delay so the cursor doesn't teleport.
        this.idleTimer = this.randomDelayMs(0.3);
      }
      return;
    }

    // Pressure: hold raise if the board is comfortable, release otherwise.
    if (this.profile.usesPressure) this.updatePressure();

    if (this.idleTimer > 0) return;

    // Time to think: pick a swap.
    const plan = this.planNextSwap();
    if (plan !== null) {
      this.queuePlan(plan);
    }
    this.idleTimer = this.randomDelayMs(1.0);
  }

  /** Optional: switch difficulty mid-game (used by debug controls). */
  setDifficulty(d: AIDifficulty): void {
    this.difficulty = d;
    this.profile = AI_PROFILES[d];
  }

  /**
   * For tests / debugging — exposes the AI's current best swap without
   * mutating the engine or its queue.
   */
  peekBestPlan(): SwapPlan | null {
    return this.planNextSwap();
  }

  /** For tests — read pending micro-action count. */
  get pendingInputs(): number {
    return this.inputQueue.length;
  }

  /** For tests — read whether the AI currently holds raise. */
  get isHoldingRaise(): boolean {
    return this.engine.manualRaise;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────

  private randomDelayMs(scale: number): number {
    const min = this.profile.actionDelayMsMin * scale;
    const max = this.profile.actionDelayMsMax * scale;
    return min + this.rng() * (max - min);
  }

  private updatePressure(): void {
    const rows = this.engine.cfg.rows;
    const topMostRow = this.topmostNonEmptyRow();
    // Lower row index ⇒ taller stack. Mestre tolerates a higher own-stack
    // before backing off because its swap-rate is fast enough to clear it.
    const isMaster = this.difficulty === 'master';
    const dangerRow = Math.floor(rows * (isMaster ? 0.16 : 0.2));
    const comfortableRow = Math.floor(rows * (isMaster ? 0.55 : 0.35));

    if (topMostRow !== null && topMostRow <= dangerRow) {
      // Board is dangerous — release raise immediately.
      this.engine.setManualRaise(false);
      this.raiseHeldUntil = 0;
      return;
    }
    if (topMostRow === null || topMostRow > comfortableRow) {
      // Stack is very low — Mestre holds raise CONTINUOUSLY to force a
      // showdown. Lower difficulties still alternate hold/release.
      if (isMaster) {
        this.engine.setManualRaise(true);
        return;
      }
      if (this.elapsedMs >= this.raiseHeldUntil) {
        if (!this.engine.manualRaise) {
          this.engine.setManualRaise(true);
          this.raiseHeldUntil = this.elapsedMs + this.randomDelayMs(2.0);
        } else {
          this.engine.setManualRaise(false);
          this.raiseHeldUntil = this.elapsedMs + this.randomDelayMs(1.0);
        }
      }
      return;
    }
    // Between danger and comfortable: alternate short bursts so the player
    // still gets pressured but Mestre doesn't burn itself out.
    if (this.elapsedMs >= this.raiseHeldUntil) {
      if (!this.engine.manualRaise) {
        this.engine.setManualRaise(true);
        this.raiseHeldUntil = this.elapsedMs + this.randomDelayMs(1.5);
      } else {
        this.engine.setManualRaise(false);
        this.raiseHeldUntil = this.elapsedMs + this.randomDelayMs(0.6);
      }
    }
  }

  private topmostNonEmptyRow(): number | null {
    const grid = this.engine.grid;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (grid.cells[r][c] !== null) return r;
      }
    }
    return null;
  }

  /**
   * Generate, score and pick a single candidate swap.
   *
   * Heuristic outline:
   *   - Iterate every horizontal swap on the grid that involves two
   *     idle/landed/null cells.
   *   - Simulate the swap on a clone, run a simple gravity pass, look for
   *     matches. Reward cells cleared by the immediate match.
   *   - If chain-aware (chainSearchDepth > 0), continue simulating gravity
   *     and rematch passes up to that depth and reward downstream clears.
   *   - Apply heuristic adjustments: penalise high stacks, prefer near-cursor
   *     swaps, reward potential vertical 3-stack setups.
   *   - With probability `mistakeRate`, pick a random non-top candidate.
   *   - If no candidate scores positively, return `null` (caller can wait or
   *     push raise in pressure mode).
   */
  private planNextSwap(): SwapPlan | null {
    const grid = this.engine.grid;
    const rows = grid.rows;
    const cols = grid.cols;
    const candidates: ScoredCandidate[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (!this.canSwap(grid, r, c)) continue;
        const score = this.scoreSwap(grid, r, c);
        if (score > -Infinity) {
          candidates.push({ row: r, col: c, score });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score descending.
    candidates.sort((a, b) => b.score - a.score);

    // Limit to top-N by profile.
    const topN = candidates.slice(0, Math.max(1, this.profile.candidateLimit));

    // If the absolute best is non-positive, we don't see a useful swap.
    if (topN[0].score <= 0) return null;

    // Maybe deliberately pick a sub-optimal candidate.
    let chosen: ScoredCandidate;
    if (topN.length > 1 && this.rng() < this.profile.mistakeRate) {
      const pool = topN.slice(1); // exclude the actual best
      const idx = Math.floor(this.rng() * pool.length);
      chosen = pool[idx];
    } else {
      chosen = topN[0];
    }

    return { row: chosen.row, col: chosen.col, score: chosen.score };
  }

  /** True iff both (row, col) and (row, col+1) are swap-eligible (idle/landed/null). */
  private canSwap(grid: Grid, row: number, col: number): boolean {
    const left = grid.cells[row][col];
    const right = grid.cells[row][col + 1];
    if (left === null && right === null) return false;
    if (left !== null && left.state !== 'idle' && left.state !== 'landed') return false;
    if (right !== null && right.state !== 'idle' && right.state !== 'landed') return false;
    // Pointless: same color and not adjacent to any match opportunity.
    return true;
  }

  private scoreSwap(grid: Grid, row: number, col: number): number {
    // Work on a cloned grid so the live engine is untouched.
    const sim = grid.clone();
    swapInClone(sim, row, col);
    applySimGravity(sim);

    let score = 0;
    const matches = findMatches(sim);
    let immediateCleared = 0;
    let biggestGroup = 0;
    for (const g of matches) {
      immediateCleared += g.cells.length;
      if (g.cells.length > biggestGroup) biggestGroup = g.cells.length;
    }
    score += immediateCleared * 100;

    // Combo bonus: every block above the first 3 in a single group is gold —
    // a 4-combo earns a 1x3 garbage piece, 5-combo a 1x4, 6+ a 1x5/1x6.
    // We model that by giving combos quadratic weight beyond size 3.
    if (biggestGroup >= 4) {
      score += (biggestGroup - 3) * (biggestGroup - 3) * 90;
    }

    // Lookahead for cascade chains. Each cascade step is much more valuable
    // than the previous one — a chain x3 sends a 1x4 strip, chain x5 a full
    // row, chain x6 stacks two rows. Reward depth heavily.
    if (this.profile.chainSearchDepth > 0 && immediateCleared > 0) {
      if (this.rng() < this.profile.chainSetupRate || this.profile.chainSetupRate >= 1) {
        const depth = this.profile.chainSearchDepth;
        const cascade = simulateCascadesDetailed(sim, depth);
        // Each step weight grows quadratically: step 1 = 80, step 2 = 320,
        // step 3 = 720, step 4 = 1280, step 5 = 2000.
        for (let i = 0; i < cascade.perStep.length; i++) {
          const stepWeight = (i + 1) * (i + 1) * 80;
          score += cascade.perStep[i] * stepWeight;
        }
      }
    }

    // Vertical 3-stack setup detection — bonus when a swap doesn't clear
    // anything immediately but puts the board on a chain-ready footing.
    if (immediateCleared === 0) {
      score += scoreVerticalSetup(sim) * 25;
    }

    // Penalty for tall stacks (don't pile higher). The penalty grows with
    // how close the top blocks are to row 0.
    const stackHeightPenalty = stackHeightPenaltyFor(sim);
    score -= stackHeightPenalty * 10;

    // Tiny distance penalty so the AI prefers nearby swaps — only ~3 points
    // per Manhattan cell, dwarfed by the chain bonuses for skilled profiles.
    const dist =
      Math.abs(this.engine.cursor.row - row) +
      Math.abs(this.engine.cursor.col - col);
    score -= dist * 3;

    return score;
  }

  /**
   * Translate a `SwapPlan` into a sequence of micro-actions. Walks the cursor
   * step-by-step ("human-like" feel) and ends with a swap press.
   */
  private queuePlan(plan: SwapPlan): void {
    const start = { row: this.engine.cursor.row, col: this.engine.cursor.col };
    // Vertical first, then horizontal — matches what most humans do.
    const dRow = plan.row - start.row;
    const dCol = plan.col - start.col;
    const stepR = dRow === 0 ? 0 : dRow > 0 ? 1 : -1;
    const stepC = dCol === 0 ? 0 : dCol > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(dRow); i++) {
      this.inputQueue.push({ kind: 'cursorMove', dRow: stepR, dCol: 0 });
    }
    for (let i = 0; i < Math.abs(dCol); i++) {
      this.inputQueue.push({ kind: 'cursorMove', dRow: 0, dCol: stepC });
    }
    this.inputQueue.push({ kind: 'swap' });
  }

  private executeInput(input: AIInput): void {
    switch (input.kind) {
      case 'cursorMove':
        this.engine.moveCursor(input.dRow, input.dCol);
        return;
      case 'cursorSet':
        this.engine.setCursor(input.row, input.col);
        return;
      case 'swap':
        this.engine.swap();
        return;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers (pure functions over a cloned Grid — never touch the live engine)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Swap two cells in a cloned grid as if `engine.swap()` had just executed.
 * Both cells immediately become idle in the clone so subsequent simulation
 * passes treat them as candidates for matching/falling.
 */
function swapInClone(grid: Grid, row: number, col: number): void {
  const left = grid.cells[row][col];
  const right = grid.cells[row][col + 1];
  grid.cells[row][col] = right;
  grid.cells[row][col + 1] = left;
  // After the swap, in the live engine the blocks go through a `swapping`
  // phase, but for AI planning purposes we treat them as immediately idle so
  // the simulator can detect matches and gravity reliably.
  if (left !== null) left.state = 'idle';
  if (right !== null) right.state = 'idle';
}

/**
 * Bottom-up gravity pass on a cloned grid. Moves blocks down until no gaps
 * remain in any column. Marks moved blocks as 'idle' afterwards so subsequent
 * `findMatches` calls see them.
 */
function applySimGravity(grid: Grid): void {
  for (let c = 0; c < grid.cols; c++) {
    // Compact the column: collect non-null blocks, place them bottom-up.
    const stack: Block[] = [];
    for (let r = 0; r < grid.rows; r++) {
      const cell = grid.cells[r][c];
      if (cell !== null) stack.push(cell);
    }
    let r = grid.rows - 1;
    for (let i = stack.length - 1; i >= 0; i--) {
      const block = stack[i];
      block.state = 'idle';
      grid.cells[r][c] = block;
      r--;
    }
    while (r >= 0) {
      grid.cells[r][c] = null;
      r--;
    }
  }
}

/**
 * Run `depth` cascade passes on a cloned grid: clear matches, apply gravity,
 * re-detect. Returns the total number of cells cleared across all passes after
 * the initial match (i.e., the cascade payoff).
 */
function simulateCascades(grid: Grid, depth: number): number {
  let total = 0;
  // First pass: clear any existing matches (the immediate match) — counted
  // separately by the caller, so we discard its size here.
  let groups = findMatches(grid);
  if (groups.length === 0) return 0;
  clearMatchedCells(grid, groups);
  applySimGravity(grid);

  for (let i = 0; i < depth; i++) {
    groups = findMatches(grid);
    if (groups.length === 0) break;
    let cleared = 0;
    for (const g of groups) cleared += g.cells.length;
    total += cleared;
    clearMatchedCells(grid, groups);
    applySimGravity(grid);
  }
  return total;
}

/**
 * Like `simulateCascades` but reports the cells cleared at EACH cascade step,
 * so the caller can weight deeper cascades more heavily. `perStep[0]` is the
 * first cascade after the immediate match, `perStep[1]` the second, etc.
 */
function simulateCascadesDetailed(grid: Grid, depth: number): { perStep: number[] } {
  const perStep: number[] = [];
  let groups = findMatches(grid);
  if (groups.length === 0) return { perStep };
  clearMatchedCells(grid, groups);
  applySimGravity(grid);

  for (let i = 0; i < depth; i++) {
    groups = findMatches(grid);
    if (groups.length === 0) break;
    let cleared = 0;
    for (const g of groups) cleared += g.cells.length;
    perStep.push(cleared);
    clearMatchedCells(grid, groups);
    applySimGravity(grid);
  }
  return { perStep };
}

function clearMatchedCells(grid: Grid, groups: ReturnType<typeof findMatches>): void {
  for (const g of groups) {
    for (const ref of g.cells) {
      grid.cells[ref.row][ref.col] = null;
    }
  }
}

/**
 * Light vertical-setup heuristic: counts pairs of same-color adjacent cells in
 * each column that have a third same-color block somewhere higher in the same
 * column (which would, after the upper block falls past a gap, complete a
 * vertical run). Returns a small integer multiplier of "near matches".
 */
function scoreVerticalSetup(grid: Grid): number {
  let setups = 0;
  for (let c = 0; c < grid.cols; c++) {
    for (let r = 0; r < grid.rows - 1; r++) {
      const a = grid.cells[r][c];
      const b = grid.cells[r + 1][c];
      if (a === null || b === null) continue;
      if (a.color !== b.color) continue;
      // Look for a same-color block higher up in the column that could fall
      // here.
      for (let rUp = r - 1; rUp >= 0; rUp--) {
        const above = grid.cells[rUp][c];
        if (above === null) continue;
        if (above.color === a.color) {
          setups += 1;
        }
        break;
      }
    }
  }
  return setups;
}

/**
 * Penalty proportional to how much of the upper 25% of the grid is occupied.
 * Stack height "above 75%" means rows whose index is below 25% of total rows
 * (since row 0 is the top).
 */
function stackHeightPenaltyFor(grid: Grid): number {
  const dangerCutoff = Math.floor(grid.rows * 0.25);
  let occupied = 0;
  for (let r = 0; r < dangerCutoff; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.cells[r][c] !== null) occupied += 1;
    }
  }
  return occupied;
}

// Re-export for tests that want to verify the planner directly.
export const __internal = {
  swapInClone,
  applySimGravity,
  simulateCascades,
  scoreVerticalSetup,
  stackHeightPenaltyFor,
};

// (Intentionally not exporting BlockColor / Cell types — callers should import
// from `./types` directly.)
export type { BlockColor, Cell };
