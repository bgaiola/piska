/**
 * TitleScene — splash with the game title, dedicatória, and a "press to play"
 * prompt. Space / Enter / pointerdown all start GameScene.
 *
 * Text uses the i18n runtime, but the dedicatória and "PISKA" wordmark are
 * read from the locale dictionary so each translation may render them in its
 * own form. The dedicatória is a sacred string — every locale honors it.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { t, i18n } from '@/i18n';

const BTN_FILL_IDLE = 0x3a1e58;
const BTN_FILL_PRESSED = 0x5a3a78;
const BTN_STROKE = 0xffcc55;

export class TitleScene extends Phaser.Scene {
  private localeUnsub: (() => void) | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private started = false;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a0f1f');
    this.drawScreen();

    this.localeUnsub = i18n.onChange(() => this.drawScreen());

    this.input.keyboard?.on('keydown-SPACE', () => this.start());
    this.input.keyboard?.on('keydown-ENTER', () => this.start());

    // Belt and suspenders: any tap on the canvas also starts the game. The
    // big JOGAR button is still the primary visual target, but a missed tap
    // a few pixels off shouldn't feel unresponsive.
    this.input.on('pointerdown', () => this.start());

    // Unlock audio + start title music on the first user gesture. Done as a
    // one-shot listener so we don't fight the "tap to start" handler above.
    const unlockOnce = (): void => {
      BGMPlayer.get()
        .unlock()
        .then(() => BGMPlayer.get().play('title'))
        .catch(() => {});
    };
    this.input.once('pointerdown', unlockOnce);
    this.input.keyboard?.once('keydown', unlockOnce);

    this.game.events.on('layout-changed', this.drawScreen, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  private drawScreen(): void {
    this.destroyObjects();

    const { width, height } = this.scale.gameSize;

    // Wordmark: scale with the smaller dimension so it never overflows.
    const wordmarkSize = Math.min(96, Math.floor(Math.min(width, height) * 0.18));
    this.objects.push(
      this.add
        .text(width / 2, height * 0.22, 'PISKA', {
          fontFamily: 'monospace',
          fontSize: `${wordmarkSize}px`,
          color: '#ffe',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    this.objects.push(
      this.add
        .text(width / 2, height * 0.32, t('title.subtitle'), {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#bbf',
        })
        .setOrigin(0.5),
    );

    // Primary CTA: a real button so mobile users have something obvious to
    // tap. Width adapts to viewport; height stays comfortable on touch.
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

    // Visible state: pressed colour on press; idle colour otherwise. We don't
    // tween or chain anything here — the click handler must do as little as
    // possible before scene.start() so a malformed effect can't strand the
    // player on this screen.
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.start());
    btnBg.on('pointerover', () => btnBg.setFillStyle(BTN_FILL_PRESSED, 1));
    btnBg.on('pointerout', () => btnBg.setFillStyle(BTN_FILL_IDLE, 1));

    this.objects.push(btnBg, btnLabel);

    // Subtle prompt below the button — keyboard hint for desktop players.
    this.objects.push(
      this.add
        .text(width / 2, btnY + btnH / 2 + 18, t('title.prompt'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#9a8aa8',
        })
        .setOrigin(0.5),
    );

    // Dedicatória pinned to the bottom with safe-area-conscious padding.
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
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    // Fire-and-forget audio unlock. On iOS Safari the resume() promise can
    // stall silently when called outside the actual gesture context (e.g.
    // when chained behind a tween), which used to leave the player stranded
    // on the title screen. Navigation must not depend on audio.
    try {
      BGMPlayer.get()
        .unlock()
        .catch(() => {});
    } catch {
      /* ignore — BGM is non-critical */
    }
    this.scene.start('ModeSelectScene');
  }

  private destroyObjects(): void {
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
  }

  private cleanup(): void {
    if (this.localeUnsub) {
      this.localeUnsub();
      this.localeUnsub = null;
    }
    this.game.events.off('layout-changed', this.drawScreen, this);
    this.destroyObjects();
  }
}
