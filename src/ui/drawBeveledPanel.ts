/**
 * drawBeveledPanel — chunky 16-bit panel chrome for menu cards, action
 * buttons, and HUD frames. Matches the bevel logic of `drawBeveledBlock`
 * but tuned for elongated UI rectangles instead of square gameplay tiles.
 *
 * Returns the underlying Phaser.GameObjects.Rectangle so callers can swap
 * its fill / stroke on focus changes. The bevel children live in a
 * sub-container that the caller can transform (scale, alpha) uniformly.
 */

import type Phaser from 'phaser';

export interface BeveledPanelOptions {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  /** Center X in parent's local space. */
  x: number;
  /** Center Y in parent's local space. */
  y: number;
  width: number;
  height: number;
  /** Body fill colour. */
  fill: number;
  /** Outer border colour. */
  border: number;
  /** Highlight strip colour (top + left). Defaults to a soft cream. */
  highlight?: number;
  /** Shadow strip colour (bottom + right). Defaults to near-black. */
  shadow?: number;
  /** Bevel thickness in pixels. Defaults to 3. */
  bevel?: number;
  /** Fill opacity (0..1). Defaults to 0.95. */
  fillAlpha?: number;
}

export interface BeveledPanelHandle {
  /** Wrapper container holding the body + bevel pieces. Apply
   * setScale/setAlpha here to animate the whole panel uniformly. */
  container: Phaser.GameObjects.Container;
  /** Body fill rectangle. Mutate fill colour on focus changes. */
  body: Phaser.GameObjects.Rectangle;
  /** Outer 1px border rectangle. Mutate stroke colour on focus changes. */
  border: Phaser.GameObjects.Rectangle;
  /** Top highlight strip. */
  highlight: Phaser.GameObjects.Rectangle;
  /** Bottom shadow strip. */
  shadow: Phaser.GameObjects.Rectangle;
}

export function drawBeveledPanel(opts: BeveledPanelOptions): BeveledPanelHandle {
  const {
    scene,
    parent,
    x,
    y,
    width,
    height,
    fill,
    border,
  } = opts;
  const bevel = opts.bevel ?? 3;
  const highlightColor = opts.highlight ?? 0xfff4d6;
  const shadowColor = opts.shadow ?? 0x06030c;
  const fillAlpha = opts.fillAlpha ?? 0.95;

  const sub = scene.add.container(x, y);

  // Border (drawn first, behind everything) — a 1px stroke around the
  // outer edge for crisp definition against the backdrop.
  const borderRect = scene.add
    .rectangle(0, 0, width, height, border, 1)
    .setStrokeStyle(0);
  sub.add(borderRect);

  // Body fill — sits 2px inside the border so the border reads as a line.
  const bodyRect = scene.add.rectangle(0, 0, width - 2, height - 2, fill, fillAlpha);
  sub.add(bodyRect);

  // Top highlight strip — slim band running the full width minus 2px.
  const topStrip = scene.add.rectangle(
    0,
    -height / 2 + 1 + bevel / 2,
    width - 4,
    bevel,
    highlightColor,
    0.35,
  );
  sub.add(topStrip);

  // Bottom shadow strip — same shape but on the bottom edge, darker so the
  // panel reads as embossed.
  const bottomStrip = scene.add.rectangle(
    0,
    height / 2 - 1 - bevel / 2,
    width - 4,
    bevel,
    shadowColor,
    0.55,
  );
  sub.add(bottomStrip);

  parent.add(sub);

  return {
    container: sub,
    body: bodyRect,
    border: borderRect,
    highlight: topStrip,
    shadow: bottomStrip,
  };
}
