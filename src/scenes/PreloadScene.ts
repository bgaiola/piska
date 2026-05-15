/**
 * PreloadScene — generates procedural textures for fase 1.
 *
 * We don't have asset files yet, so every visible thing on screen is built
 * from a small set of generated textures registered here. Block textures get
 * a chunky 16-bit treatment (gradient fill, outline, highlight, shadow, and a
 * baked-in colorblind-friendly glyph) so they read as solid pixel-art tiles
 * even when other scenes choose to draw with Graphics instead of using these
 * sprites directly.
 *
 * When the loader is finished we transition to TitleScene.
 */

import Phaser from 'phaser';
import { ALL_COLORS } from '@/engine';
import {
  BLOCK_COLOR_HEX,
  BLOCK_SIZE_LOGICAL,
  BLOCK_SYMBOL,
  darken,
} from '@/config';
import type { BlockColor } from '@/engine';

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
   * with a full 16-bit-style treatment:
   *
   *   - vertical "gradient" via a few horizontal stripes that step in lightness
   *   - 2px darker outline around the full tile
   *   - 1px highlight on the top + left edges (one shade lighter)
   *   - 1px shadow on the bottom + right edges (one shade darker)
   *   - the per-color glyph from `BLOCK_SYMBOL` baked into the center, sized
   *     to ~70% of cell height so it reads from across the screen and
   *     doubles as a colorblind-friendly cue
   *
   * The texture key (`block-<color>`) and pixel dimensions
   * (BLOCK_SIZE_LOGICAL × BLOCK_SIZE_LOGICAL) must remain stable: other
   * scenes (GameScene, VsLocalScene, OnlineVsScene…) assume that contract.
   */
  private generateBlockTextures(): void {
    const size = BLOCK_SIZE_LOGICAL;

    for (const color of ALL_COLORS as readonly BlockColor[]) {
      const key = `block-${color}`;
      if (this.textures.exists(key)) continue;

      const hex = BLOCK_COLOR_HEX[color];
      const outline = darken(hex, 0.4);
      const shadow = darken(hex, 0.6);
      const highlight = lighten(hex, 0.35);
      const midLight = lighten(hex, 0.15);
      const midDark = darken(hex, 0.18);

      // Compose the chrome (background + frame + shading) with Graphics.
      const g = this.make.graphics({ x: 0, y: 0 }, false);

      // Background gradient as 4 horizontal stripes from light → dark. Cheap
      // and gives the block a clear "lit from above" feel without sampling
      // pixel-by-pixel.
      const stripes: number[] = [midLight, hex, hex, midDark];
      const stripeH = Math.max(1, Math.floor(size / stripes.length));
      let y = 0;
      for (let i = 0; i < stripes.length; i++) {
        const isLast = i === stripes.length - 1;
        const h = isLast ? size - y : stripeH;
        g.fillStyle(stripes[i], 1);
        g.fillRect(0, y, size, h);
        y += h;
      }

      // 2px outline. We draw it as two nested rectangles instead of using
      // strokeRect so the corners stay perfectly square at the pixel level
      // (strokeRect with thick line widths can produce off-by-one bleeding
      // outside the bounds, which clips on the texture edge).
      g.fillStyle(outline, 1);
      g.fillRect(0, 0, size, 2); // top
      g.fillRect(0, size - 2, size, 2); // bottom
      g.fillRect(0, 0, 2, size); // left
      g.fillRect(size - 2, 0, 2, size); // right

      // 1px inner highlight along the top + left edges (just inside the
      // outline). Classic 16-bit "shiny tile" trick.
      g.fillStyle(highlight, 1);
      g.fillRect(2, 2, size - 4, 1); // inner top
      g.fillRect(2, 2, 1, size - 4); // inner left

      // 1px inner shadow on the bottom + right edges — sells the depth.
      g.fillStyle(shadow, 1);
      g.fillRect(2, size - 3, size - 4, 1); // inner bottom
      g.fillRect(size - 3, 2, 1, size - 4); // inner right

      // Subtle corner pixels: top-left highlight bright, bottom-right
      // shadow dark. Tiny touch but disambiguates orientation.
      g.fillStyle(highlight, 1);
      g.fillRect(2, 2, 2, 2);
      g.fillStyle(shadow, 1);
      g.fillRect(size - 4, size - 4, 2, 2);

      // Render to a RenderTexture so we can also draw a Text glyph on top
      // before saving as a single texture.
      const rt = this.make.renderTexture({ width: size, height: size }, false);
      rt.draw(g, 0, 0);
      g.destroy();

      // Glyph — sized to ~70% of cell height. We render it once as a dark
      // shadow offset by (1,1) and once as a bright fill on top: that "faux
      // emboss" reads clearly on every backdrop color without needing to
      // pick a per-color text tint by hand.
      const glyph = BLOCK_SYMBOL[color];
      const fontSize = Math.max(10, Math.floor(size * 0.7));
      const glyphShadow = this.make.text(
        {
          x: 0,
          y: 0,
          text: glyph,
          style: {
            fontFamily: 'monospace',
            fontSize: `${fontSize}px`,
            color: hexToCss(darken(hex, 0.25)),
          },
        },
        false,
      );
      glyphShadow.setOrigin(0.5, 0.5);
      rt.draw(glyphShadow, size / 2 + 1, size / 2 + 1);
      glyphShadow.destroy();

      const glyphFill = this.make.text(
        {
          x: 0,
          y: 0,
          text: glyph,
          style: {
            fontFamily: 'monospace',
            fontSize: `${fontSize}px`,
            color: hexToCss(lighten(hex, 0.55)),
          },
        },
        false,
      );
      glyphFill.setOrigin(0.5, 0.5);
      rt.draw(glyphFill, size / 2, size / 2);
      glyphFill.destroy();

      // Save into the texture manager under the public key.
      rt.saveTexture(key);
      rt.destroy();

      // Keep block art chunky even though the game-wide pixelArt flag is off
      // (we disabled it so menu text renders crisply).
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  /**
   * Cursor is a wide rectangle outline spanning two cells (the player swaps a
   * pair). Instead of a single thin rectangle we draw the classic
   * "selection brackets" — corner pieces with a hollow middle — which reads
   * better against busy block backgrounds and feels properly pixel-art.
   *
   * Texture dimensions remain (2 × BLOCK_SIZE_LOGICAL, BLOCK_SIZE_LOGICAL).
   */
  private generateCursorTexture(): void {
    const w = BLOCK_SIZE_LOGICAL * 2;
    const h = BLOCK_SIZE_LOGICAL;
    const key = 'cursor';
    if (this.textures.exists(key)) return;

    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Bracket length in pixels — roughly 1/3 of the smaller side so the
    // corners hint at a frame without occluding the blocks inside.
    const armX = Math.max(4, Math.floor(w * 0.18));
    const armY = Math.max(4, Math.floor(h * 0.32));
    const thick = 2; // 2px bracket lines for a chunky look
    const inset = 1; // pull in by 1px so the bracket lives inside the cell

    const brightCore = 0xffffff;
    const softOutline = 0x2a2440;

    // Drop a 1px-thicker dark "shadow" first so the cursor pops even on a
    // light-colored block. The shadow is drawn at +1 offset on the outer
    // edges, so it never sticks out beyond the texture bounds.
    drawBracketSet(g, w, h, inset, armX + 1, armY + 1, thick + 1, softOutline);

    // Bright bracket on top.
    drawBracketSet(g, w, h, inset, armX, armY, thick, brightCore);

    g.generateTexture(key, w, h);
    g.destroy();
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
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

/**
 * Returns a lighter variant of a given hex int. `factor` in [0,1]: 0 = same,
 * 1 = pure white. Mirrors `darken()` from `@/config` but living locally so
 * we don't pollute the public config module with rendering helpers.
 */
function lighten(hex: number, factor = 0.2): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const lr = Math.min(255, Math.round(r + (255 - r) * f));
  const lg = Math.min(255, Math.round(g + (255 - g) * f));
  const lb = Math.min(255, Math.round(b + (255 - b) * f));
  return (lr << 16) | (lg << 8) | lb;
}

/**
 * Converts a hex int (0xRRGGBB) to the `#rrggbb` CSS string Phaser.Text
 * expects for its `color` style property.
 */
function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * Draws the 4 corner brackets of a "selection frame" into the provided
 * Graphics object. Each corner is an L-shape `arm` pixels long and `thick`
 * pixels wide. `inset` pulls the brackets in from the texture bounds so we
 * never paint a stray pixel on the edge that would bleed after upscaling.
 */
function drawBracketSet(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  inset: number,
  armX: number,
  armY: number,
  thick: number,
  color: number,
): void {
  g.fillStyle(color, 1);

  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;

  // Top-left bracket: a horizontal arm + a vertical arm meeting at (x0, y0).
  g.fillRect(x0, y0, armX, thick);
  g.fillRect(x0, y0, thick, armY);

  // Top-right bracket.
  g.fillRect(x1 - armX, y0, armX, thick);
  g.fillRect(x1 - thick, y0, thick, armY);

  // Bottom-left bracket.
  g.fillRect(x0, y1 - thick, armX, thick);
  g.fillRect(x0, y1 - armY, thick, armY);

  // Bottom-right bracket.
  g.fillRect(x1 - armX, y1 - thick, armX, thick);
  g.fillRect(x1 - thick, y1 - armY, thick, armY);
}
