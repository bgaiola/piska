/**
 * ChainPopup — short-lived flash text used to celebrate big combos and chain
 * cascades. Scenes call the static helpers from inside a `match.found`
 * handler; the popup creates its own Phaser.Text + tweens and auto-destroys
 * when the animation finishes.
 *
 * Lifecycle: fade in (80ms) → hold (600ms) → fade out (400ms), with a small
 * scale bounce (1 → 1.2 → 1) overlaid for snap. The color is picked by the
 * helpers based on the chain / combo size and tuned to read against the
 * dark playfield background.
 */

import Phaser from 'phaser';

export interface ChainPopupOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  text: string;
  color?: string;
  fontSize?: number;
}

const DEFAULT_COLOR = '#ffe6a8';
const DEFAULT_FONT_SIZE = 18;

const FADE_IN_MS = 80;
const HOLD_MS = 600;
const FADE_OUT_MS = 400;

export class ChainPopup {
  private readonly scene: Phaser.Scene;
  private readonly text: Phaser.GameObjects.Text;
  private destroyed = false;

  constructor(opts: ChainPopupOptions) {
    this.scene = opts.scene;

    const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
    const color = opts.color ?? DEFAULT_COLOR;

    this.text = this.scene.add
      .text(opts.x, opts.y, opts.text, {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#1a0a22',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.6)
      .setDepth(10_000);

    // Fade in + scale up.
    this.scene.tweens.add({
      targets: this.text,
      alpha: 1,
      scale: 1.2,
      duration: FADE_IN_MS,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.destroyed) return;
        // Settle back to natural scale and drift upward gently while held.
        this.scene.tweens.add({
          targets: this.text,
          scale: 1,
          y: this.text.y - 6,
          duration: HOLD_MS,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (this.destroyed) return;
            this.scene.tweens.add({
              targets: this.text,
              alpha: 0,
              scale: 0.9,
              y: this.text.y - 4,
              duration: FADE_OUT_MS,
              ease: 'Sine.easeIn',
              onComplete: () => this.destroy(),
            });
          },
        });
      },
    });
  }

  /** Manually tear down. Safe to call multiple times. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.text.destroy();
  }

  /**
   * Pops a "COMBO N!" flash when a single match cleared 4+ blocks at once.
   * Smaller combos (3) are silent — they're the bread and butter of play.
   */
  static showCombo(scene: Phaser.Scene, x: number, y: number, comboSize: number): void {
    if (comboSize < 4) return;
    const color = comboSize >= 6 ? '#ffd0d0' : '#ffaa44';
    new ChainPopup({ scene, x, y, text: `COMBO ${comboSize}!`, color });
  }

  /**
   * Pops a "CHAIN xN!" flash for cascade multipliers >= 2.
   * Color escalates with the chain length so the player gets a clear cue
   * for "you're cooking".
   */
  static showChain(scene: Phaser.Scene, x: number, y: number, chain: number): void {
    if (chain < 2) return;
    const color = chain >= 6 ? '#ffffff' : chain >= 4 ? '#ff66aa' : '#ffaa44';
    new ChainPopup({ scene, x, y, text: `CHAIN x${chain}!`, color });
  }
}
