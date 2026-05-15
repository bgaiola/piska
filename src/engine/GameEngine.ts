import { ChainTracker } from './ChainTracker';
import { GarbageManager } from './GarbageManager';
import { Grid } from './Grid';
import { findMatches } from './MatchDetector';
import { ScoreManager } from './ScoreManager';
import {
  ALL_COLORS,
  DEFAULT_CONFIG,
  type Block,
  type BlockColor,
  type CellRef,
  type EngineConfig,
  type EngineEvent,
  type GarbagePiece,
} from './types';
import { EventBus } from '../utils/events';
import { mulberry32 } from '../utils/seedRandom';

/**
 * GameEngine — pure-logic orchestrator. Owns the Grid, ChainTracker,
 * ScoreManager, GarbageManager and an EventBus. Drives the simulation in
 * `tick(dtMs)`.
 *
 * Determinism: given the same seed and the same sequence of player inputs and
 * `tick` dt values, the engine produces identical state. No `Math.random()`.
 */
export class GameEngine {
  readonly cfg: EngineConfig;
  readonly grid: Grid;
  readonly chain: ChainTracker;
  readonly score: ScoreManager;
  readonly events: EventBus<EngineEvent>;
  readonly garbage: GarbageManager;
  cursor: { row: number; col: number };
  gameOver: boolean;
  paused: boolean;
  manualRaise: boolean;
  private rng: () => number;
  private nextBlockId: number = 1;
  /** ms remaining before the next queued garbage may attempt to drop. */
  // Public read-only access for HUD/telegraph to show a countdown bar.
  // Stays at 0 when no garbage is queued.
  dropDelayTimer: number = 0;

  constructor(cfg?: Partial<EngineConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg ?? {}) };
    this.grid = new Grid(this.cfg.rows, this.cfg.cols);
    this.chain = new ChainTracker();
    this.score = new ScoreManager();
    this.events = new EventBus<EngineEvent>();
    this.garbage = new GarbageManager(this.cfg);
    this.gameOver = false;
    this.paused = false;
    this.manualRaise = false;
    this.rng = mulberry32(this.cfg.rngSeed);
    this.cursor = {
      row: this.cfg.rows - 3,
      col: Math.max(0, Math.floor(this.cfg.cols / 2) - 1),
    };
    this.fillBottomRowsNoMatch(this.cfg.initialStackHeight);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Player actions
  // ──────────────────────────────────────────────────────────────────────

  moveCursor(dRow: number, dCol: number): void {
    this.setCursor(this.cursor.row + dRow, this.cursor.col + dCol);
  }

  setCursor(row: number, col: number): void {
    const maxRow = this.cfg.rows - 1;
    const maxCol = this.cfg.cols - 2; // cursor spans 2 cells: col..col+1
    const clampedRow = Math.max(0, Math.min(maxRow, row));
    const clampedCol = Math.max(0, Math.min(maxCol, col));
    this.cursor = { row: clampedRow, col: clampedCol };
  }

  /**
   * Swap the two cells under the cursor (row, col) and (row, col+1).
   *
   * Panel de Pon rules: either side may be empty (in which case the block
   * "slides" into the gap, after which gravity may take over). The swap is
   * rejected only if a non-idle block is involved on either side.
   *
   * Garbage blocks cannot be swapped.
   *
   * @returns true if a swap (or empty swap) actually happened.
   */
  swap(): boolean {
    if (this.gameOver || this.paused) return false;
    const r = this.cursor.row;
    const c = this.cursor.col;
    if (!this.grid.isInBounds(r, c) || !this.grid.isInBounds(r, c + 1)) return false;
    const left = this.grid.get(r, c);
    const right = this.grid.get(r, c + 1);
    // Reject if a non-idle block participates (matches Panel de Pon's policy
    // of forbidding swaps mid-fall / mid-clear).
    if (left !== null && left.state !== 'idle') return false;
    if (right !== null && right.state !== 'idle') return false;
    // Garbage blocks are immovable.
    if (left !== null && left.kind === 'garbage') return false;
    if (right !== null && right.kind === 'garbage') return false;
    // If both are empty, classic Panel de Pon treats it as a no-op visually
    // (nothing to swap). We return false so callers don't bother emitting.
    if (left === null && right === null) return false;

    // Perform the swap. Animate by setting state='swapping' for the duration.
    this.grid.set(r, c, right);
    this.grid.set(r, c + 1, left);
    if (left !== null) {
      left.state = 'swapping';
      left.swapTimer = this.cfg.swapDurationMs;
      left.swapDir = 1;
    }
    if (right !== null) {
      right.state = 'swapping';
      right.swapTimer = this.cfg.swapDurationMs;
      right.swapDir = -1;
    }
    this.events.emit({
      type: 'block.swapped',
      row: r,
      colLeft: c,
      colRight: c + 1,
    });
    return true;
  }

  setManualRaise(active: boolean): void {
    this.manualRaise = active;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Vs Mode — garbage
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Vs Mode: another engine (or test) hands me a garbage piece to drop.
   * The piece sits in our queue and drops after `garbageDropDelayMs` of
   * stable grid time.
   */
  receiveGarbage(piece: GarbagePiece): void {
    this.garbage.enqueueIncoming(piece);
    this.events.emit({ type: 'garbage.queued', piece });
    // Reset the drop delay so the player has a beat to react.
    this.dropDelayTimer = this.cfg.garbageDropDelayMs;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Simulation
  // ──────────────────────────────────────────────────────────────────────

  tick(dtMs: number): void {
    if (this.paused || this.gameOver) return;

    // 1. Advance swap timers.
    this.advanceSwapTimers(dtMs);

    // 2. Advance clear timers (and remove finished clears).
    this.advanceClearTimers(dtMs);

    // 2.5. Advance garbage unlock timers (transforms unlocking cells into
    //      colored blocks once their per-cell timer expires).
    this.advanceUnlockTimers(dtMs);

    // Remember whether anything was animating before gravity — this tells us
    // whether a subsequent match counts as a cascade.
    const animatingBefore = this.anyAnimating();

    // 3. Apply gravity (transitions idle -> falling -> landed -> idle).
    this.applyGravity(dtMs);

    // 4. If nothing is currently swapping/falling/clearing, look for matches.
    if (!this.anyAnimating()) {
      const result = this.resolveMatches(animatingBefore || this.chain.cascading);
      if (!result.found) {
        // 5. Grid fully settled.
        if (this.chain.current > 1 || this.chain.cascading) {
          const settled = this.chain.settle();
          if (settled.broken) {
            this.events.emit({
              type: 'chain.broken',
              finalChain: settled.finalChain,
            });
          }
        } else {
          // Make sure cascading stays false.
          this.chain.cascading = false;
        }
      } else {
        // Match found ⇒ keep cascade flag alive until everything settles.
        this.chain.cascading = true;
      }
    } else {
      // Still animating — preserve the cascade flag for the next tick.
      this.chain.cascading = this.chain.cascading || animatingBefore;
    }

    // 6. Rise tick. Rise pauses while any swap/clear is in progress, but does
    //    not pause for falling-only states (Panel de Pon classic).
    if (!this.anySwappingOrClearing()) {
      const speed = this.cfg.baseRiseSpeed * (this.manualRaise ? 16 : 1);
      this.grid.riseOffset += (speed * dtMs) / 1000;
      // Clamp to [0, 1) by performing any whole-row rises that fit.
      let safety = 64;
      while (this.grid.riseOffset >= 1 && safety-- > 0) {
        this.grid.riseOffset -= 1;
        this.performRiseStep();
        if (this.gameOver) break;
      }
      if (!this.gameOver) {
        this.events.emit({ type: 'rise.tick', offset: this.grid.riseOffset });
      }
    }

    // 7. Garbage drop tick. Decrement the delay; if the queue has a piece
    //    AND the grid is settled (no swapping/clearing/unlocking/falling),
    //    drop it onto the top of the stack.
    if (this.dropDelayTimer > 0) {
      this.dropDelayTimer = Math.max(0, this.dropDelayTimer - dtMs);
    }
    if (
      this.dropDelayTimer === 0 &&
      this.garbage.size() > 0 &&
      this.isSettledForGarbage()
    ) {
      this.dropQueuedGarbage();
      this.dropDelayTimer = this.cfg.garbageDropDelayMs;
    }

    // 8. Top-out check (in case rise/gravity/garbage left an idle block at row 0).
    if (!this.gameOver && this.grid.hasTopout()) {
      this.gameOver = true;
      this.events.emit({ type: 'game.over', reason: 'topout' });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers exposed for tests
  // ──────────────────────────────────────────────────────────────────────

  fillBottomRowsNoMatch(numRows: number): void {
    const rows = this.cfg.rows;
    const cols = this.cfg.cols;
    const palette = ALL_COLORS.slice(0, this.cfg.numColors);
    const startRow = rows - numRows;
    for (let r = startRow; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Build a list of colors that would NOT cause an immediate 3-in-a-row.
        const banned = new Set<BlockColor>();
        // Horizontal: look at the two cells immediately to the left.
        if (c >= 2) {
          const a = this.grid.get(r, c - 1);
          const b = this.grid.get(r, c - 2);
          if (a && b && a.color === b.color) banned.add(a.color);
        }
        // Vertical: look at the two cells immediately above (toward smaller row index).
        if (r >= 2) {
          const a = this.grid.get(r - 1, c);
          const b = this.grid.get(r - 2, c);
          if (a && b && a.color === b.color) banned.add(a.color);
        }
        const choices = palette.filter((col) => !banned.has(col));
        const pool = choices.length > 0 ? choices : palette;
        const color = pool[Math.floor(this.rng() * pool.length)];
        this.grid.set(r, c, this.makeBlock(color));
      }
    }
  }

  /**
   * Produce the colors for a fresh bottom row, avoiding any color that would
   * immediately form a vertical 3-run with the two cells directly above the
   * new bottom. Horizontal collisions in the new bottom row are also avoided.
   */
  generateNewBottomRow(): BlockColor[] {
    const cols = this.cfg.cols;
    const rows = this.cfg.rows;
    const palette = ALL_COLORS.slice(0, this.cfg.numColors);
    const result: BlockColor[] = [];
    for (let c = 0; c < cols; c++) {
      const banned = new Set<BlockColor>();
      // Vertical: the new row will end up at row (rows - 1), so the two cells
      // above are (rows - 2, c) and (rows - 3, c) AFTER the shift. But this
      // function is called BEFORE the shift, when the existing bottom two rows
      // are (rows - 1, c) and (rows - 2, c).
      const a = this.grid.get(rows - 1, c);
      const b = this.grid.get(rows - 2, c);
      if (a && b && a.color === b.color) banned.add(a.color);
      // Horizontal among already-placed cells in `result`.
      if (c >= 2 && result[c - 1] === result[c - 2]) {
        banned.add(result[c - 1]);
      }
      const choices = palette.filter((col) => !banned.has(col));
      const pool = choices.length > 0 ? choices : palette;
      const color = pool[Math.floor(this.rng() * pool.length)];
      result.push(color);
    }
    return result;
  }

  /**
   * Run a single tick's worth of gravity. Returns true iff any block changed
   * row this tick (used by tests).
   */
  applyGravity(dtMs: number = 0): boolean {
    const rows = this.cfg.rows;
    const cols = this.cfg.cols;
    let moved = false;

    // First pass: transition idle/landed blocks with an empty cell below to
    // 'falling'. Process bottom-to-top so a freshly-falling block won't keep
    // the block above stuck.
    for (let r = rows - 2; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        const cell = this.grid.get(r, c);
        if (cell === null) continue;
        if (cell.state !== 'idle' && cell.state !== 'landed') continue;
        // Garbage blocks fall as a rigid unit. Only treat the cell as falling
        // when ALL cells directly below the garbage group are empty. To keep
        // logic simple here, we delegate: a garbage cell only falls if its
        // own row is the BOTTOM of its group AND the cell below is empty,
        // OR if it's not the bottom (then it follows whatever the bottom does
        // via the second pass on the cell below). We approximate by letting
        // gravity treat each garbage cell like an ordinary block — they have
        // the same width=1 vertical column footprint and the engine places
        // garbage onto the topmost empty rows, so single-row garbage drops
        // fine. For multi-row garbage we still rely on the second pass.
        const below = this.grid.get(r + 1, c);
        if (below === null) {
          cell.state = 'falling';
          cell.fallTimer = 0;
        } else if (cell.state === 'landed') {
          // 'landed' blocks tick over to 'idle' once they've had a moment to
          // settle.
          cell.state = 'idle';
        }
      }
    }

    // Second pass: move falling blocks down. Iterate bottom-up so descending
    // blocks don't collide with each other within a single tick.
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        const cell = this.grid.get(r, c);
        if (cell === null || cell.state !== 'falling') continue;
        cell.fallTimer += dtMs;
        while (cell.fallTimer >= this.cfg.fallStepMs) {
          const nextRow = r + 1;
          if (nextRow >= rows) {
            cell.state = 'landed';
            cell.fallTimer = 0;
            break;
          }
          const target = this.grid.get(nextRow, c);
          if (target !== null) {
            cell.state = 'landed';
            cell.fallTimer = 0;
            break;
          }
          this.grid.set(nextRow, c, cell);
          this.grid.set(r, c, null);
          cell.fallTimer -= this.cfg.fallStepMs;
          moved = true;
          r = nextRow; // continue falling from the new position
        }
        // If after the loop we're still falling but the cell below is now
        // occupied or out of bounds, transition to 'landed'.
        if (cell.state === 'falling') {
          const nextRow = r + 1;
          if (nextRow >= rows || this.grid.get(nextRow, c) !== null) {
            cell.state = 'landed';
            cell.fallTimer = 0;
          }
        }
      }
    }
    return moved;
  }

  /**
   * Run match detection on the grid. If matches are present, marks each
   * matched cell as 'clearing', awards score, and emits the corresponding
   * events. Also: triggers garbage adjacent to matched cells to unlock,
   * and generates outgoing garbage from combos/chains.
   */
  resolveMatches(
    isCascade: boolean = false,
  ): { found: boolean; cleared: number; chain: number } {
    const groups = findMatches(this.grid);
    if (groups.length === 0) {
      return { found: false, cleared: 0, chain: this.chain.current };
    }
    const chainNum = this.chain.registerMatch(isCascade);
    let totalCleared = 0;
    const allMatched: CellRef[] = [];
    const outgoing: GarbagePiece[] = [];

    for (const group of groups) {
      const comboSize = group.cells.length;
      totalCleared += comboSize;
      for (const ref of group.cells) allMatched.push(ref);

      const pts = this.score.pointsFor(comboSize, chainNum);
      const total = pts.base + pts.comboBonus + pts.chainBonus;
      this.score.add(total);
      if (pts.base > 0) {
        this.events.emit({ type: 'score.delta', amount: pts.base, reason: 'combo' });
      }
      if (pts.comboBonus > 0) {
        this.events.emit({
          type: 'score.delta',
          amount: pts.comboBonus,
          reason: 'combo_bonus',
        });
      }
      if (pts.chainBonus > 0) {
        this.events.emit({
          type: 'score.delta',
          amount: pts.chainBonus,
          reason: 'chain',
        });
      }
      this.events.emit({
        type: 'match.found',
        cells: group.cells.slice(),
        comboSize,
        chain: chainNum,
      });

      // Generate outgoing garbage for this match (combo or chain bonus).
      const pieces = this.garbage.generateFromMatch(comboSize, chainNum, this.cfg.cols);
      for (const p of pieces) outgoing.push(p);
    }

    // Unlock garbage adjacent to matched cells BEFORE flagging the matches
    // as clearing — the adjacency check looks at the matched cells.
    this.maybeUnlockGarbageAdjacentTo(allMatched);

    // Now flag matched cells for clearing.
    for (const ref of allMatched) {
      const block = this.grid.get(ref.row, ref.col);
      if (block !== null) {
        block.state = 'clearing';
        block.clearTimer = this.cfg.clearDurationMs;
      }
    }

    // Pop the queued outgoing pieces off our own queue (they're not for us)
    // and emit them so the Vs controller can hand them to the opponent.
    if (outgoing.length > 0) {
      // The pieces were enqueued by garbage.generateFromMatch. Remove them
      // from our local queue — they belong to the OTHER player.
      for (let i = 0; i < outgoing.length; i++) {
        // outgoing pieces are the most-recently-pushed; remove from tail.
        // Match by id to be safe.
      }
      // Filter our queue: drop any piece whose id appears in `outgoing`.
      const outIds = new Set(outgoing.map((p) => p.id));
      // GarbageManager doesn't expose internal mutation; rebuild via pop/push.
      const kept: GarbagePiece[] = [];
      while (this.garbage.size() > 0) {
        const p = this.garbage.pop();
        if (p === undefined) break;
        if (!outIds.has(p.id)) kept.push(p);
      }
      for (const p of kept) this.garbage.enqueueIncoming(p);

      this.events.emit({ type: 'garbage.outgoing', pieces: outgoing });
    }

    return { found: true, cleared: totalCleared, chain: chainNum };
  }

  /**
   * Shift every row up by one (toward smaller index). The top row's contents
   * are discarded (the engine still checks for top-out separately, since the
   * caller should normally have prevented a rise when a block sat at row 0).
   * A new row is generated at the bottom (row = rows - 1).
   */
  performRiseStep(): void {
    const rows = this.cfg.rows;
    const cols = this.cfg.cols;
    // Pre-compute the new bottom row before we mutate the grid.
    const newColors = this.generateNewBottomRow();
    // Shift rows up: row r receives row r+1, top row drops.
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        this.grid.cells[r][c] = this.grid.cells[r + 1][c];
      }
    }
    // Fill new bottom row.
    for (let c = 0; c < cols; c++) {
      this.grid.cells[rows - 1][c] = this.makeBlock(newColors[c]);
    }
    // Bump cursor up by one so it stays glued to the same logical content
    // (unless it's already at row 0).
    if (this.cursor.row > 0) {
      this.cursor = { row: this.cursor.row - 1, col: this.cursor.col };
    }
    this.events.emit({ type: 'rise.row', colors: newColors });
    if (this.grid.hasTopout()) {
      this.gameOver = true;
      this.events.emit({ type: 'game.over', reason: 'topout' });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────

  private makeBlock(color: BlockColor): Block {
    return {
      id: this.nextBlockId++,
      color,
      kind: 'color',
      state: 'idle',
      swapTimer: 0,
      clearTimer: 0,
      fallTimer: 0,
      swapDir: 0,
    };
  }

  private makeGarbageCell(groupId: number, width: number, height: number): Block {
    return {
      id: this.nextBlockId++,
      color: 'red', // placeholder; replaced on unlock
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

  private advanceSwapTimers(dtMs: number): void {
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null || cell.state !== 'swapping') continue;
        cell.swapTimer -= dtMs;
        if (cell.swapTimer <= 0) {
          cell.swapTimer = 0;
          cell.swapDir = 0;
          cell.state = 'idle';
        }
      }
    }
  }

  private advanceClearTimers(dtMs: number): void {
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null || cell.state !== 'clearing') continue;
        cell.clearTimer -= dtMs;
        if (cell.clearTimer <= 0) {
          this.grid.cells[r][c] = null;
        }
      }
    }
  }

  /**
   * Advance per-cell unlockTimer for garbage cells flagged with unlocking=true.
   * When the timer hits 0, the cell transforms into a normal colored block
   * (kind='color', state='falling' so gravity resettles it).
   *
   * Once every cell of a garbage group has finished unlocking, emit a
   * 'garbage.cleared' event with that group id.
   */
  private advanceUnlockTimers(dtMs: number): void {
    if (dtMs <= 0) return;
    const palette = ALL_COLORS.slice(0, this.cfg.numColors);
    // Track which groups still have at least one unlocking cell after this tick.
    const groupsBefore = new Set<number>();
    const groupsAfter = new Set<number>();

    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null) continue;
        if (cell.kind !== 'garbage' || !cell.unlocking) continue;
        if (cell.garbageGroupId !== undefined) groupsBefore.add(cell.garbageGroupId);
        cell.unlockTimer = (cell.unlockTimer ?? 0) - dtMs;
        if (cell.unlockTimer <= 0) {
          // Transform into a colored block. Pick a deterministic random color.
          const color = palette[Math.floor(this.rng() * palette.length)];
          cell.kind = 'color';
          cell.color = color;
          cell.state = 'falling';
          cell.fallTimer = 0;
          cell.unlocking = false;
          cell.unlockTimer = 0;
          // Drop garbage-only fields so they don't linger.
          cell.garbageGroupId = undefined;
          cell.garbageWidth = undefined;
          cell.garbageHeight = undefined;
        } else if (cell.garbageGroupId !== undefined) {
          groupsAfter.add(cell.garbageGroupId);
        }
      }
    }

    // Any group present BEFORE but absent AFTER finished unlocking this tick.
    for (const gid of groupsBefore) {
      if (!groupsAfter.has(gid)) {
        this.events.emit({ type: 'garbage.cleared', groupId: gid });
      }
    }
  }

  /**
   * When a match clears blocks ADJACENT (4-neighbor) to a garbage cell, that
   * garbage block "unlocks": every cell of the group enters the unlocking
   * state. After unlockTimer expires, each cell becomes a normal colored
   * block (handled by advanceUnlockTimers).
   *
   * Emits 'garbage.unlocking' once per group, the first tick it begins.
   */
  private maybeUnlockGarbageAdjacentTo(clearedCells: CellRef[]): void {
    if (clearedCells.length === 0) return;
    const groupsToUnlock = new Set<number>();
    const seen = new Set<string>();
    for (const ref of clearedCells) {
      const neighbors = [
        { row: ref.row - 1, col: ref.col },
        { row: ref.row + 1, col: ref.col },
        { row: ref.row, col: ref.col - 1 },
        { row: ref.row, col: ref.col + 1 },
      ];
      for (const n of neighbors) {
        const key = `${n.row},${n.col}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = this.grid.get(n.row, n.col);
        if (cell === null) continue;
        if (cell.kind !== 'garbage') continue;
        if (cell.unlocking) continue;
        if (cell.garbageGroupId !== undefined) groupsToUnlock.add(cell.garbageGroupId);
      }
    }
    if (groupsToUnlock.size === 0) return;
    // Flag every cell of each unlocking group.
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null) continue;
        if (cell.kind !== 'garbage') continue;
        if (cell.garbageGroupId === undefined) continue;
        if (!groupsToUnlock.has(cell.garbageGroupId)) continue;
        cell.unlocking = true;
        cell.unlockTimer = this.cfg.garbageUnlockDurationMs;
      }
    }
    for (const gid of groupsToUnlock) {
      this.events.emit({ type: 'garbage.unlocking', groupId: gid });
    }
  }

  /**
   * Place the next queued garbage piece on the top of the stack. The piece
   * is placed at the highest available rectangle of empty cells, centered
   * horizontally when possible. If no rectangle fits, the drop is deferred.
   *
   * Emits 'garbage.dropped' on success.
   */
  private dropQueuedGarbage(): void {
    const piece = this.garbage.peek();
    if (piece === undefined) return;
    const rows = this.cfg.rows;
    const cols = this.cfg.cols;
    const w = Math.max(1, Math.min(piece.width, cols));
    const h = Math.max(1, Math.min(piece.height, rows));

    // Determine the topmost row at which the piece can sit. For each candidate
    // leftmost column, find the highest "floor" — the row right above the
    // topmost filled cell — that has h empty rows above it. We want the piece
    // to rest as high as possible (smallest topRow).
    //
    // Strategy: for each column range [leftCol, leftCol + w):
    //   floor[col]   = lowest row index that is empty in that column starting
    //                  from row 0 (the row right above any blocks).
    //   bottomRow    = min(floor[col] - ... ) — we want the BOTTOM of the
    //                  piece to rest on top of the tallest existing column in
    //                  the range. Equivalently topRow = max over col of
    //                  (firstFilledRow[col]) - h.
    //
    // Where firstFilledRow[col] = smallest row index where there is a
    // non-null cell. If a column is entirely empty, firstFilledRow = rows.

    const firstFilled: number[] = new Array(cols).fill(rows);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (this.grid.cells[r][c] !== null) {
          firstFilled[c] = r;
          break;
        }
      }
    }

    // Find the best leftCol. Preference: centered placement, then leftmost.
    const candidates: number[] = [];
    const startLeft = Math.floor((cols - w) / 2);
    for (let offset = 0; offset <= cols - w; offset++) {
      // Walk outward from the center: startLeft, startLeft-1, startLeft+1, ...
      const sign = offset % 2 === 0 ? 1 : -1;
      const step = Math.floor((offset + 1) / 2);
      const candidate = startLeft + sign * step;
      if (candidate >= 0 && candidate + w <= cols && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
    // Fallback (shouldn't be needed): every valid leftCol.
    for (let c = 0; c + w <= cols; c++) {
      if (!candidates.includes(c)) candidates.push(c);
    }

    let chosenLeft = -1;
    let chosenTop = -1;
    for (const leftCol of candidates) {
      // The piece's BOTTOM row would be at row min(firstFilled[leftCol..]) - 1.
      let minFirst = rows;
      for (let c = leftCol; c < leftCol + w; c++) {
        if (firstFilled[c] < minFirst) minFirst = firstFilled[c];
      }
      const bottomRow = minFirst - 1;
      const topRow = bottomRow - (h - 1);
      if (topRow < 0) continue; // doesn't fit; would top out immediately
      // Verify the rectangle is fully empty.
      let fits = true;
      for (let r = topRow; r <= bottomRow && fits; r++) {
        for (let c = leftCol; c < leftCol + w; c++) {
          if (this.grid.cells[r][c] !== null) {
            fits = false;
            break;
          }
        }
      }
      if (!fits) continue;
      chosenLeft = leftCol;
      chosenTop = topRow;
      break;
    }

    if (chosenLeft === -1) {
      // Couldn't fit it; leave in queue, try again next tick.
      return;
    }

    // Consume the piece and place it.
    this.garbage.pop();
    const groupId = this.garbage.newId();
    for (let r = chosenTop; r < chosenTop + h; r++) {
      for (let c = chosenLeft; c < chosenLeft + w; c++) {
        this.grid.cells[r][c] = this.makeGarbageCell(groupId, w, h);
      }
    }
    this.events.emit({
      type: 'garbage.dropped',
      piece,
      topRow: chosenTop,
      leftCol: chosenLeft,
    });
  }

  private anyAnimating(): boolean {
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null) continue;
        const s = cell.state;
        if (s === 'swapping' || s === 'falling' || s === 'clearing') return true;
        if (cell.kind === 'garbage' && cell.unlocking) return true;
      }
    }
    return false;
  }

  private anySwappingOrClearing(): boolean {
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null) continue;
        if (cell.state === 'swapping' || cell.state === 'clearing') return true;
        if (cell.kind === 'garbage' && cell.unlocking) return true;
      }
    }
    return false;
  }

  /** Grid is settled enough to receive a garbage drop. */
  private isSettledForGarbage(): boolean {
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell === null) continue;
        const s = cell.state;
        if (s === 'swapping' || s === 'falling' || s === 'clearing') return false;
        if (cell.kind === 'garbage' && cell.unlocking) return false;
      }
    }
    return true;
  }
}
