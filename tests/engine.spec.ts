import { describe, expect, it } from 'vitest';
import { ChainTracker } from '../src/engine/ChainTracker';
import { GameEngine } from '../src/engine/GameEngine';
import { Grid } from '../src/engine/Grid';
import { findMatches } from '../src/engine/MatchDetector';
import { ScoreManager } from '../src/engine/ScoreManager';
import type { Block, BlockColor } from '../src/engine/types';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

let nextId = 1;
function mkBlock(color: BlockColor, state: Block['state'] = 'idle'): Block {
  return {
    id: nextId++,
    color,
    kind: 'color',
    state,
    swapTimer: 0,
    clearTimer: 0,
    fallTimer: 0,
    swapDir: 0,
  };
}

function clearGrid(engine: GameEngine): void {
  for (let r = 0; r < engine.cfg.rows; r++) {
    for (let c = 0; c < engine.cfg.cols; c++) {
      engine.grid.set(r, c, null);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// findMatches
// ─────────────────────────────────────────────────────────────────────────

describe('findMatches', () => {
  it('detects a horizontal run of 3', () => {
    const g = new Grid(6, 6);
    g.set(2, 1, mkBlock('red'));
    g.set(2, 2, mkBlock('red'));
    g.set(2, 3, mkBlock('red'));
    const groups = findMatches(g);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(3);
  });

  it('detects a vertical run of 3', () => {
    const g = new Grid(6, 6);
    g.set(0, 2, mkBlock('blue'));
    g.set(1, 2, mkBlock('blue'));
    g.set(2, 2, mkBlock('blue'));
    const groups = findMatches(g);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(3);
  });

  it('unions overlapping H + V runs into a single L-shape group', () => {
    const g = new Grid(6, 6);
    // L-shape with shared corner at (2, 2)
    g.set(2, 0, mkBlock('green'));
    g.set(2, 1, mkBlock('green'));
    g.set(2, 2, mkBlock('green'));
    g.set(3, 2, mkBlock('green'));
    g.set(4, 2, mkBlock('green'));
    const groups = findMatches(g);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(5);
  });

  it('ignores non-idle blocks', () => {
    const g = new Grid(6, 6);
    g.set(2, 1, mkBlock('red', 'swapping'));
    g.set(2, 2, mkBlock('red', 'falling'));
    g.set(2, 3, mkBlock('red', 'clearing'));
    expect(findMatches(g)).toHaveLength(0);
  });

  it('emits no match for runs shorter than 3', () => {
    const g = new Grid(6, 6);
    g.set(2, 1, mkBlock('red'));
    g.set(2, 2, mkBlock('red'));
    expect(findMatches(g)).toHaveLength(0);
  });

  it('considers landed blocks matchable', () => {
    const g = new Grid(6, 6);
    g.set(2, 1, mkBlock('cyan', 'landed'));
    g.set(2, 2, mkBlock('cyan', 'landed'));
    g.set(2, 3, mkBlock('cyan', 'idle'));
    expect(findMatches(g)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ChainTracker
// ─────────────────────────────────────────────────────────────────────────

describe('ChainTracker', () => {
  it('starts at 1', () => {
    const ct = new ChainTracker();
    expect(ct.current).toBe(1);
  });

  it('registerMatch increments on cascade', () => {
    const ct = new ChainTracker();
    expect(ct.registerMatch(false)).toBe(1);
    expect(ct.registerMatch(true)).toBe(2);
    expect(ct.registerMatch(true)).toBe(3);
  });

  it('non-cascade match resets chain to 1', () => {
    const ct = new ChainTracker();
    ct.registerMatch(false);
    ct.registerMatch(true); // chain = 2
    expect(ct.current).toBe(2);
    ct.registerMatch(false);
    expect(ct.current).toBe(1);
  });

  it('settle reports broken=true when chain>1', () => {
    const ct = new ChainTracker();
    ct.registerMatch(false);
    ct.registerMatch(true);
    const res = ct.settle();
    expect(res.broken).toBe(true);
    expect(res.finalChain).toBe(2);
    expect(ct.current).toBe(1);
  });

  it('settle reports broken=false when chain==1', () => {
    const ct = new ChainTracker();
    ct.registerMatch(false);
    const res = ct.settle();
    expect(res.broken).toBe(false);
    expect(res.finalChain).toBe(1);
  });

  it('reset clears state', () => {
    const ct = new ChainTracker();
    ct.registerMatch(false);
    ct.registerMatch(true);
    ct.cascading = true;
    ct.reset();
    expect(ct.current).toBe(1);
    expect(ct.cascading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ScoreManager
// ─────────────────────────────────────────────────────────────────────────

describe('ScoreManager', () => {
  it('pointsFor(3, 1) = base 30, no bonuses', () => {
    const sm = new ScoreManager();
    expect(sm.pointsFor(3, 1)).toEqual({ base: 30, comboBonus: 0, chainBonus: 0 });
  });

  it('pointsFor(4, 1) includes combo bonus', () => {
    const sm = new ScoreManager();
    const pts = sm.pointsFor(4, 1);
    expect(pts.base).toBe(40);
    expect(pts.comboBonus).toBe(50);
    expect(pts.chainBonus).toBe(0);
  });

  it('pointsFor(5, 1) combo bonus 100', () => {
    const sm = new ScoreManager();
    expect(sm.pointsFor(5, 1).comboBonus).toBe(100);
  });

  it('pointsFor(6, 1) combo bonus 200', () => {
    const sm = new ScoreManager();
    expect(sm.pointsFor(6, 1).comboBonus).toBe(200);
  });

  it('pointsFor(3, 2) includes chain bonus', () => {
    const sm = new ScoreManager();
    const pts = sm.pointsFor(3, 2);
    expect(pts.base).toBe(30);
    expect(pts.chainBonus).toBeGreaterThan(0);
  });

  it('add accumulates and reset zeroes', () => {
    const sm = new ScoreManager();
    sm.add(10);
    sm.add(5);
    expect(sm.score).toBe(15);
    sm.reset();
    expect(sm.score).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────────────────────────────────

describe('Grid', () => {
  it('clone is independent of the original', () => {
    const g = new Grid(4, 4);
    g.set(0, 0, mkBlock('red'));
    const c = g.clone();
    const cloned = c.get(0, 0)!;
    cloned.color = 'blue';
    expect(g.get(0, 0)!.color).toBe('red');
  });

  it('clone preserves riseOffset', () => {
    const g = new Grid(4, 4);
    g.riseOffset = 0.42;
    expect(g.clone().riseOffset).toBe(0.42);
  });

  it('hasTopout is true when an idle block sits at row 0', () => {
    const g = new Grid(4, 4);
    g.set(0, 2, mkBlock('green', 'idle'));
    expect(g.hasTopout()).toBe(true);
  });

  it('hasTopout is false when row 0 only has non-idle blocks', () => {
    const g = new Grid(4, 4);
    g.set(0, 2, mkBlock('green', 'falling'));
    expect(g.hasTopout()).toBe(false);
  });

  it('isInBounds rejects negatives and overflows', () => {
    const g = new Grid(4, 4);
    expect(g.isInBounds(-1, 0)).toBe(false);
    expect(g.isInBounds(0, -1)).toBe(false);
    expect(g.isInBounds(4, 0)).toBe(false);
    expect(g.isInBounds(0, 4)).toBe(false);
    expect(g.isInBounds(2, 2)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GameEngine — init & swap
// ─────────────────────────────────────────────────────────────────────────

describe('GameEngine init', () => {
  it('is deterministic: same seed → identical initial grid', () => {
    const a = new GameEngine({ rngSeed: 42 });
    const b = new GameEngine({ rngSeed: 42 });
    for (let r = 0; r < a.cfg.rows; r++) {
      for (let c = 0; c < a.cfg.cols; c++) {
        const ca = a.grid.get(r, c);
        const cb = b.grid.get(r, c);
        expect(ca === null ? null : ca.color).toBe(cb === null ? null : cb.color);
      }
    }
  });

  it('produces no immediate matches at the start', () => {
    for (const seed of [1, 7, 42, 12345, 99999]) {
      const e = new GameEngine({ rngSeed: seed });
      expect(findMatches(e.grid)).toHaveLength(0);
    }
  });

  it('cursor starts within valid range', () => {
    const e = new GameEngine();
    expect(e.cursor.row).toBeGreaterThanOrEqual(0);
    expect(e.cursor.row).toBeLessThan(e.cfg.rows);
    expect(e.cursor.col).toBeGreaterThanOrEqual(0);
    expect(e.cursor.col).toBeLessThanOrEqual(e.cfg.cols - 2);
  });
});

describe('GameEngine swap', () => {
  it('two adjacent idle blocks transition through swapping then back to idle', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    // Pick a row that's filled at init (bottom rows).
    const r = e.cfg.rows - 1;
    e.setCursor(r, 0);
    const left = e.grid.get(r, 0);
    const right = e.grid.get(r, 1);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    const leftIdBefore = left!.id;
    const rightIdBefore = right!.id;

    const ok = e.swap();
    expect(ok).toBe(true);

    // Immediately after swap, the cells should be in swapping state and have
    // been swapped already in the grid.
    expect(e.grid.get(r, 0)!.id).toBe(rightIdBefore);
    expect(e.grid.get(r, 1)!.id).toBe(leftIdBefore);
    expect(e.grid.get(r, 0)!.state).toBe('swapping');
    expect(e.grid.get(r, 1)!.state).toBe('swapping');

    // Advance time past swapDuration. Use tiny dt to keep gravity stable.
    for (let i = 0; i < 10; i++) e.tick(20);
    expect(e.grid.get(r, 0)!.state).not.toBe('swapping');
    expect(e.grid.get(r, 1)!.state).not.toBe('swapping');
  });

  it('rejects swap when either side is in a non-idle state', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    const r = e.cfg.rows - 1;
    e.setCursor(r, 0);
    const left = e.grid.get(r, 0)!;
    left.state = 'clearing';
    expect(e.swap()).toBe(false);
  });

  it('allows swapping a block into an empty cell', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    // Make the bottom row empty except at column 0 so gravity doesn't fire
    // immediately.
    clearGrid(e);
    e.grid.set(0, 0, mkBlock('red'));
    e.setCursor(0, 0);
    const ok = e.swap();
    expect(ok).toBe(true);
    expect(e.grid.get(0, 0)).toBeNull();
    expect(e.grid.get(0, 1)).not.toBeNull();
    expect(e.grid.get(0, 1)!.state).toBe('swapping');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GameEngine — matching, clearing, scoring
// ─────────────────────────────────────────────────────────────────────────

describe('GameEngine matching', () => {
  it('three same-color horizontal blocks enter clearing and are removed', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    clearGrid(e);
    e.pause(); // disable rise temporarily so we can hand-craft the grid
    const r = e.cfg.rows - 1;
    e.grid.set(r, 1, mkBlock('red'));
    e.grid.set(r, 2, mkBlock('red'));
    e.grid.set(r, 3, mkBlock('red'));
    e.resume();
    const scoreBefore = e.score.score;

    // One tick to detect & flag clearing.
    e.tick(1);
    expect(e.grid.get(r, 1)!.state).toBe('clearing');
    expect(e.grid.get(r, 2)!.state).toBe('clearing');
    expect(e.grid.get(r, 3)!.state).toBe('clearing');
    expect(e.score.score).toBeGreaterThan(scoreBefore);

    // Advance enough ticks to exceed clearDurationMs.
    const ticksNeeded = Math.ceil(e.cfg.clearDurationMs / 20) + 2;
    for (let i = 0; i < ticksNeeded; i++) e.tick(20);
    expect(e.grid.get(r, 1)).toBeNull();
    expect(e.grid.get(r, 2)).toBeNull();
    expect(e.grid.get(r, 3)).toBeNull();
  });

  it('emits match.found and score.delta events', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    clearGrid(e);
    const r = e.cfg.rows - 1;
    e.grid.set(r, 1, mkBlock('red'));
    e.grid.set(r, 2, mkBlock('red'));
    e.grid.set(r, 3, mkBlock('red'));

    const events: string[] = [];
    e.events.on((ev) => events.push(ev.type));
    e.tick(1);
    expect(events).toContain('match.found');
    expect(events).toContain('score.delta');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GameEngine — cascade chain
// ─────────────────────────────────────────────────────────────────────────

describe('GameEngine cascade chain', () => {
  it('falling blocks forming a new match register chain >= 2', () => {
    const e = new GameEngine({ rngSeed: 12345, fallStepMs: 10, clearDurationMs: 30 });
    clearGrid(e);
    e.pause(); // prevent automatic rise from interfering during setup
    const rows = e.cfg.rows;
    // Cascade setup: clear a horizontal red trio along the bottom; above the
    // middle red there is a pair of blue blocks. After the red clears, the
    // blue pair falls one row and joins a third blue already at the bottom of
    // a NEIGHBORING column — wait, that's not vertical alignment. Simpler:
    //
    //   row rows-2, col 0: blue
    //   row rows-2, col 1: blue       <- gap will appear below it
    //   row rows-2, col 2: blue
    //   row rows-1, cols 0,1,2: red red red
    //
    // After the reds clear, the three blues fall one row → still horizontal
    // trio at row rows-1, cols 0..2. That's not a cascade match because they
    // already matched horizontally BEFORE the fall. Better: stack only the
    // MIDDLE blue above the red, and put isolated blues on either side at the
    // bottom row. After the middle one falls, all three line up horizontally.
    //
    //   row rows-2, col 1: blue   <- will fall when red below clears
    //   row rows-1, col 0: blue
    //   row rows-1, col 1: red    <- middle of the trio
    //   row rows-1, col 2: blue
    //   ...but the trio of reds needs cols 1,2,3 then. Re-layout:
    //
    //   row rows-2, col 2: blue
    //   row rows-1, col 0: blue
    //   row rows-1, col 1: red
    //   row rows-1, col 2: red
    //   row rows-1, col 3: red
    //   row rows-1, col 4: blue
    //
    // After reds clear, the lone blue at (rows-2, 2) falls to (rows-1, 2),
    // joining (rows-1, 1)?? No, that cell was red. Try once more with
    // care: the blue at (rows-2, 2) falls one row and lands at (rows-1, 2),
    // creating a horizontal blue trio at (rows-1, 0..no wait, col 1 was red)
    //
    // Cleanest design: put blues UNDER the reds is impossible (reds at bottom).
    // Put the stack vertically: three blues stacked above col 2, with two reds
    // at col 2 below them but a red trio elsewhere consumes the gap. We use:
    //
    //   row rows-3, col 2: blue
    //   row rows-2, col 2: blue
    //   row rows-1, col 0: red
    //   row rows-1, col 1: red
    //   row rows-1, col 2: red
    //   row rows-1, col 3: blue
    //
    // After reds clear, the blues at (rows-3, 2) and (rows-2, 2) fall two
    // rows so they end at (rows-2, 2) and (rows-1, 2). The blue at (rows-1, 3)
    // is already there. Now we have blue at (rows-1, 2) and (rows-1, 3) —
    // only 2 in a row, no match. Need one more. Add blue at (rows-1, 4):
    e.grid.set(rows - 3, 2, mkBlock('blue'));
    e.grid.set(rows - 2, 2, mkBlock('blue'));
    e.grid.set(rows - 1, 0, mkBlock('red'));
    e.grid.set(rows - 1, 1, mkBlock('red'));
    e.grid.set(rows - 1, 2, mkBlock('red'));
    e.grid.set(rows - 1, 3, mkBlock('blue'));
    e.grid.set(rows - 1, 4, mkBlock('blue'));
    e.resume();

    // Capture chain numbers reported by match.found events.
    const chains: number[] = [];
    e.events.on((ev) => {
      if (ev.type === 'match.found') chains.push(ev.chain);
    });

    // Run the simulation forward enough for the clear + fall + second match.
    for (let i = 0; i < 400; i++) {
      if (e.gameOver) break;
      e.tick(5);
    }

    expect(chains.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...chains)).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GameEngine — game over
// ─────────────────────────────────────────────────────────────────────────

describe('GameEngine game over', () => {
  it('flags game over when an idle block reaches row 0 after rise', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    e.pause(); // prevent automatic rise so we craft the state ourselves
    // Fully pack column 1 with idle blocks so gravity won't transition the
    // top-row block to 'falling' (which would mask the top-out condition).
    // Alternate two distinct colors so no vertical 3-run forms.
    for (let r = 0; r < e.cfg.rows; r++) {
      e.grid.set(r, 1, mkBlock(r % 2 === 0 ? 'red' : 'blue'));
    }
    e.resume();
    let goReported = false;
    e.events.on((ev) => {
      if (ev.type === 'game.over') goReported = true;
    });
    e.tick(1);
    expect(e.gameOver).toBe(true);
    expect(goReported).toBe(true);
  });

  it('paused engine does not advance', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    const offsetBefore = e.grid.riseOffset;
    e.pause();
    for (let i = 0; i < 50; i++) e.tick(100);
    expect(e.grid.riseOffset).toBe(offsetBefore);
  });

  it('performRiseStep can trigger top-out', () => {
    const e = new GameEngine({ rngSeed: 12345, initialStackHeight: 5 });
    // Fill enough rows so that a single rise step pushes content into row 0.
    for (let r = 1; r < e.cfg.rows; r++) {
      for (let c = 0; c < e.cfg.cols; c++) {
        if (e.grid.get(r, c) === null) e.grid.set(r, c, mkBlock('red'));
      }
    }
    // Row 1 currently has idle blocks; after a rise step they migrate to row 0.
    e.performRiseStep();
    expect(e.gameOver).toBe(true);
  });
});
