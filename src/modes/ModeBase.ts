/**
 * ModeBase — abstract scaffolding for every PISKA solo/Vs game mode.
 *
 * A mode is a thin layer ABOVE the GameEngine that adds win/lose conditions,
 * timers and mode-specific scoring data. It does NOT mutate engine internals;
 * it only observes via the public API and the EngineEvent stream.
 *
 * GameScene drives the mode by calling `onTick(dtMs)` once per frame, AFTER
 * `engine.tick(dtMs)`. When `isFinished()` returns true, the scene transitions
 * to ResultScene with the snapshot produced by `getResultData()`.
 */

import type { GameEngine, EngineEvent } from '@/engine';

export type GameMode = 'endless' | 'time-attack' | 'stage-clear' | 'puzzle' | 'vs-ai';

export interface ModeContext {
  engine: GameEngine;
  /** Called once per scene tick, after engine.tick. */
  onTick(dtMs: number): void;
  /** True if the win/lose condition has been reached (won OR lost). */
  isFinished(): boolean;
  /** 'won' | 'lost' | 'pending'. */
  getResult(): 'won' | 'lost' | 'pending';
  /** Mode-specific score/result snapshot for ResultScene. */
  getResultData(): ModeResultData;
  /** Cleanup hook. */
  destroy(): void;
}

export interface ModeResultData {
  mode: GameMode;
  score: number;
  timeMs: number;
  // mode-specific extras (optional):
  remainingBlocks?: number;
  movesUsed?: number;
  movesAllowed?: number;
  stars?: 1 | 2 | 3;
}

export abstract class ModeBase implements ModeContext {
  protected timeMs = 0;
  protected finished = false;
  protected result: 'won' | 'lost' | 'pending' = 'pending';
  protected disposers: Array<() => void> = [];

  constructor(public readonly engine: GameEngine) {
    this.disposers.push(engine.events.on((e) => this.onEvent(e)));
  }

  abstract onTick(dtMs: number): void;
  protected abstract onEvent(e: EngineEvent): void;

  isFinished(): boolean {
    return this.finished;
  }
  getResult(): 'won' | 'lost' | 'pending' {
    return this.result;
  }
  abstract getResultData(): ModeResultData;
  destroy(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}
