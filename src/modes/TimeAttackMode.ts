/**
 * TimeAttackMode — score as much as possible within a fixed window
 * (default 2 minutes). Surviving until the timer expires counts as a win;
 * topping out before then counts as a loss. HUD code can read
 * `remainingMs()` to render a countdown.
 */

import type { EngineEvent } from '@/engine';
import { ModeBase, type ModeResultData } from './ModeBase';
import type { GameEngine } from '@/engine';

export interface TimeAttackParams {
  totalMs: number;
}

export class TimeAttackMode extends ModeBase {
  constructor(
    engine: GameEngine,
    public readonly params: TimeAttackParams = { totalMs: 120_000 },
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
    if (this.timeMs >= this.params.totalMs) {
      this.finished = true;
      this.result = 'won';
    }
  }

  protected onEvent(_e: EngineEvent): void {
    /* no-op */
  }

  getResultData(): ModeResultData {
    return {
      mode: 'time-attack',
      score: this.engine.score.score,
      timeMs: this.timeMs,
    };
  }

  /** Remaining ms, for HUD. */
  remainingMs(): number {
    return Math.max(0, this.params.totalMs - this.timeMs);
  }
}
