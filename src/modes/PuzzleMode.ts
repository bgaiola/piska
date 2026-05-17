/**
 * PuzzleMode — fixed, hand-crafted board with a fixed number of allowed
 * swaps. The player wins by clearing every block. They lose if they run out
 * of swaps with blocks still on the board.
 *
 * Move counting: we listen for `block.swapped` from the engine; a swap is
 * counted regardless of whether the resulting position produces a match.
 * The loss check is deferred until the engine is no longer animating, so
 * cascades triggered by the last swap can complete and (potentially) clear
 * the board for a win.
 *
 * Star rating (puzzle-only):
 *   3 stars — solved using <= movesAllowed - 2 moves (optimal or better)
 *   2 stars — solved using movesAllowed - 1 moves (close to optimal)
 *   1 star  — solved using movesAllowed moves (used them all)
 *   none   — failed
 */

import type { EngineEvent, GameEngine } from '@/engine';
import { ModeBase, type ModeResultData } from './ModeBase';

export interface PuzzleParams {
  movesAllowed: number;
  /** Catalog id of the puzzle, surfaced in the result snapshot so SaveManager
   * can store stars per puzzle and ResultScene can advance to the next one. */
  puzzleId?: string;
}

export class PuzzleMode extends ModeBase {
  private movesUsed = 0;

  constructor(
    engine: GameEngine,
    public readonly params: PuzzleParams,
  ) {
    super(engine);
  }

  onTick(dtMs: number): void {
    if (this.finished) return;
    this.timeMs += dtMs;
    if (this.engine.gameOver) {
      this.finished = true;
      this.result = 'lost';
      return;
    }
    if (this.isGridEmpty()) {
      this.finished = true;
      this.result = 'won';
      return;
    }
    if (this.movesUsed >= this.params.movesAllowed && !this.engineIsAnimating()) {
      this.finished = true;
      this.result = 'lost';
    }
  }

  protected onEvent(e: EngineEvent): void {
    if (e.type === 'block.swapped') this.movesUsed++;
  }

  private isGridEmpty(): boolean {
    const g = this.engine.grid;
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        if (g.cells[row]?.[col]) return false;
      }
    }
    return true;
  }

  /**
   * Returns true if any block is in swapping/falling/clearing state — used to
   * defer the loss check so cascades from the last swap can resolve before we
   * declare the player out of moves.
   */
  private engineIsAnimating(): boolean {
    const g = this.engine.grid;
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const c = g.cells[row]?.[col];
        if (c && c.state !== 'idle') return true;
      }
    }
    return false;
  }

  movesRemaining(): number {
    return Math.max(0, this.params.movesAllowed - this.movesUsed);
  }

  getResultData(): ModeResultData {
    const opt = this.params.movesAllowed - 2;
    let stars: 1 | 2 | 3 | undefined;
    if (this.result === 'won') {
      if (this.movesUsed <= opt) stars = 3;
      else if (this.movesUsed === opt + 1) stars = 2;
      else stars = 1;
    }
    return {
      mode: 'puzzle',
      score: this.engine.score.score,
      timeMs: this.timeMs,
      movesUsed: this.movesUsed,
      movesAllowed: this.params.movesAllowed,
      stars,
      puzzleId: this.params.puzzleId,
    };
  }
}
