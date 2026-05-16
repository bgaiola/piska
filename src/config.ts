/**
 * PISKA — runtime configuration shared by the rendering layer.
 *
 * Engine config (rows, cols, durations, RNG seed) lives in `@/engine/types`.
 * Anything here is presentation-only: logical canvas size, cell size on screen,
 * color palette, debug toggles.
 */

import type { BlockColor } from '@/engine';

export const PISKA_VERSION = '0.1.0';

/** Logical canvas resolution in portrait orientation. */
export const LOGICAL_PORTRAIT = { width: 360, height: 640 } as const;

/** Logical canvas resolution in landscape orientation. */
export const LOGICAL_LANDSCAPE = { width: 640, height: 360 } as const;

/**
 * Logical size of a single grid cell. Grid is 6 cols × 28 px = 168 px wide,
 * 12 rows × 28 px = 336 px tall. Fits both portrait and landscape resolutions
 * with room for HUD and gutters.
 */
export const BLOCK_SIZE_LOGICAL = 28;

export const DEBUG = false;

/**
 * Maps BlockColor → hex int for Phaser tinting. Fase 1 uses procedurally drawn
 * shapes rather than spritesheets, so we keep the palette purely in code.
 */
export const BLOCK_COLOR_HEX: Record<BlockColor, number> = {
  // Saturated 16-bit palette — more pop than the original mauve set so the
  // blocks read clearly against the deep-purple play backdrops.
  red: 0xff3a55,
  blue: 0x3aa0ff,
  green: 0x4ed83a,
  yellow: 0xffd935,
  purple: 0xc24cff,
  cyan: 0x36ecd4,
};

/**
 * Accessibility-friendly symbol overlay per color, so colorblind players
 * can still distinguish blocks by shape.
 */
export const BLOCK_SYMBOL: Record<BlockColor, string> = {
  red: '♥',
  blue: '◆',
  green: '▲',
  yellow: '●',
  purple: '★',
  cyan: '⬢',
};

/**
 * Returns a darker variant of a given hex int — used for block outlines
 * and the playfield frame. `factor` in [0,1]: 0 = black, 1 = original.
 */
export function darken(hex: number, factor = 0.55): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
