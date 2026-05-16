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

    // Solid dark bar with a 1px amber underline so the top of the screen
    // reads as a real status panel, not a vague translucent strip.
    this.add.rectangle(0, 0, w, 32, 0x0b0418, 1).setOrigin(0, 0);
    this.add.rectangle(0, 32, w, 1, 0x553a18, 1).setOrigin(0, 0);

    this.scoreText = this.add.text(10, 8, 'SCORE 0', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffe6a8',
      fontStyle: 'bold',
    });

    this.chainText = this.add
      .text(w / 2, 8, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffaa44',
        fontStyle: 'bold',
        stroke: '#3a1a08',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0);

    this.garbageText = this.add
      .text(w - 10, 8, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f88aa0',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);

    this.engineOff = this.engine.events.on((e: EngineEvent) => {
      if (e.type === 'match.found' && e.chain >= 2) {
        this.chainText.setText(`CHAIN x${e.chain}!`);
        this.chainTimer = 1200;
        // Pop the chain text so the player can't miss it.
        this.chainText.setScale(0.85);
        this.tweens.add({
          targets: this.chainText,
          scale: 1.0,
          duration: 180,
          ease: 'Back.easeOut',
        });
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
