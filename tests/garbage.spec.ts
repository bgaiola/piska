import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/engine/GameEngine';
import { GarbageManager } from '../src/engine/GarbageManager';
import { DEFAULT_CONFIG } from '../src/engine/types';
import type { Block, BlockColor, GarbagePiece } from '../src/engine/types';

// ─────────────────────────────────────────────────────────────────────────
// Helpers (mirror tests/engine.spec.ts style)
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

function mkGarbage(groupId: number, width: number, height: number): Block {
  return {
    id: nextId++,
    color: 'red',
    kind: 'garbage',
    state: 'idle',
    swapTimer: 0,
    clearTimer: 0,
    fallTimer: 0,
    swapDir: 0,
    garbageGroupId: groupId,
    garbageWidth: width,
    garbageHeight: height,
    unlocking: false,
    unlockTimer: 0,
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
// GarbageManager — sizing rules
// ─────────────────────────────────────────────────────────────────────────

describe('GarbageManager.generateFromMatch', () => {
  it('combo of 4 → 1x3 piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(4, 1, 6);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].width).toBe(3);
    expect(pieces[0].height).toBe(1);
  });

  it('combo of 5 → 1x4 piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(5, 1, 6);
    expect(pieces[0].width).toBe(4);
    expect(pieces[0].height).toBe(1);
  });

  it('combo of 6 → 1x5 piece (Tetris Attack-style gradual scaling)', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(6, 1, 6);
    expect(pieces[0].width).toBe(5);
    expect(pieces[0].height).toBe(1);
  });

  it('combo of 7+ → 1x6 piece (whole row, clamped to cols)', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(7, 1, 6);
    expect(pieces[0].width).toBe(6);
    expect(pieces[0].height).toBe(1);
  });

  it('combo of 3 with no chain → no piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    expect(gm.generateFromMatch(3, 1, 6)).toEqual([]);
  });

  it('chain of 2 → 1x3 piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(3, 2, 6);
    expect(pieces[0].width).toBe(3);
    expect(pieces[0].height).toBe(1);
  });

  it('chain of 3 → 1x4 piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(3, 3, 6);
    expect(pieces[0].width).toBe(4);
    expect(pieces[0].height).toBe(1);
  });

  it('chain of 5 → 1x6 piece (full row before stacking)', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(3, 5, 6);
    expect(pieces[0].width).toBe(6);
    expect(pieces[0].height).toBe(1);
  });

  it('chain of 6 → 6x2 piece (begins stacking rows)', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const pieces = gm.generateFromMatch(3, 6, 6);
    expect(pieces[0]).toMatchObject({ width: 6, height: 2 });
  });

  it('chain of 7+ → at least 6x3 piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    expect(gm.generateFromMatch(3, 7, 6)[0]).toMatchObject({ width: 6, height: 3 });
    expect(gm.generateFromMatch(3, 10, 6)[0].height).toBeGreaterThanOrEqual(3);
  });

  it('combo + chain both qualify → picks the BIGGER', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    // combo 4 → area 3, chain 6 → area 12 (6x2). Chain wins.
    const pieces = gm.generateFromMatch(4, 6, 6);
    expect(pieces[0].width * pieces[0].height).toBe(12);
  });

  it('does not enqueue beyond maxQueuedGarbage', () => {
    const cfg = { ...DEFAULT_CONFIG, maxQueuedGarbage: 2 };
    const gm = new GarbageManager(cfg);
    expect(gm.generateFromMatch(4, 1, 6)).toHaveLength(1);
    expect(gm.generateFromMatch(4, 1, 6)).toHaveLength(1);
    expect(gm.generateFromMatch(4, 1, 6)).toHaveLength(0);
    expect(gm.size()).toBe(2);
  });
});

describe('GarbageManager queue ops', () => {
  it('enqueueIncoming then pop returns the piece', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const piece: GarbagePiece = { id: 42, width: 3, height: 1 };
    gm.enqueueIncoming(piece);
    expect(gm.size()).toBe(1);
    expect(gm.peek()).toBe(piece);
    expect(gm.pop()).toBe(piece);
    expect(gm.size()).toBe(0);
  });

  it('clear empties the queue', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    gm.enqueueIncoming({ id: 1, width: 3, height: 1 });
    gm.enqueueIncoming({ id: 2, width: 4, height: 1 });
    gm.clear();
    expect(gm.size()).toBe(0);
  });

  it('newId produces increasing values', () => {
    const gm = new GarbageManager({ ...DEFAULT_CONFIG });
    const a = gm.newId();
    const b = gm.newId();
    expect(b).toBeGreaterThan(a);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GameEngine.receiveGarbage
// ─────────────────────────────────────────────────────────────────────────

describe('GameEngine.receiveGarbage', () => {
  it('enqueues and emits garbage.queued', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    const events: string[] = [];
    e.events.on((ev) => events.push(ev.type));
    const piece: GarbagePiece = { id: 7, width: 3, height: 1 };
    e.receiveGarbage(piece);
    expect(e.garbage.size()).toBe(1);
    expect(events).toContain('garbage.queued');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Garbage drop placement
// ─────────────────────────────────────────────────────────────────────────

describe('garbage drop placement', () => {
  it('after garbageDropDelayMs of stable grid, garbage drops on top of the stack', () => {
    const e = new GameEngine({ rngSeed: 12345, garbageDropDelayMs: 100 });
    e.pause(); // freeze rise so the test can reason about positions
    clearGrid(e);
    // Build a simple two-row floor across all columns with alternating colors
    // so no match forms.
    const rows = e.cfg.rows;
    const cols = e.cfg.cols;
    for (let c = 0; c < cols; c++) {
      e.grid.set(rows - 1, c, mkBlock(c % 2 === 0 ? 'red' : 'blue'));
      e.grid.set(rows - 2, c, mkBlock(c % 2 === 0 ? 'blue' : 'red'));
    }
    e.resume();

    e.receiveGarbage({ id: 1, width: 3, height: 1 });

    const events: { type: string; topRow?: number; leftCol?: number }[] = [];
    e.events.on((ev) => {
      if (ev.type === 'garbage.dropped') {
        events.push({ type: ev.type, topRow: ev.topRow, leftCol: ev.leftCol });
      }
    });

    // Tick past the drop delay.
    for (let i = 0; i < 20; i++) e.tick(10);

    expect(events.length).toBe(1);
    const drop = events[0];
    // The garbage should sit immediately above the existing stack (row rows-3).
    expect(drop.topRow).toBe(rows - 3);
    expect(drop.leftCol).toBeGreaterThanOrEqual(0);
    // Verify the cells are garbage with a shared groupId.
    const cells = [
      e.grid.get(drop.topRow!, drop.leftCol!),
      e.grid.get(drop.topRow!, drop.leftCol! + 1),
      e.grid.get(drop.topRow!, drop.leftCol! + 2),
    ];
    for (const cell of cells) {
      expect(cell).not.toBeNull();
      expect(cell!.kind).toBe('garbage');
    }
    expect(cells[0]!.garbageGroupId).toBeDefined();
    expect(cells[1]!.garbageGroupId).toBe(cells[0]!.garbageGroupId);
    expect(cells[2]!.garbageGroupId).toBe(cells[0]!.garbageGroupId);
  });

  it('garbage drop is delayed while the grid still has clearing/falling blocks', () => {
    const e = new GameEngine({ rngSeed: 12345, garbageDropDelayMs: 0 });
    e.pause();
    clearGrid(e);
    const rows = e.cfg.rows;
    // Put a single clearing block in the middle of the grid.
    const blk = mkBlock('red');
    blk.state = 'clearing';
    blk.clearTimer = 1000;
    e.grid.set(rows - 1, 0, blk);
    e.resume();

    e.receiveGarbage({ id: 1, width: 3, height: 1 });

    let dropped = 0;
    e.events.on((ev) => {
      if (ev.type === 'garbage.dropped') dropped += 1;
    });
    // Tick a few times; the clearing block keeps the grid "busy".
    for (let i = 0; i < 5; i++) e.tick(10);
    expect(dropped).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Garbage unlocking
// ─────────────────────────────────────────────────────────────────────────

describe('garbage unlocking', () => {
  it('garbage unlocks when a colored match clears adjacent to it', () => {
    const e = new GameEngine({
      rngSeed: 12345,
      clearDurationMs: 30,
      garbageUnlockDurationMs: 40,
    });
    e.pause();
    clearGrid(e);
    const rows = e.cfg.rows;
    // Place a 1x1 garbage cell at (rows-1, 0) and three colored 'red' blocks
    // immediately to its right.
    const gid = e.garbage.newId();
    const gcell = mkGarbage(gid, 1, 1);
    e.grid.set(rows - 1, 0, gcell);
    e.grid.set(rows - 1, 1, mkBlock('red'));
    e.grid.set(rows - 1, 2, mkBlock('red'));
    e.grid.set(rows - 1, 3, mkBlock('red'));
    e.resume();

    const seen: string[] = [];
    e.events.on((ev) => seen.push(ev.type));

    // Tick until the unlock completes.
    for (let i = 0; i < 60; i++) e.tick(5);

    expect(seen).toContain('garbage.unlocking');
    expect(seen).toContain('garbage.cleared');

    // The previously-garbage cell is now a normal colored block (or has been
    // removed by gravity/match — but at minimum, it should NOT still be a
    // garbage cell with state='idle').
    // Walk the grid: there should be no garbage cells left from group `gid`.
    let leftover = 0;
    for (let r = 0; r < e.cfg.rows; r++) {
      for (let c = 0; c < e.cfg.cols; c++) {
        const cell = e.grid.cells[r][c];
        if (cell && cell.kind === 'garbage' && cell.garbageGroupId === gid) {
          leftover += 1;
        }
      }
    }
    expect(leftover).toBe(0);
  });

  it('multi-cell garbage: all cells unlock together', () => {
    const e = new GameEngine({
      rngSeed: 12345,
      clearDurationMs: 30,
      garbageUnlockDurationMs: 40,
    });
    e.pause();
    clearGrid(e);
    const rows = e.cfg.rows;
    const cols = e.cfg.cols;
    // 3-wide garbage occupying (rows-2, cols-3..cols-1).
    const gid = e.garbage.newId();
    for (let c = cols - 3; c < cols; c++) {
      e.grid.set(rows - 2, c, mkGarbage(gid, 3, 1));
    }
    // Colored row directly below.
    e.grid.set(rows - 1, 0, mkBlock('blue'));
    e.grid.set(rows - 1, 1, mkBlock('blue'));
    e.grid.set(rows - 1, 2, mkBlock('blue'));
    // Anchor the rest of row rows-1 so the garbage doesn't fall.
    for (let c = 3; c < cols; c++) {
      e.grid.set(rows - 1, c, mkBlock('yellow'));
    }
    // The blue trio is at columns 0..2, the garbage at cols-3..cols-1. They
    // touch when cols-3 == 3 (i.e., cols=6), at cell (rows-1, 2) ↔ (rows-2, 3).
    // Vertically adjacent: blue at (rows-1, 3) — but we placed yellow there.
    // We need adjacency between the blue match cells and a garbage cell.
    //
    // Let's instead place a vertical blue trio at column 3 (rows-1, rows-2,
    // rows-3) — and the garbage at row rows-4, cols 0..2. Adjacency: garbage
    // (rows-4, 2) is right above blue (rows-3, 2)? No, we said blue at col 3.
    // Easier to redo it: clear and place blues adjacent to the garbage.
    clearGrid(e);
    const gid2 = e.garbage.newId();
    for (let c = 0; c < 3; c++) {
      e.grid.set(rows - 2, c, mkGarbage(gid2, 3, 1));
    }
    // Vertical blue trio at column 1, rows rows-1..rows-3, then the garbage
    // at (rows-2, 1) would overlap — that's invalid. Make the blue match
    // horizontal at row rows-1, cols 0..2, which is directly below the
    // garbage at row rows-2.
    e.grid.set(rows - 1, 0, mkBlock('blue'));
    e.grid.set(rows - 1, 1, mkBlock('blue'));
    e.grid.set(rows - 1, 2, mkBlock('blue'));
    e.resume();

    const unlockedGroups: number[] = [];
    e.events.on((ev) => {
      if (ev.type === 'garbage.unlocking') unlockedGroups.push(ev.groupId);
    });

    for (let i = 0; i < 60; i++) e.tick(5);

    expect(unlockedGroups).toContain(gid2);
    // No garbage cells from gid2 remain.
    let leftover = 0;
    for (let r = 0; r < e.cfg.rows; r++) {
      for (let c = 0; c < e.cfg.cols; c++) {
        const cell = e.grid.cells[r][c];
        if (cell && cell.kind === 'garbage' && cell.garbageGroupId === gid2) {
          leftover += 1;
        }
      }
    }
    expect(leftover).toBe(0);
  });

  it('non-adjacent match does NOT unlock garbage', () => {
    const e = new GameEngine({
      rngSeed: 12345,
      clearDurationMs: 30,
      garbageUnlockDurationMs: 40,
    });
    e.pause();
    clearGrid(e);
    const rows = e.cfg.rows;
    // Garbage at top of the play area.
    const gid = e.garbage.newId();
    e.grid.set(2, 0, mkGarbage(gid, 1, 1));
    // Distant match at the bottom.
    e.grid.set(rows - 1, 0, mkBlock('red'));
    e.grid.set(rows - 1, 1, mkBlock('red'));
    e.grid.set(rows - 1, 2, mkBlock('red'));
    e.resume();

    let unlocked = false;
    e.events.on((ev) => {
      if (ev.type === 'garbage.unlocking') unlocked = true;
    });
    for (let i = 0; i < 30; i++) e.tick(5);

    // The garbage at (2, 0) is many rows away; it shouldn't be flagged for unlock.
    // But after the match clears, the garbage will fall under gravity — that
    // alone is fine, it just shouldn't be unlocking.
    expect(unlocked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Top-out via garbage
// ─────────────────────────────────────────────────────────────────────────

describe('top-out via garbage', () => {
  it('triggers when a garbage cell reaches row 0 idle', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    e.pause();
    // Fully pack column 2 so the top cell can't transition to 'falling'.
    // Top cell is garbage (kind='garbage'). The rest are colored fillers in
    // alternating colors to avoid forming a vertical 3-run.
    e.grid.set(0, 2, mkGarbage(99, 1, 1));
    for (let r = 1; r < e.cfg.rows; r++) {
      e.grid.set(r, 2, mkBlock(r % 2 === 0 ? 'red' : 'blue'));
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
});

// ─────────────────────────────────────────────────────────────────────────
// Outgoing garbage event
// ─────────────────────────────────────────────────────────────────────────

describe('garbage.outgoing event', () => {
  it('emits garbage.outgoing when a combo of 4 clears', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    e.pause();
    clearGrid(e);
    const rows = e.cfg.rows;
    // 4-in-a-row horizontal red trio.
    e.grid.set(rows - 1, 0, mkBlock('red'));
    e.grid.set(rows - 1, 1, mkBlock('red'));
    e.grid.set(rows - 1, 2, mkBlock('red'));
    e.grid.set(rows - 1, 3, mkBlock('red'));
    e.resume();

    const pieces: GarbagePiece[] = [];
    e.events.on((ev) => {
      if (ev.type === 'garbage.outgoing') {
        for (const p of ev.pieces) pieces.push(p);
      }
    });
    e.tick(1);

    expect(pieces.length).toBeGreaterThan(0);
    // The match was 4 cells → 1x3 piece.
    expect(pieces[0].width).toBe(3);
    expect(pieces[0].height).toBe(1);
  });

  it('outgoing pieces are NOT added to my own queue', () => {
    const e = new GameEngine({ rngSeed: 12345 });
    e.pause();
    clearGrid(e);
    const rows = e.cfg.rows;
    e.grid.set(rows - 1, 0, mkBlock('red'));
    e.grid.set(rows - 1, 1, mkBlock('red'));
    e.grid.set(rows - 1, 2, mkBlock('red'));
    e.grid.set(rows - 1, 3, mkBlock('red'));
    e.resume();
    e.tick(1);
    // No piece should be sitting in our own queue, since outgoing pieces
    // belong to the opponent.
    expect(e.garbage.size()).toBe(0);
  });
});
