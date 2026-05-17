/**
 * drawCursor — paints the player's 2-cell selection cursor as four corner
 * brackets in classic Tetris-Attack / Panel-de-Pon style. Brighter, more
 * readable than a single thin outline, and the bracket gaps stop the
 * cursor from visually fusing with the block edges underneath.
 *
 * The function is stateless: scenes own a single Phaser.GameObjects.Graphics
 * and pass it in each frame. Callers are responsible for clearing the
 * Graphics first (multi-player scenes paint two cursors into the same
 * Graphics, so an auto-clear in this helper would erase the first one).
 */

import type Phaser from 'phaser';

export interface CursorDrawOptions {
  g: Phaser.GameObjects.Graphics;
  /** Top-left X of the LEFT cell of the 2-cell cursor in scene space. */
  x: number;
  /** Top-left Y of the LEFT cell of the 2-cell cursor in scene space. */
  y: number;
  /** Single-cell side length. The cursor spans 2 cells horizontally. */
  cellSize: number;
  /** Cursor breathing scale (0.94..1.06); pass 1 for no breathing. */
  scale?: number;
  /** Time in ms used for the sine-driven alpha pulse. Pass performance.now(). */
  timeMs?: number;
  /** Override the bracket colour. Defaults to a warm cream so it pops on
   * any block colour. */
  color?: number;
}

export function drawCursor(opts: CursorDrawOptions): void {
  const { g, cellSize } = opts;
  const scale = opts.scale ?? 1;
  const color = opts.color ?? 0xfff4d6;
  const timeMs = opts.timeMs ?? 0;

  const baseW = cellSize * 2;
  const baseH = cellSize;
  const w = baseW * scale;
  const h = baseH * scale;
  const x = opts.x + (baseW - w) / 2;
  const y = opts.y + (baseH - h) / 2;

  // Pulse alpha so the cursor breathes; player can find it instantly even
  // if their eye drifted to the rising stack.
  const pulse = 0.7 + 0.3 * Math.sin(timeMs / 180);

  // Bracket geometry: each L-shape is ~1/3 of a side long, 2-3px thick.
  // Scales with cellSize so the cursor stays readable on tiny mobile cells
  // and stays elegant on big desktop cells.
  const thick = Math.max(2, Math.floor(cellSize / 11));
  const armLen = Math.max(6, Math.floor(cellSize * 0.42));

  // Drop a faint dark drop-shadow behind the brackets so they pop against
  // bright blocks (yellow, cyan, green). 1px down-right offset.
  drawBrackets(g, x + 1, y + 1, w, h, thick, armLen, 0x000000, pulse * 0.55);
  // The main brackets sit on top.
  drawBrackets(g, x, y, w, h, thick, armLen, color, pulse);
}

function drawBrackets(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  thick: number,
  armLen: number,
  color: number,
  alpha: number,
): void {
  g.fillStyle(color, alpha);

  // Top-left: horizontal arm + vertical arm sharing the corner pixel.
  g.fillRect(x, y, armLen, thick);
  g.fillRect(x, y, thick, armLen);

  // Top-right.
  g.fillRect(x + w - armLen, y, armLen, thick);
  g.fillRect(x + w - thick, y, thick, armLen);

  // Bottom-left.
  g.fillRect(x, y + h - thick, armLen, thick);
  g.fillRect(x, y + h - armLen, thick, armLen);

  // Bottom-right.
  g.fillRect(x + w - armLen, y + h - thick, armLen, thick);
  g.fillRect(x + w - thick, y + h - armLen, thick, armLen);

  // Subtle midline tick on the top + bottom so the player can tell where
  // the cursor will split the two cells. Stops the 2-cell box from feeling
  // like a single wide button.
  const midX = x + w / 2;
  const tickLen = Math.max(3, Math.floor(armLen * 0.45));
  g.fillRect(midX - thick / 2, y, thick, tickLen);
  g.fillRect(midX - thick / 2, y + h - tickLen, thick, tickLen);
}
