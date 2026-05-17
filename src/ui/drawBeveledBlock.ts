/**
 * drawBeveledBlock — 16-bit-style chiclet block renderer.
 *
 * Draws a single block as a stack of solid rectangles that read as a beveled
 * cube: a darker base, a brighter highlight band on the top + left edges,
 * and a darker shadow band on the bottom + right edges. The recipe matches
 * the chunky-pixel look of Panel de Pon / Tetris Attack while staying cheap
 * to draw — six Phaser.GameObjects.Rectangle instances per block, no
 * spritesheet, no texture atlas. Cheap enough for the 6×12 grid we render
 * every frame.
 *
 * Returns a sub-container parented to the requested container so callers can
 * apply per-block `setScale` / `setAlpha` (used during the clear animation)
 * uniformly across every bevel layer.
 */

import Phaser from 'phaser';
import { darken } from '@/config';

export interface BeveledBlockOptions {
  scene: Phaser.Scene;
  /** Container the returned block container is parented to. */
  parent: Phaser.GameObjects.Container;
  /** Center X in the parent's local coordinate system. */
  x: number;
  /** Center Y in the parent's local coordinate system. */
  y: number;
  /** Width = height of the block in pixels. */
  size: number;
  /** Base fill colour for the block body. */
  color: number;
}

/**
 * Lightens a hex colour by mixing toward white.
 * factor=0 returns the source colour, factor=1 returns pure white.
 */
function lighten(hex: number, factor = 0.4): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const lr = Math.min(255, Math.floor(r + (255 - r) * factor));
  const lg = Math.min(255, Math.floor(g + (255 - g) * factor));
  const lb = Math.min(255, Math.floor(b + (255 - b) * factor));
  return (lr << 16) | (lg << 8) | lb;
}

/**
 * Returns a Container holding the bevel pieces, positioned at (x, y) inside
 * `parent`. Apply `setAlpha` / `setScale` on the returned container to drive
 * the clear / swap animations uniformly across every layer.
 */
export function drawBeveledBlock(opts: BeveledBlockOptions): Phaser.GameObjects.Container {
  const { scene, parent, x, y, size, color } = opts;

  const sub = scene.add.container(x, y);

  const bevel = Math.max(2, Math.floor(size / 14));
  const inner = size - 2;

  const body = color;
  const high = lighten(color, 0.45);
  const lowMid = darken(color, 0.78);
  const low = darken(color, 0.55);
  const outline = darken(color, 0.32);

  // 1. Outer outline (darkest). The 1px inset makes adjacent blocks read
  // as separate cells instead of fusing into a single colour block.
  const outer = scene.add.rectangle(0, 0, size - 1, size - 1, outline, 1);
  sub.add(outer);

  // 2. Body fill — the "base" colour the player perceives.
  const base = scene.add.rectangle(0, 0, inner, inner, body, 1);
  sub.add(base);

  // 3. Top + left highlight strips.
  const topStrip = scene.add.rectangle(0, -inner / 2, inner, bevel, high, 1);
  topStrip.setOrigin(0.5, 0);
  sub.add(topStrip);

  const leftStrip = scene.add.rectangle(-inner / 2, 0, bevel, inner, high, 1);
  leftStrip.setOrigin(0, 0.5);
  sub.add(leftStrip);

  // 4. Bottom + right shadow strips.
  const bottomStrip = scene.add.rectangle(0, inner / 2, inner, bevel, lowMid, 1);
  bottomStrip.setOrigin(0.5, 1);
  sub.add(bottomStrip);

  const rightStrip = scene.add.rectangle(inner / 2, 0, bevel, inner, lowMid, 1);
  rightStrip.setOrigin(1, 0.5);
  sub.add(rightStrip);

  // 5. Inner highlight pixel near the top-left — the signature 16-bit shine.
  // Skip on tiny cells where the dot would be lost in the bevel.
  if (size >= 22) {
    const dotSize = Math.max(2, Math.floor(size / 12));
    const dot = scene.add.rectangle(
      -size / 2 + bevel + dotSize / 2 + 1,
      -size / 2 + bevel + dotSize / 2 + 1,
      dotSize,
      dotSize,
      0xffffff,
      0.85,
    );
    sub.add(dot);

    // Matching darker notch in the bottom-right corner for symmetry.
    const notch = scene.add.rectangle(
      size / 2 - bevel - dotSize / 2 - 1,
      size / 2 - bevel - dotSize / 2 - 1,
      dotSize,
      dotSize,
      low,
      1,
    );
    sub.add(notch);
  }

  parent.add(sub);
  return sub;
}

/**
 * Draws a uniformly white "flash" block used during the clear animation. We
 * draw a simpler version (no bevel) since the player's eye is reading the
 * shape, not the colour, while the block fades.
 */
export function drawFlashBlock(opts: {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  x: number;
  y: number;
  size: number;
}): Phaser.GameObjects.Container {
  const { scene, parent, x, y, size } = opts;
  const sub = scene.add.container(x, y);
  const base = scene.add.rectangle(0, 0, size - 2, size - 2, 0xffffff, 1);
  sub.add(base);
  parent.add(sub);
  return sub;
}
