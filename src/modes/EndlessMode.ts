/**
 * EndlessMode — survive as long as possible. The classic Panel de Pon arcade
 * loop: the stack rises, you swap, you chain, and the run ends only when the
 * engine tops out. Score grows monotonically and `timeMs` tracks survival
 * length for the result screen / leaderboards.
 */

import type { EngineEvent } from '@/engine';
import { ModeBase, type ModeResultData } from './ModeBase';

export class EndlessMode extends ModeBase {
  onTick(dtMs: number): void {
    if (this.finished) return;
    this.timeMs += dtMs;
    if (this.engine.gameOver) {
      this.finished = true;
      this.result = 'lost';
    }
  }

  protected onEvent(_e: EngineEvent): void {
    /* no-op */
  }

  getResultData(): ModeResultData {
    return {
      mode: 'endless',
      score: this.engine.score.score,
      timeMs: this.timeMs,
    };
  }
}
