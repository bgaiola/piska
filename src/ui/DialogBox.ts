/**
 * DialogBox — reusable dialog widget for adventure intro/outro scenes.
 *
 * Renders a "framed manuscript" panel with a name plate and a typewriter text
 * area. Each call to `show()` returns a Promise that resolves when the player
 * advances the line (tap / space / enter). A tap mid-typeout completes the
 * line instantly without advancing — a second tap then advances.
 *
 * The widget owns a Phaser.Container plus an internal keyboard / pointer
 * subscription that lives only between `show()` and its resolution.
 *
 * Visual recipe: outer 2px warm-amber stroke (0xffcc55) + inner 2px stroke
 * inset 2px in a darker shade (0x6a4a18), filled with a dark purple-tinted
 * background (0x1a0a22) at 90% alpha. A pulsing ▼ "next" indicator at the
 * bottom-right hints more lines are available.
 */

import Phaser from 'phaser';
import type { Mood } from '@/data/characters';

export interface DialogBoxOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Framed-manuscript palette. Local constants — kept here so this widget owns
// its full look without depending on a global theme module.
const BORDER_OUTER = 0xffcc55;
const BORDER_INNER = 0x6a4a18;
const PANEL_FILL = 0x1a0a22;
const PANEL_ALPHA = 0.9;
const NAMEPLATE_FILL = 0x36204c;
const NAMEPLATE_STROKE = 0xffcc55;
const BODY_COLOR = '#fff';
const NAME_COLOR = '#ffe';
const HINT_COLOR = '#ffcc55';

export class DialogBox {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly outerBorder: Phaser.GameObjects.Rectangle;
  private readonly innerBorder: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly namePlate: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly width: number;
  private readonly height: number;

  // Per-line state
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  private currentFullText = '';
  private currentVisibleChars = 0;
  private isTyping = false;
  private pendingResolve: (() => void) | null = null;
  private offFns: Array<() => void> = [];
  private hintPulseTween: Phaser.Tweens.Tween | null = null;

  constructor(opts: DialogBoxOptions) {
    this.scene = opts.scene;
    this.width = opts.width;
    this.height = opts.height;

    const container = this.scene.add.container(opts.x, opts.y);
    this.container = container;

    // Layered borders for the "framed manuscript" look: outer warm-amber
    // stroke, then a darker inner stroke 2px in from the outer.
    this.outerBorder = this.scene.add
      .rectangle(0, 0, this.width + 4, this.height + 4, PANEL_FILL, PANEL_ALPHA)
      .setStrokeStyle(2, BORDER_OUTER);
    this.innerBorder = this.scene.add
      .rectangle(0, 0, this.width, this.height, PANEL_FILL, 0)
      .setStrokeStyle(2, BORDER_INNER);
    this.panel = this.scene.add
      .rectangle(0, 0, this.width - 4, this.height - 4, PANEL_FILL, PANEL_ALPHA)
      .setStrokeStyle(1, 0x3a204a);
    container.add([this.outerBorder, this.innerBorder, this.panel]);

    // Name plate sits across the top-left corner.
    const plateW = Math.min(160, Math.floor(this.width * 0.5));
    const plateH = 22;
    const plateX = -Math.floor(this.width / 2) + Math.floor(plateW / 2) + 10;
    const plateY = -Math.floor(this.height / 2) - 2;
    this.namePlate = this.scene.add
      .rectangle(plateX, plateY, plateW, plateH, NAMEPLATE_FILL, 0.95)
      .setStrokeStyle(2, NAMEPLATE_STROKE);
    this.nameText = this.scene.add
      .text(plateX, plateY, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: NAME_COLOR,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add([this.namePlate, this.nameText]);

    // Body text. Word-wrap to the panel's interior.
    this.bodyText = this.scene.add
      .text(
        -Math.floor(this.width / 2) + 16,
        -Math.floor(this.height / 2) + 26,
        '',
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: BODY_COLOR,
          wordWrap: { width: this.width - 32 },
          lineSpacing: 4,
        },
      )
      .setOrigin(0, 0);
    container.add(this.bodyText);

    // Pulsing "next" indicator at the bottom-right. ▼ char is more readable
    // than ▶ for "advance" while sitting under the last visible line.
    this.hintText = this.scene.add
      .text(
        Math.floor(this.width / 2) - 10,
        Math.floor(this.height / 2) - 10,
        '▼',
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: HINT_COLOR,
          fontStyle: 'bold',
        },
      )
      .setOrigin(1, 1)
      .setAlpha(0);
    container.add(this.hintText);
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  /**
   * Type the line out one character at a time and resolve when the player
   * advances. Calls to `show()` should never overlap; if one is in flight,
   * the new call fast-forwards and replaces it.
   */
  show(speaker: string, _mood: Mood | undefined, text: string): Promise<void> {
    // Cancel any prior in-flight line.
    this.cancelCurrent();

    this.nameText.setText(speaker);
    this.currentFullText = text;
    this.currentVisibleChars = 0;
    this.bodyText.setText('');
    this.hintText.setAlpha(0);
    this.isTyping = true;

    return new Promise<void>((resolve) => {
      this.pendingResolve = resolve;
      this.bindAdvance();
      this.typeTimer = this.scene.time.addEvent({
        delay: 30,
        callback: this.onTypeTick,
        callbackScope: this,
        loop: true,
      });
    });
  }

  destroy(): void {
    this.cancelCurrent();
    this.container.destroy(true);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private onTypeTick(): void {
    if (!this.isTyping) return;
    this.currentVisibleChars++;
    this.bodyText.setText(this.currentFullText.slice(0, this.currentVisibleChars));
    if (this.currentVisibleChars >= this.currentFullText.length) {
      this.finishTyping();
    }
  }

  private finishTyping(): void {
    this.isTyping = false;
    this.bodyText.setText(this.currentFullText);
    if (this.typeTimer) {
      this.typeTimer.remove(false);
      this.typeTimer = null;
    }
    this.hintText.setAlpha(1);
    // Looping alpha pulse for the ▼ indicator.
    this.hintPulseTween?.stop();
    this.hintPulseTween = this.scene.tweens.add({
      targets: this.hintText,
      alpha: { from: 0.4, to: 1 },
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private advanceLine(): void {
    if (this.isTyping) {
      // First tap: fast-complete instead of advancing.
      this.finishTyping();
      return;
    }
    // Second tap: actually resolve.
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.unbindAdvance();
    resolve?.();
  }

  private bindAdvance(): void {
    const kb = this.scene.input.keyboard;
    const onSpace = (): void => this.advanceLine();
    const onEnter = (): void => this.advanceLine();
    const onPointer = (): void => this.advanceLine();

    kb?.on('keydown-SPACE', onSpace);
    kb?.on('keydown-ENTER', onEnter);
    this.scene.input.on('pointerdown', onPointer);

    this.offFns.push(() => kb?.off('keydown-SPACE', onSpace));
    this.offFns.push(() => kb?.off('keydown-ENTER', onEnter));
    this.offFns.push(() => this.scene.input.off('pointerdown', onPointer));
  }

  private unbindAdvance(): void {
    this.offFns.forEach((off) => off());
    this.offFns = [];
  }

  private cancelCurrent(): void {
    if (this.typeTimer) {
      this.typeTimer.remove(false);
      this.typeTimer = null;
    }
    this.hintPulseTween?.stop();
    this.hintPulseTween = null;
    this.scene.tweens.killTweensOf(this.hintText);
    this.hintText.setAlpha(0);
    this.isTyping = false;
    this.unbindAdvance();
    if (this.pendingResolve) {
      const r = this.pendingResolve;
      this.pendingResolve = null;
      r();
    }
  }
}
