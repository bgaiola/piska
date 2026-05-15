/**
 * GameOverScene — overlay shown when the engine emits `game.over`. Shows the
 * final score and waits for a tap / Space to restart the run from scratch.
 *
 * Restart logic stops every scene cleanly so the next GameScene boots with a
 * fresh engine instance.
 */

import Phaser from 'phaser';
import type { GameEngine } from '@/engine';

export class GameOverScene extends Phaser.Scene {
  private engine!: GameEngine;

  constructor() {
    super('GameOverScene');
  }

  init(data: { engine: GameEngine }): void {
    this.engine = data.engine;
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.add.rectangle(0, 0, w, h, 0x000000, 0.75).setOrigin(0, 0);

    this.add
      .text(w / 2, h * 0.4, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#f88',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.55, `SCORE ${this.engine.score.score}`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.7, 'Tap / Espaço para reiniciar', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#fff',
      })
      .setOrigin(0.5);

    const restart = (): void => {
      this.scene.stop('PauseScene');
      this.scene.stop('HUDScene');
      this.scene.stop('GameScene');
      this.scene.start('GameScene');
      this.scene.stop();
    };

    this.input.keyboard?.on('keydown-SPACE', restart);
    this.input.keyboard?.on('keydown-ENTER', restart);
    this.input.once('pointerdown', restart);
  }
}
