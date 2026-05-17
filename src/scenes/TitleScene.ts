/**
 * TitleScene — splash with the game title, dedicatória, and a big JOGAR
 * button.
 *
 * Kept deliberately minimal: every navigation path calls `this.scene.start`
 * synchronously without awaiting anything. Audio unlock and any other side
 * effect runs fire-and-forget so a stalled promise can never strand the
 * player on this screen.
 *
 * Polish layer:
 *   - drawBackdrop() paints a 12-stripe night-sky gradient (deep purple →
 *     midnight blue) at depth -1000, plus ~12 twinkling "star" dots tweened
 *     between two alphas.
 *   - The PISKA wordmark gets a soft purple stroke + duplicated offset glow
 *     beneath it so it pops off the dark background.
 *   - The JOGAR button gently scale-yoyos so the eye is drawn to it.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { t, i18n } from '@/i18n';

const BTN_FILL_IDLE = 0x3a1e58;
const BTN_FILL_PRESSED = 0x5a3a78;
const BTN_STROKE = 0xffcc55;

const STAR_COUNT = 12;

export class TitleScene extends Phaser.Scene {
  private localeUnsub: (() => void) | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private backdropGfx: Phaser.GameObjects.Graphics | null = null;
  private stars: Phaser.GameObjects.Rectangle[] = [];
  private starTweens: Phaser.Tweens.Tween[] = [];
  private btnPulseTween: Phaser.Tweens.Tween | null = null;
  // Set by the About-pill pointerdown so the canvas-wide pointerup handler
  // skips starting the game on the same tap.
  private suppressNextTapToPlay = false;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a061a');
    this.drawBackdrop();
    this.drawScreen();

    this.localeUnsub = i18n.onChange(() => this.drawScreen());

    this.input.keyboard?.on('keydown-SPACE', () => this.go());
    this.input.keyboard?.on('keydown-ENTER', () => this.go());

    this.game.events.on('layout-changed', this.relayout, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  /**
   * Paints a 12-stripe vertical gradient (deep night-sky purple → midnight
   * blue) and a soft top/bottom vignette. Drawn once at depth -1000 so it
   * sits beneath every other game object.
   */
  private drawBackdrop(): void {
    this.destroyBackdrop();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const g = this.add.graphics();

    // Deep night-sky purple at the top fading to midnight blue at the
    // horizon. 12 stops feels smooth without needing a real gradient fill.
    const stops = [
      0x1a0a2e, 0x1d0b32, 0x1f0c36, 0x21103e, 0x231546, 0x231a4d,
      0x222054, 0x1f255a, 0x1c2a60, 0x192e65, 0x16336a, 0x14366f,
    ];
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    // Soft vignette top + bottom so the eye lands on the wordmark.
    g.fillStyle(0x000000, 0.4);
    g.fillRect(0, 0, w, 28);
    g.fillRect(0, h - 28, w, 28);
    g.setDepth(-1000);
    this.backdropGfx = g;

    // Scatter ~12 procedural 2x2 stars across the upper two-thirds (where the
    // sky is darkest). Each one yoyos alpha on its own slightly randomised
    // schedule so the cluster sparkles rather than blinks in unison.
    const skyBottom = Math.floor(h * 0.7);
    for (let i = 0; i < STAR_COUNT; i++) {
      const sx = Math.floor(Math.random() * (w - 8)) + 4;
      const sy = Math.floor(Math.random() * (skyBottom - 8)) + 4;
      const star = this.add.rectangle(sx, sy, 2, 2, 0xfff4d6, 1).setDepth(-999);
      this.stars.push(star);
      const tween = this.tweens.add({
        targets: star,
        alpha: 0.2,
        yoyo: true,
        repeat: -1,
        duration: 1200 + Math.floor(Math.random() * 1400),
        delay: Math.floor(Math.random() * 1600),
        ease: 'Sine.easeInOut',
      });
      this.starTweens.push(tween);
    }
  }

  private drawScreen(): void {
    this.destroyObjects();
    this.btnPulseTween?.stop();
    this.btnPulseTween = null;

    const { width, height } = this.scale.gameSize;

    const wordmarkSize = Math.min(96, Math.floor(Math.min(width, height) * 0.18));

    // Soft glow layer: a slightly larger, dimmer copy of the wordmark sitting
    // a couple pixels below the real one so the title appears to float above
    // the night sky.
    const glow = this.add
      .text(width / 2 + 2, height * 0.22 + 3, 'PISKA', {
        fontFamily: 'monospace',
        fontSize: `${wordmarkSize}px`,
        color: '#5a3a78',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0.55);
    this.objects.push(glow);

    const wordmark = this.add
      .text(width / 2, height * 0.22, 'PISKA', {
        fontFamily: 'monospace',
        fontSize: `${wordmarkSize}px`,
        color: '#ffe',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    wordmark.setStroke('#5a3a78', 4);
    this.objects.push(wordmark);

    this.objects.push(
      this.add
        .text(width / 2, height * 0.32, t('title.subtitle'), {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#bbf',
        })
        .setOrigin(0.5),
    );

    const btnW = Math.min(280, Math.max(200, width * 0.7));
    const btnH = 72;
    const btnY = height * 0.55;
    const btnBg = this.add
      .rectangle(width / 2, btnY, btnW, btnH, BTN_FILL_IDLE, 1)
      .setStrokeStyle(3, BTN_STROKE, 1);
    const btnLabel = this.add
      .text(width / 2, btnY, t('title.cta'), {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffe',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Use pointerup, not pointerdown. On iOS Safari pointerdown sometimes
    // races with the audio-unlock microtask and the synthetic click event,
    // leaving the handler stranded. pointerup is what mobile users expect
    // ("button fires when finger lifts") and fires reliably.
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => btnBg.setFillStyle(BTN_FILL_PRESSED, 1));
    btnBg.on('pointerout', () => btnBg.setFillStyle(BTN_FILL_IDLE, 1));
    btnBg.on('pointerup', () => this.go());

    // Tap anywhere on the canvas also starts the game — a safety net for
    // players who miss the button by a few pixels. The About-pill handler
    // sets `this.suppressNextTapToPlay` so its tap doesn't double-fire as
    // both "open about" and "start game".
    this.input.on('pointerup', () => {
      if (this.suppressNextTapToPlay) {
        this.suppressNextTapToPlay = false;
        return;
      }
      this.go();
    });

    this.objects.push(btnBg, btnLabel);

    // Subtle scale yoyo (1.00 → 1.04) on both the button and its label so
    // they breathe together. Phaser tweens accept Container-less paired
    // targets fine.
    this.btnPulseTween = this.tweens.add({
      targets: [btnBg, btnLabel],
      scale: { from: 1, to: 1.04 },
      duration: 1500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.objects.push(
      this.add
        .text(width / 2, btnY + btnH / 2 + 18, t('title.prompt'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#9a8aa8',
        })
        .setOrigin(0.5),
    );

    this.objects.push(
      this.add
        .text(width / 2, height - 32, t('title.dedication'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#8a7a98',
          align: 'center',
          wordWrap: { width: width - 32 },
        })
        .setOrigin(0.5, 1)
        .setLineSpacing(4),
    );

    // Small "SOBRE" pill in the bottom-right corner. Tap-only — the player
    // never NEEDS to see this scene to play, so we keep it out of keyboard
    // focus and hint flow. The dedicatória above gives players who don't
    // tap a hint that there's more story behind the game.
    const aboutBtn = this.add.container(width - 18, 18);
    const aboutBg = this.add
      .rectangle(0, 0, 70, 26, 0x251338, 0.9)
      .setStrokeStyle(2, 0xffcc55, 1);
    const aboutLabel = this.add
      .text(0, 0, t('title.about'), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffe',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    aboutBtn.add([aboutBg, aboutLabel]);
    aboutBtn.setSize(70, 26);
    aboutBg.setInteractive({ useHandCursor: true });
    aboutBg.on('pointerover', () => {
      aboutBg.setFillStyle(0x36204c, 0.95);
    });
    aboutBg.on('pointerout', () => {
      aboutBg.setFillStyle(0x251338, 0.9);
    });
    aboutBg.on('pointerdown', () => {
      // Flag the pending pointerup so the canvas-wide handler does not also
      // start the game on the same finger lift.
      this.suppressNextTapToPlay = true;
    });
    aboutBg.on('pointerup', () => {
      this.scene.start('AboutScene');
    });
    this.objects.push(aboutBtn);
  }

  private go(): void {
    // Fire-and-forget audio unlock; navigation must not depend on it.
    try {
      BGMPlayer.get()
        .unlock()
        .catch(() => {});
    } catch {
      /* ignore */
    }
    this.scene.start('ModeSelectScene');
  }

  private relayout(): void {
    this.drawBackdrop();
    this.drawScreen();
  }

  private destroyObjects(): void {
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
  }

  private destroyBackdrop(): void {
    this.starTweens.forEach((tw) => tw.stop());
    this.starTweens = [];
    this.stars.forEach((s) => s.destroy());
    this.stars = [];
    this.backdropGfx?.destroy();
    this.backdropGfx = null;
  }

  private cleanup(): void {
    if (this.localeUnsub) {
      this.localeUnsub();
      this.localeUnsub = null;
    }
    this.game.events.off('layout-changed', this.relayout, this);
    this.btnPulseTween?.stop();
    this.btnPulseTween = null;
    this.destroyObjects();
    this.destroyBackdrop();
  }
}
