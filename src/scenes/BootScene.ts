/**
 * BootScene — minimal scene whose only purpose is to forward to PreloadScene.
 *
 * In later phases this is where we'd load tiny boot-critical assets (loading
 * bar background, fonts). Fase 1 has none, so we just hop to Preload.
 */

import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    /* nothing in fase 1 */
  }

  create(): void {
    this.scene.start('PreloadScene');
  }
}
