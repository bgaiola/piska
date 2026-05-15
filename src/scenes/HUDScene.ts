/**
 * HUDScene — thin overlay that reads engine state each frame and renders the
 * top status bar (score + active chain banner). It does *not* own input or
 * mutate the engine.
 */

import Phaser from 'phaser';
import type { GameEngine, EngineEvent } from '@/engine';

export class HUDScene extends Phaser.Scene {
  private engine!: GameEngine;
  private scoreText!: Phaser.GameObjects.Text;
  private chainText!: Phaser.GameObjects.Text;
  private garbageText!: Phaser.GameObjects.Text;
  private chainTimer = 0;
  private engineOff: (() => void) | null = null;

  constructor() {
    super('HUDScene');
  }

  init(data: { engine: GameEngine }): void {
    this.engine = data.engine;
  }

  create(): void {
    const w = this.scale.gameSize.width;

    this.add.rectangle(0, 0, w, 28, 0x000000, 0.6).setOrigin(0, 0);

    this.scoreText = this.add.text(8, 6, 'SCORE 0', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffe',
    });

    this.chainText = this.add
      .text(w / 2, 6, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ff8',
      })
      .setOrigin(0.5, 0);

    this.garbageText = this.add
      .text(w - 8, 6, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f9c',
      })
      .setOrigin(1, 0);

    this.engineOff = this.engine.events.on((e: EngineEvent) => {
      if (e.type === 'match.found' && e.chain >= 2) {
        this.chainText.setText(`CHAIN x${e.chain}!`);
        this.chainTimer = 1200;
      }
    });

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  update(_time: number, dtMs: number): void {
    this.scoreText.setText(`SCORE ${this.engine.score.score}`);
    if (this.chainTimer > 0) {
      this.chainTimer -= dtMs;
      if (this.chainTimer <= 0) {
        this.chainText.setText('');
      }
    }
    const garbageQueued = this.engine.garbage?.size?.() ?? 0;
    this.garbageText.setText(garbageQueued > 0 ? `Garbage: ${garbageQueued}` : '');
  }

  private cleanup(): void {
    this.engineOff?.();
    this.engineOff = null;
  }
}
