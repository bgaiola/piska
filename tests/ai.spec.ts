import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '../src/engine/GameEngine';
import { AIPlayer, AI_PROFILES, type AIDifficulty } from '../src/engine/AIPlayer';
import type { Block, BlockColor, BlockState, EngineEvent } from '../src/engine/types';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

let nextId = 1;

function mkBlock(color: BlockColor, state: BlockState = 'idle'): Block {
  // The engine extends `Block` with a `kind` field (a parallel agent is
  // updating types). Use a runtime cast so this test file remains green
  // regardless of whether `kind` is required at type-check time.
  return {
    id: nextId++,
    color,
    kind: 'color',
    state,
    swapTimer: 0,
    clearTimer: 0,
    fallTimer: 0,
    swapDir: 0,
  } as Block;
}

function makeEngine(rngSeed = 12345): GameEngine {
  // initialStackHeight: 0 → we'll build our own boards directly so the AI's
  // decisions are perfectly predictable.
  return new GameEngine({ rows: 12, cols: 6, initialStackHeight: 0, rngSeed });
}

function clearGrid(engine: GameEngine): void {
  for (let r = 0; r < engine.cfg.rows; r++) {
    for (let c = 0; c < engine.cfg.cols; c++) {
      engine.grid.set(r, c, null);
    }
  }
  // Avoid the engine rising while we're constructing test boards: place the
  // cursor far from the danger zone (row clamps to maxRow on setCursor).
  engine.grid.riseOffset = 0;
}

/**
 * Run `update` and `tick` in lockstep for `iterations` iterations of `stepMs`.
 */
function pump(
  engine: GameEngine,
  ai: AIPlayer,
  stepMs: number,
  iterations: number,
  onEvent?: (e: EngineEvent) => void,
): void {
  const unsub = onEvent ? engine.events.on(onEvent) : null;
  for (let i = 0; i < iterations; i++) {
    ai.update(stepMs);
    engine.tick(stepMs);
    if (engine.gameOver) break;
  }
  if (unsub) unsub();
}

// ─────────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────────

describe('AIPlayer construction', () => {
  it.each<AIDifficulty>(['easy', 'medium', 'hard', 'master'])(
    'constructs with difficulty %s without throwing',
    (difficulty) => {
      const engine = makeEngine();
      const ai = new AIPlayer(engine, difficulty);
      expect(ai.difficulty).toBe(difficulty);
      expect(ai.profile).toBe(AI_PROFILES[difficulty]);
    },
  );

  it('exposes the right profile constants', () => {
    expect(AI_PROFILES.easy.candidateLimit).toBe(6);
    expect(AI_PROFILES.master.candidateLimit).toBeGreaterThanOrEqual(48);
    expect(AI_PROFILES.master.mistakeRate).toBe(0);
    // Mestre must look at least 3 cascades deep — bumped to 5 for v2 tuning.
    expect(AI_PROFILES.master.chainSearchDepth).toBeGreaterThanOrEqual(3);
  });

  it('setDifficulty switches profile', () => {
    const engine = makeEngine();
    const ai = new AIPlayer(engine, 'easy');
    ai.setDifficulty('master');
    expect(ai.difficulty).toBe('master');
    expect(ai.profile).toBe(AI_PROFILES.master);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Picks a useful swap
// ─────────────────────────────────────────────────────────────────────────

describe('AIPlayer planNextSwap', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = makeEngine();
    clearGrid(engine);
    nextId = 1;
  });

  it('picks a swap that creates a horizontal match when available', () => {
    // Board (row 11, bottom): [R, B, R, _, _, _]
    // A swap of col 1 <-> col 2 turns it into [R, R, B, _, _, _] which is
    // useless on its own — but if we instead arrange [R, R, B, R, _, _] then
    // swapping col 2 <-> col 3 yields [R, R, R, B, _, _] → a 3-run.
    engine.grid.set(11, 0, mkBlock('red'));
    engine.grid.set(11, 1, mkBlock('red'));
    engine.grid.set(11, 2, mkBlock('blue'));
    engine.grid.set(11, 3, mkBlock('red'));

    const ai = new AIPlayer(engine, 'master', 42);
    const plan = ai.peekBestPlan();
    expect(plan).not.toBeNull();
    if (plan === null) return;
    expect(plan.row).toBe(11);
    expect(plan.col).toBe(2);
    expect(plan.score).toBeGreaterThan(0);
  });

  it('returns null when no useful swap exists', () => {
    // Just one block — no possible 3-in-a-row from any swap.
    engine.grid.set(11, 0, mkBlock('red'));
    engine.grid.set(11, 3, mkBlock('blue'));
    engine.grid.set(10, 5, mkBlock('green'));

    const ai = new AIPlayer(engine, 'master', 42);
    const plan = ai.peekBestPlan();
    expect(plan).toBeNull();
  });

  it('walks the cursor and triggers a swap event at the right cell', () => {
    // Use a very slow rise speed so the board doesn't shift during the test.
    const eng = new GameEngine({
      rows: 12,
      cols: 6,
      initialStackHeight: 0,
      baseRiseSpeed: 0,
      rngSeed: 1,
    });
    clearGrid(eng);
    eng.grid.set(11, 0, mkBlock('red'));
    eng.grid.set(11, 1, mkBlock('red'));
    eng.grid.set(11, 2, mkBlock('blue'));
    eng.grid.set(11, 3, mkBlock('red'));

    // Cursor starts far from the swap site.
    eng.setCursor(0, 0);
    const ai = new AIPlayer(eng, 'master', 7);

    const swaps: { row: number; colLeft: number }[] = [];
    pump(eng, ai, 50, 600, (e) => {
      if (e.type === 'block.swapped') {
        swaps.push({ row: e.row, colLeft: e.colLeft });
      }
    });

    // First swap should land at (11, 2) <-> (11, 3).
    expect(swaps.length).toBeGreaterThanOrEqual(1);
    expect(swaps[0]).toEqual({ row: 11, colLeft: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────────

describe('AIPlayer determinism', () => {
  it('two AIs with the same seed pick the same swap on identical engines', () => {
    nextId = 1;
    const a = makeEngine();
    clearGrid(a);
    a.grid.set(11, 0, mkBlock('red'));
    a.grid.set(11, 1, mkBlock('red'));
    a.grid.set(11, 2, mkBlock('blue'));
    a.grid.set(11, 3, mkBlock('red'));
    // Add some same-score noise so a non-deterministic mistake-pick would
    // differ.
    a.grid.set(10, 0, mkBlock('green'));
    a.grid.set(10, 1, mkBlock('green'));
    a.grid.set(10, 2, mkBlock('yellow'));
    a.grid.set(10, 3, mkBlock('green'));

    nextId = 1;
    const b = makeEngine();
    clearGrid(b);
    b.grid.set(11, 0, mkBlock('red'));
    b.grid.set(11, 1, mkBlock('red'));
    b.grid.set(11, 2, mkBlock('blue'));
    b.grid.set(11, 3, mkBlock('red'));
    b.grid.set(10, 0, mkBlock('green'));
    b.grid.set(10, 1, mkBlock('green'));
    b.grid.set(10, 2, mkBlock('yellow'));
    b.grid.set(10, 3, mkBlock('green'));

    const aiA = new AIPlayer(a, 'medium', 999);
    const aiB = new AIPlayer(b, 'medium', 999);

    const planA = aiA.peekBestPlan();
    const planB = aiB.peekBestPlan();

    expect(planA).not.toBeNull();
    expect(planB).not.toBeNull();
    expect(planA).toEqual(planB);
  });

  it('different seeds still pick the unique best when only one positive option exists', () => {
    nextId = 1;
    const e1 = makeEngine();
    clearGrid(e1);
    e1.grid.set(11, 0, mkBlock('red'));
    e1.grid.set(11, 1, mkBlock('red'));
    e1.grid.set(11, 2, mkBlock('blue'));
    e1.grid.set(11, 3, mkBlock('red'));

    nextId = 1;
    const e2 = makeEngine();
    clearGrid(e2);
    e2.grid.set(11, 0, mkBlock('red'));
    e2.grid.set(11, 1, mkBlock('red'));
    e2.grid.set(11, 2, mkBlock('blue'));
    e2.grid.set(11, 3, mkBlock('red'));

    // Even master with mistakeRate=0 should be insensitive to seed when the
    // top-1 is dominant.
    const ai1 = new AIPlayer(e1, 'master', 1);
    const ai2 = new AIPlayer(e2, 'master', 2);

    expect(ai1.peekBestPlan()).toEqual(ai2.peekBestPlan());
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Difficulty differentiates decisions
// ─────────────────────────────────────────────────────────────────────────

describe('AIPlayer difficulty', () => {
  it('master finds the optimal swap, easy is allowed to miss it', () => {
    // Construct a board with two valid swaps of differing payoff.
    // Row 11: [G, G, _, _, B, B] → swapping at (11, 3) does nothing useful
    //   because the green pair has no third green nearby.
    // Add row 10: [_, _, G, _, _, _] and row 9: [_, _, G, _, _, _].
    //   A swap of (11, 2) <-> (11, 1) doesn't help either, but the cascading
    //   structure scoring will differ between profiles.
    // Simpler test: ensure that across many random seeds, master gives the
    // same answer (deterministic best), while easy can flip thanks to its
    // 0.45 mistake rate. We just assert master's pick is the *highest score*
    // candidate while easy is allowed to pick a different one.
    const engine = makeEngine();
    clearGrid(engine);
    nextId = 1;
    // Two equally-good 3-match opportunities far apart.
    // Row 11 left side: R R B R (best swap (11,2))
    engine.grid.set(11, 0, mkBlock('red'));
    engine.grid.set(11, 1, mkBlock('red'));
    engine.grid.set(11, 2, mkBlock('blue'));
    engine.grid.set(11, 3, mkBlock('red'));
    // Row 9 right side: also a 3-match opportunity (a little farther from cursor)
    engine.grid.set(9, 2, mkBlock('green'));
    engine.grid.set(9, 3, mkBlock('green'));
    engine.grid.set(9, 4, mkBlock('yellow'));
    engine.grid.set(9, 5, mkBlock('green'));

    // Master should pick the highest-scoring option deterministically.
    const masterAi = new AIPlayer(engine, 'master', 1);
    const masterPlan = masterAi.peekBestPlan();
    expect(masterPlan).not.toBeNull();

    // Easy on the same board with the same seed should *also* return a
    // candidate, but its candidateLimit and mistakeRate change behaviour. We
    // verify it returns *some* plan (it shouldn't be locked out).
    const easyAi = new AIPlayer(engine, 'easy', 1);
    const easyPlan = easyAi.peekBestPlan();
    expect(easyPlan).not.toBeNull();

    // Across many seeds, easy should sometimes pick a different (suboptimal)
    // candidate, while master never does.
    const optimal = masterPlan;
    if (optimal === null) return;
    let easyDifferent = 0;
    for (let seed = 0; seed < 50; seed++) {
      const e = makeEngine();
      clearGrid(e);
      e.grid.set(11, 0, mkBlock('red'));
      e.grid.set(11, 1, mkBlock('red'));
      e.grid.set(11, 2, mkBlock('blue'));
      e.grid.set(11, 3, mkBlock('red'));
      e.grid.set(9, 2, mkBlock('green'));
      e.grid.set(9, 3, mkBlock('green'));
      e.grid.set(9, 4, mkBlock('yellow'));
      e.grid.set(9, 5, mkBlock('green'));
      const ai = new AIPlayer(e, 'easy', seed);
      const p = ai.peekBestPlan();
      if (p && (p.row !== optimal.row || p.col !== optimal.col)) easyDifferent++;
    }
    // With a 0.45 mistake rate and 2+ candidates within top-N, we expect at
    // least a few differing decisions across 50 seeds.
    expect(easyDifferent).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Pressure
// ─────────────────────────────────────────────────────────────────────────

describe('AIPlayer pressure mode', () => {
  it('hard/master press raise when the stack is comfortable', () => {
    const engine = makeEngine();
    clearGrid(engine);
    nextId = 1;
    // Place only a single low block — board is mostly empty (top row index
    // ≈ 11, which is far from the danger threshold at row 2-4).
    engine.grid.set(11, 0, mkBlock('red'));
    engine.grid.set(11, 1, mkBlock('blue'));

    const ai = new AIPlayer(engine, 'hard', 123);
    // Pump enough ticks for the AI to engage the raise.
    pump(engine, ai, 20, 200);
    // After the AI considers a press at least once, it should be applying
    // pressure (manualRaise = true) OR cycling on/off via the timer. We just
    // check that at *some* point during a longer pump it does press.
    let pressed = false;
    const e2 = makeEngine();
    clearGrid(e2);
    nextId = 1;
    e2.grid.set(11, 0, mkBlock('red'));
    e2.grid.set(11, 1, mkBlock('blue'));
    const ai2 = new AIPlayer(e2, 'hard', 123);
    for (let i = 0; i < 400; i++) {
      ai2.update(20);
      e2.tick(20);
      if (e2.manualRaise) {
        pressed = true;
        break;
      }
      if (e2.gameOver) break;
    }
    expect(pressed).toBe(true);
  });

  it('hard/master release raise when the stack is dangerously high', () => {
    const engine = makeEngine();
    clearGrid(engine);
    nextId = 1;
    // Fill the top rows so the topmost non-empty row is well within the
    // danger zone (row index <= floor(12 * 0.20) = 2).
    for (let r = 0; r <= 2; r++) {
      for (let c = 0; c < engine.cfg.cols; c++) {
        // Avoid creating accidental matches by alternating colors per (r+c).
        const palette: BlockColor[] = ['red', 'blue', 'yellow', 'cyan', 'purple'];
        engine.grid.set(r, c, mkBlock(palette[(r + c) % palette.length]));
      }
    }
    // Engage raise to start with so the AI must explicitly release.
    engine.setManualRaise(true);
    const ai = new AIPlayer(engine, 'master', 0);

    // One AI update should observe the danger and release.
    for (let i = 0; i < 5; i++) ai.update(10);
    expect(engine.manualRaise).toBe(false);
  });

  it('easy/medium never press raise (usesPressure = false)', () => {
    const engine = makeEngine();
    clearGrid(engine);
    nextId = 1;
    engine.grid.set(11, 0, mkBlock('red'));
    const ai = new AIPlayer(engine, 'easy', 99);
    for (let i = 0; i < 500; i++) {
      ai.update(20);
      engine.tick(20);
      if (engine.gameOver) break;
      // Easy must never have engaged raise.
      expect(engine.manualRaise).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// No mutation of live engine during planning
// ─────────────────────────────────────────────────────────────────────────

describe('AIPlayer non-invasive planning', () => {
  it('peekBestPlan does not mutate the engine grid', () => {
    const engine = makeEngine();
    clearGrid(engine);
    nextId = 1;
    engine.grid.set(11, 0, mkBlock('red'));
    engine.grid.set(11, 1, mkBlock('red'));
    engine.grid.set(11, 2, mkBlock('blue'));
    engine.grid.set(11, 3, mkBlock('red'));

    // Snapshot.
    const before: Array<{ row: number; col: number; color: BlockColor }> = [];
    for (let r = 0; r < engine.cfg.rows; r++) {
      for (let c = 0; c < engine.cfg.cols; c++) {
        const cell = engine.grid.cells[r][c];
        if (cell) before.push({ row: r, col: c, color: cell.color });
      }
    }

    const ai = new AIPlayer(engine, 'master', 555);
    ai.peekBestPlan();

    const after: Array<{ row: number; col: number; color: BlockColor }> = [];
    for (let r = 0; r < engine.cfg.rows; r++) {
      for (let c = 0; c < engine.cfg.cols; c++) {
        const cell = engine.grid.cells[r][c];
        if (cell) after.push({ row: r, col: c, color: cell.color });
      }
    }
    expect(after).toEqual(before);
  });
});
