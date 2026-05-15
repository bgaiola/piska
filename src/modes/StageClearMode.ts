/**
 * StageClearMode — start with a tall pre-filled stack and (typically) no
 * auto-rise. The player wins by clearing enough blocks that the highest
 * occupied row drops to (or below) `targetLine`. Remember: row 0 is the TOP,
 * so a HIGHER row index means the stack is SHORTER. The win check is
 * `stackHighest() >= targetLine`.
 *
 * An optional `timeLimitMs` lets stage designers add pressure; if it expires
 * before the target line is reached, the player loses.
 */

import type { EngineEvent, GameEngine } from '@/engine';
import { ModeBase, type ModeResultData } from './ModeBase';

export interface StageClearParams {
  initialStackHeight: number;
  targetLine: number;
  timeLimitMs?: number;
}

export class StageClearMode extends ModeBase {
  constructor(
    engine: GameEngine,
    public readonly params: StageClearParams,
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
    if (this.params.timeLimitMs && this.timeMs >= this.params.timeLimitMs) {
      this.finished = true;
      this.result = 'lost';
      return;
    }
    if (this.stackHighest() >= this.params.targetLine) {
      this.finished = true;
      this.result = 'won';
    }
  }

  protected onEvent(_e: EngineEvent): void {
    /* no-op */
  }

  /**
   * Row index of the topmost occupied cell. Returns `grid.rows` if the grid
   * is empty (i.e. "the stack has no top" — sentinel value above the floor).
   */
  private stackHighest(): number {
    const g = this.engine.grid;
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        if (g.cells[row]?.[col]) return row;
      }
    }
    return g.rows;
  }

  remainingBlocks(): number {
    const g = this.engine.grid;
    let n = 0;
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        if (g.cells[row]?.[col]) n++;
      }
    }
    return n;
  }

  getResultData(): ModeResultData {
    return {
      mode: 'stage-clear',
      score: this.engine.score.score,
      timeMs: this.timeMs,
      remainingBlocks: this.remainingBlocks(),
    };
  }
}
