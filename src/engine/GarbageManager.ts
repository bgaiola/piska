import type { EngineConfig, GarbagePiece } from './types';

/**
 * Generates garbage pieces from clears and manages their drop queue.
 *
 * Sizing rules (classic Panel de Pon, simplified):
 *   - combo of 4 cleared blocks → 1x3 garbage
 *   - combo of 5                → 1x4
 *   - combo of 6+               → 1x6 (whole row, clamped to cols)
 *   - chain of 2                → 1x4
 *   - chain of 3                → 1x6
 *   - chain of 4                → 2x6
 *   - chain of 5+               → 3x6 (clamped)
 *
 * When both combo and chain qualify in a single match event, the engine
 * picks the BIGGER piece (by total cell count). The smaller is discarded.
 */
export class GarbageManager {
  private queue: GarbagePiece[] = [];
  private nextId = 1;

  constructor(private cfg: EngineConfig) {}

  /**
   * Convert a single match event into 0..1 queued garbage pieces.
   *
   * Returns the array of pieces that were actually enqueued (length 0 or 1).
   * If the queue is already at the safety cap, nothing is enqueued.
   */
  generateFromMatch(comboSize: number, chain: number, cols: number): GarbagePiece[] {
    const comboPiece = this.pieceFromCombo(comboSize, cols);
    const chainPiece = this.pieceFromChain(chain, cols);

    // Pick the bigger of the two (by total area). Ties favour the chain piece.
    let chosen: { width: number; height: number } | null = null;
    if (comboPiece && chainPiece) {
      const cArea = comboPiece.width * comboPiece.height;
      const chArea = chainPiece.width * chainPiece.height;
      chosen = chArea >= cArea ? chainPiece : comboPiece;
    } else {
      chosen = comboPiece ?? chainPiece;
    }
    if (chosen === null) return [];

    if (this.queue.length >= this.cfg.maxQueuedGarbage) return [];

    const piece: GarbagePiece = {
      id: this.newId(),
      width: Math.min(chosen.width, cols),
      height: chosen.height,
    };
    this.queue.push(piece);
    return [piece];
  }

  /** Enqueue a piece that another engine sent over. */
  enqueueIncoming(piece: GarbagePiece): void {
    if (this.queue.length >= this.cfg.maxQueuedGarbage) return;
    this.queue.push(piece);
  }

  /** Peek at the next queued piece without consuming it. */
  peek(): GarbagePiece | undefined {
    return this.queue[0];
  }

  /** Pop the next piece. */
  pop(): GarbagePiece | undefined {
    return this.queue.shift();
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
  }

  newId(): number {
    return this.nextId++;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private pieceFromCombo(
    comboSize: number,
    cols: number,
  ): { width: number; height: number } | null {
    // Classic Tetris Attack: combo only sends a flat strip whose width matches
    // (combo - 1), capped at the board width. Combos of 3 (just a match) send
    // nothing.
    if (comboSize <= 3) return null;
    if (comboSize === 4) return { width: 3, height: 1 };
    if (comboSize === 5) return { width: 4, height: 1 };
    if (comboSize === 6) return { width: 5, height: 1 };
    return { width: cols, height: 1 };
  }

  private pieceFromChain(
    chain: number,
    cols: number,
  ): { width: number; height: number } | null {
    // Chains are the real attack vector. A chain x2 sends one strip; bigger
    // chains scale up width first to the full row, then start stacking rows.
    // Anything bigger than 6 rows tall is clamped — that's already half the
    // board, more than enough to topout an unprepared opponent.
    if (chain < 2) return null;
    if (chain === 2) return { width: 3, height: 1 };
    if (chain === 3) return { width: 4, height: 1 };
    if (chain === 4) return { width: 5, height: 1 };
    if (chain === 5) return { width: cols, height: 1 };
    if (chain === 6) return { width: cols, height: 2 };
    return { width: cols, height: Math.min(3 + (chain - 7), 4) };
  }
}
