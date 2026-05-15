/**
 * PreloadScene — generates procedural textures for fase 1.
 *
 * We don't have asset files yet, so each block color is rendered into a tiny
 * generated texture (filled square + darker outline). We also produce a
 * cursor outline texture and an HUD background slab. Renderers can either
 * reference these textures by name or draw with Graphics; this scene exists
 * mostly so we have a single place that owns texture-creation lifecycle.
 *
 * When the loader is finished we transition to TitleScene.
 */

import Phaser from 'phaser';
import { ALL_COLORS } from '@/engine';
import { BLOCK_COLOR_HEX, BLOCK_SIZE_LOGICAL, darken } from '@/config';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    /* no external assets in fase 1 */
  }

  create(): void {
    this.generateBlockTextures();
    this.generateCursorTexture();
    this.generateHudTexture();
    this.generatePixelTexture();
    this.scene.start('TitleScene');
  }

  /**
   * For each BlockColor we emit a `block-<color>` texture of cellSize × cellSize
   * with a darker 1px border. The renderer is free to draw with Graphics
   * instead, but having these in the texture manager helps future sprite-based
   * code paths.
   */
  private generateBlockTextures(): void {
    const size = BLOCK_SIZE_LOGICAL;
    for (const color of ALL_COLORS) {
      const hex = BLOCK_COLOR_HEX[color];
      const outline = darken(hex, 0.55);
      const key = `block-${color}`;
      if (this.textures.exists(key)) continue;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(hex, 1);
      g.fillRect(0, 0, size, size);
      g.lineStyle(2, outline, 1);
      g.strokeRect(1, 1, size - 2, size - 2);
      g.generateTexture(key, size, size);
      g.destroy();
    }
  }

  /**
   * Cursor is a wide rectangle outline spanning two cells (the player swaps a
   * pair). Transparent interior, white-ish 2px border.
   */
  private generateCursorTexture(): void {
    const w = BLOCK_SIZE_LOGICAL * 2;
    const h = BLOCK_SIZE_LOGICAL;
    const key = 'cursor';
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(2, 0xffffee, 1);
    g.strokeRect(1, 1, w - 2, h - 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  /**
   * Top-bar slab used by the HUD. We just stash a thin dark rectangle so the
   * HUD can stretch it across whatever width is current.
   */
  private generateHudTexture(): void {
    const key = 'hud-bg';
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture(key, 4, 4);
    g.destroy();
  }

  /**
   * A plain white 4×4 sprite used as the particle base in
   * `engine/ParticleFX.ts`. Tinted per-emission at the call site, so a single
   * texture covers every block color.
   */
  private generatePixelTexture(): void {
    const key = 'pixel';
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture(key, 4, 4);
    g.destroy();
  }
}
