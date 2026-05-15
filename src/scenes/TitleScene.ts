/**
 * TitleScene — splash with the game title, dedicatória, and a big JOGAR
 * button.
 *
 * Kept deliberately minimal: every navigation path calls `this.scene.start`
 * synchronously without awaiting anything. Audio unlock and any other side
 * effect runs fire-and-forget so a stalled promise can never strand the
 * player on this screen.
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

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a0f1f');
    this.drawScreen();

    this.localeUnsub = i18n.onChange(() => this.drawScreen());

    this.input.keyboard?.on('keydown-SPACE', () => this.go());
    this.input.keyboard?.on('keydown-ENTER', () => this.go());

    this.game.events.on('layout-changed', this.drawScreen, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  private drawScreen(): void {
    this.destroyObjects();

    const { width, height } = this.scale.gameSize;

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
    // players who miss the button by a few pixels.
    this.input.on('pointerup', () => this.go());

    this.objects.push(btnBg, btnLabel);

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
