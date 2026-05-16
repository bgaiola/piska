/**
 * OnboardingScene — first-run tutorial overlay.
 *
 * Shown to a brand-new player BEFORE they reach a gameplay scene for the
 * first time. Three illustrated slides explain the core mechanics:
 * swapping pairs, chains, and the rising stack. Once finished (or skipped)
 * the SaveManager flag `onboardingSeen` is flipped so the scene never
 * fires again on the same profile.
 *
 * Routing: this scene always exits into GameScene → Endless mode. The
 * call-site (ModeSelectScene) only ever launches us for a first-run
 * player, and we deliberately ignore which mode they were aiming at —
 * dropping them into Endless gives them the gentlest sandbox to apply
 * what they just learned.
 */

import Phaser from 'phaser';
import { t, i18n } from '@/i18n';
import { SaveManager } from '@/save/SaveManager';
import { BLOCK_COLOR_HEX, darken } from '@/config';
import type { BlockColor } from '@/engine';

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';
const SUBTITLE_TEXT = '#bbb';

const TOTAL_SLIDES = 3;

export class OnboardingScene extends Phaser.Scene {
  private slide = 0;
  private rootContainer: Phaser.GameObjects.Container | null = null;
  private dotsContainer: Phaser.GameObjects.Container | null = null;
  private skipButton: Phaser.GameObjects.Container | null = null;
  private nextButton: Phaser.GameObjects.Container | null = null;
  private backdropGfx: Phaser.GameObjects.Graphics | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private bodyText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private localeUnsub: (() => void) | null = null;
  private finished = false;

  constructor() {
    super('OnboardingScene');
  }

  init(): void {
    this.slide = 0;
    this.finished = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#08030f');
    this.drawBackdrop();
    this.drawSlide();
    this.bindKeyboard();

    this.game.events.on('layout-changed', this.relayout, this);
    this.localeUnsub = i18n.onChange(() => this.drawSlide());

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Backdrop — slim adaptation of the gradient technique used in VsScene.
  // Kept local on purpose so this scene has no inter-scene coupling.
  // ---------------------------------------------------------------------------

  private drawBackdrop(): void {
    if (this.backdropGfx) {
      this.backdropGfx.destroy();
      this.backdropGfx = null;
    }
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const g = this.add.graphics();
    const stops = [
      0x10061e, 0x150924, 0x1a0b2a, 0x1d0c30,
      0x210d34, 0x250e38, 0x290e3a, 0x2a0d3a,
      0x290c36, 0x260b30, 0x21092a, 0x1b0824,
    ];
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, w, 24);
    g.fillRect(0, h - 24, w, 24);
    g.setDepth(-1000);
    this.backdropGfx = g;
  }

  // ---------------------------------------------------------------------------
  // Slide composition
  // ---------------------------------------------------------------------------

  private drawSlide(): void {
    this.destroySlideContent();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const compact = h < 480;

    const titleY = compact ? 32 : 48;
    const slideKey = `onboarding.slide${this.slide + 1}`;

    this.titleText = this.add
      .text(w / 2, titleY, t(`${slideKey}.title`), {
        fontFamily: 'monospace',
        fontSize: compact ? '18px' : '22px',
        color: FOCUS_TEXT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Illustration: a Phaser container so we can position + clear it as one
    // unit on relayout. Each slide draws into a fresh container.
    const illustrationY = compact ? Math.floor(h * 0.40) : Math.floor(h * 0.42);
    this.rootContainer = this.add.container(w / 2, illustrationY);
    this.drawIllustration(this.rootContainer, this.slide);

    const bodyY = compact ? Math.floor(h * 0.62) : Math.floor(h * 0.66);
    this.bodyText = this.add
      .text(w / 2, bodyY, t(`${slideKey}.body`), {
        fontFamily: 'monospace',
        fontSize: compact ? '11px' : '13px',
        color: UNFOCUS_TEXT,
        align: 'center',
        wordWrap: { width: Math.min(420, w - 48) },
      })
      .setOrigin(0.5);

    // Progress dots — three pips so the player sees where they are.
    this.dotsContainer = this.buildDots(w / 2, compact ? bodyY + 48 : bodyY + 60);

    // Skip (left) + Next/Start (right) at the bottom of the screen.
    const buttonY = h - (compact ? 36 : 48);
    this.skipButton = this.buildButton(
      Math.floor(w / 2) - 110,
      buttonY,
      t('onboarding.skip'),
      () => this.finish(true),
    );
    const nextLabel =
      this.slide === TOTAL_SLIDES - 1
        ? t('onboarding.start')
        : t('onboarding.next');
    this.nextButton = this.buildButton(
      Math.floor(w / 2) + 110,
      buttonY,
      nextLabel,
      () => this.advance(),
      /* primary */ true,
    );

    this.hintText = this.add
      .text(w / 2, buttonY + (compact ? 22 : 28), '← → / Enter / Esc', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: SUBTITLE_TEXT,
      })
      .setOrigin(0.5);
  }

  private buildDots(cx: number, cy: number): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const spacing = 14;
    const startX = -((TOTAL_SLIDES - 1) * spacing) / 2;
    for (let i = 0; i < TOTAL_SLIDES; i++) {
      const filled = i === this.slide;
      const dot = this.add.circle(
        startX + i * spacing,
        0,
        filled ? 5 : 4,
        filled ? FOCUS_COLOR : 0x4a3a5a,
        1,
      );
      c.add(dot);
    }
    return c;
  }

  private buildButton(
    cx: number,
    cy: number,
    label: string,
    onClick: () => void,
    primary = false,
  ): Phaser.GameObjects.Container {
    const w = 160;
    const h = 36;
    const container = this.add.container(cx, cy);
    const fill = primary ? 0x36204c : 0x251338;
    const stroke = primary ? FOCUS_COLOR : UNFOCUS_COLOR;
    const bg = this.add
      .rectangle(0, 0, w, h, fill, 0.95)
      .setStrokeStyle(2, stroke, 1);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: primary ? FOCUS_TEXT : UNFOCUS_TEXT,
        fontStyle: primary ? 'bold' : 'normal',
      })
      .setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(w, h);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, FOCUS_COLOR, 1);
      bg.setFillStyle(primary ? 0x4a2e64 : 0x36204c, 0.95);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, stroke, 1);
      bg.setFillStyle(fill, 0.95);
    });
    bg.on('pointerdown', () => onClick());

    return container;
  }

  // ---------------------------------------------------------------------------
  // Per-slide illustrations — pure Graphics + Text so we don't depend on
  // any preloaded asset and the scene works offline / first-frame.
  // ---------------------------------------------------------------------------

  private drawIllustration(parent: Phaser.GameObjects.Container, slide: number): void {
    if (slide === 0) this.drawSlide1(parent);
    else if (slide === 1) this.drawSlide2(parent);
    else this.drawSlide3(parent);
  }

  /** Slide 1 — three blocks with a swap cursor and a left/right arrow. */
  private drawSlide1(parent: Phaser.GameObjects.Container): void {
    const cell = 28;
    const colors: BlockColor[] = ['red', 'blue', 'yellow'];
    const totalW = cell * colors.length + 8 * (colors.length - 1);
    const startX = -totalW / 2 + cell / 2;
    colors.forEach((color, i) => {
      const cx = startX + i * (cell + 8);
      this.drawBlock(parent, cx, 0, cell, color);
    });

    // Cursor outline covers blocks 0 and 1 (the swap pair).
    const cursorW = cell * 2 + 8;
    const cursorH = cell + 6;
    const cursorCx = startX + (cell + 8) / 2;
    const cursorBox = this.add.graphics();
    cursorBox.lineStyle(2, 0xffffee, 0.9);
    cursorBox.strokeRoundedRect(
      cursorCx - cursorW / 2,
      -cursorH / 2,
      cursorW,
      cursorH,
      4,
    );
    parent.add(cursorBox);

    // Swap arrows under the cursor.
    const arrowY = cell / 2 + 16;
    const arrows = this.add
      .text(cursorCx, arrowY, '◀  ▶', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe',
      })
      .setOrigin(0.5);
    parent.add(arrows);
  }

  /** Slide 2 — two stacked rows of blocks plus down-arrows showing the fall. */
  private drawSlide2(parent: Phaser.GameObjects.Container): void {
    const cell = 26;
    const cols = 3;
    const totalW = cell * cols + 6 * (cols - 1);
    const startX = -totalW / 2 + cell / 2;

    // Top row (will fall after bottom clears).
    const topColors: BlockColor[] = ['purple', 'cyan', 'green'];
    topColors.forEach((color, i) => {
      const cx = startX + i * (cell + 6);
      this.drawBlock(parent, cx, -cell - 4, cell, color);
    });

    // Bottom row — three of the same color (about to clear).
    const bottomColor: BlockColor = 'red';
    for (let i = 0; i < cols; i++) {
      const cx = startX + i * (cell + 6);
      this.drawBlock(parent, cx, 0, cell, bottomColor, /* flash */ true);
    }

    // Three downward arrows between the rows to show the chain drop.
    const arrowY = -cell / 2 - 2;
    for (let i = 0; i < cols; i++) {
      const cx = startX + i * (cell + 6);
      const a = this.add
        .text(cx, arrowY, '▼', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffcc55',
        })
        .setOrigin(0.5);
      parent.add(a);
    }

    // "x2" badge on the right to suggest the chain multiplier.
    const badgeX = totalW / 2 + 28;
    const badge = this.add
      .text(badgeX, -cell / 2, 'CHAIN x2', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffcc55',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    parent.add(badge);
  }

  /** Slide 3 — a miniature board with a tall stack + a warning glyph. */
  private drawSlide3(parent: Phaser.GameObjects.Container): void {
    const cell = 12;
    const cols = 6;
    const rows = 8;
    const boardW = cols * cell;
    const boardH = rows * cell;
    const ox = -boardW / 2;
    const oy = -boardH / 2;

    // Frame.
    const frame = this.add.graphics();
    frame.fillStyle(0x0a0612, 0.85);
    frame.fillRect(ox, oy, boardW, boardH);
    frame.lineStyle(2, 0x5a3a72, 1);
    frame.strokeRect(ox - 1, oy - 1, boardW + 2, boardH + 2);
    parent.add(frame);

    // Stack near the top: fill the upper 6 of 8 rows with random-ish blocks.
    const palette: BlockColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan'];
    // Deterministic pattern so the illustration looks the same on every run.
    const pattern: BlockColor[][] = [
      ['red', 'blue', 'green', 'yellow', 'purple', 'cyan'],
      ['blue', 'green', 'yellow', 'purple', 'cyan', 'red'],
      ['green', 'yellow', 'purple', 'cyan', 'red', 'blue'],
      ['yellow', 'purple', 'cyan', 'red', 'blue', 'green'],
      ['purple', 'cyan', 'red', 'blue', 'green', 'yellow'],
      ['cyan', 'red', 'blue', 'green', 'yellow', 'purple'],
    ];
    for (let r = 0; r < pattern.length; r++) {
      for (let c = 0; c < cols; c++) {
        const row = pattern[r];
        if (!row) continue;
        const color = row[c] ?? palette[c % palette.length];
        if (!color) continue;
        const cx = ox + c * cell + cell / 2;
        const cy = oy + r * cell + cell / 2;
        this.drawBlock(parent, cx, cy, cell, color);
      }
    }

    // Top-of-board red warning bar.
    const warnBar = this.add.graphics();
    warnBar.lineStyle(2, 0xff5555, 0.95);
    warnBar.strokeRect(ox - 1, oy - 1, boardW + 2, 4);
    parent.add(warnBar);

    // Warning glyph to the right of the board.
    const warn = this.add
      .text(boardW / 2 + 22, oy + 8, '!', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ff5555',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    parent.add(warn);
  }

  /** Small colored square with darker outline. */
  private drawBlock(
    parent: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    size: number,
    color: BlockColor,
    flash = false,
  ): void {
    const fill = flash ? 0xffffff : BLOCK_COLOR_HEX[color];
    const outline = darken(BLOCK_COLOR_HEX[color], 0.5);
    const rect = this.add.rectangle(cx, cy, size - 2, size - 2, fill, 1);
    rect.setStrokeStyle(1, outline, 1);
    parent.add(rect);
  }

  // ---------------------------------------------------------------------------
  // Input + navigation
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    const onDown = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.advance();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.retreat();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.advance();
          break;
        case 'Escape':
          e.preventDefault();
          this.finish(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyHandler = onDown;
  }

  private advance(): void {
    if (this.slide >= TOTAL_SLIDES - 1) {
      this.finish(false);
      return;
    }
    this.slide += 1;
    this.drawSlide();
  }

  private retreat(): void {
    if (this.slide <= 0) return;
    this.slide -= 1;
    this.drawSlide();
  }

  private finish(skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    SaveManager.get().setOnboardingSeen(true);
    // Either path routes the first-time player into Endless mode. Skipped
    // players still get the same beginner-friendly destination — the
    // tutorial flag prevents this scene from ever firing again.
    void skipped; // intentional: same destination for both branches.
    this.scene.start('GameScene', { mode: 'endless' });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    this.drawBackdrop();
    this.drawSlide();
  }

  private destroySlideContent(): void {
    this.titleText?.destroy();
    this.bodyText?.destroy();
    this.hintText?.destroy();
    this.dotsContainer?.destroy(true);
    this.skipButton?.destroy(true);
    this.nextButton?.destroy(true);
    this.rootContainer?.destroy(true);
    this.titleText = null;
    this.bodyText = null;
    this.hintText = null;
    this.dotsContainer = null;
    this.skipButton = null;
    this.nextButton = null;
    this.rootContainer = null;
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.localeUnsub) {
      this.localeUnsub();
      this.localeUnsub = null;
    }
    this.destroySlideContent();
    if (this.backdropGfx) {
      this.backdropGfx.destroy();
      this.backdropGfx = null;
    }
  }
}
