/**
 * AboutScene — short credit screen reached from TitleScene's "?" button.
 *
 * Mirrors the night-sky backdrop of TitleScene so the player feels they
 * stepped into a quiet alcove of the same world. Layout is intentionally
 * minimal: title, dedicatória, version line, and a single VOLTAR action
 * that returns to TitleScene.
 */

import Phaser from 'phaser';
import { t, i18n } from '@/i18n';
import { PISKA_VERSION } from '@/config';
import { createBackButton, type BackButtonHandle } from '@/ui/BackButton';

export class AboutScene extends Phaser.Scene {
  private localeUnsub: (() => void) | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private backBtn: BackButtonHandle | null = null;

  constructor() {
    super('AboutScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a061a');
    this.drawBackdrop();
    this.drawScreen();
    this.localeUnsub = i18n.onChange(() => this.drawScreen());
    this.game.events.on('layout-changed', this.relayout, this);
    this.input.keyboard?.on('keydown-ESC', () => this.back());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.back());
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // Matches TitleScene's gradient so About reads as the same world.
  private drawBackdrop(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const g = this.add.graphics();
    const stops = [
      0x1a0a2e, 0x1d0b32, 0x1f0c36, 0x21103e, 0x231546, 0x231a4d,
      0x222054, 0x1f255a, 0x1c2a60, 0x192e65, 0x16336a, 0x14366f,
    ];
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    g.fillStyle(0x000000, 0.4);
    g.fillRect(0, 0, w, 28);
    g.fillRect(0, h - 28, w, 28);
    g.setDepth(-1000);
    this.objects.push(g);
  }

  private drawScreen(): void {
    this.destroyObjects();
    this.backBtn?.destroy();
    this.backBtn = createBackButton({
      scene: this,
      label: '← VOLTAR',
      onClick: () => this.back(),
    });

    const { width, height } = this.scale.gameSize;

    // Title wordmark — same family as TitleScene but smaller; reinforces the
    // visual identity without competing with the main splash.
    const wordmarkSize = Math.min(56, Math.floor(Math.min(width, height) * 0.10));
    this.objects.push(
      this.add
        .text(width / 2, height * 0.18, 'PISKA', {
          fontFamily: 'monospace',
          fontSize: `${wordmarkSize}px`,
          color: '#ffe',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setStroke('#5a3a78', 3),
    );

    // "SOBRE" heading.
    this.objects.push(
      this.add
        .text(width / 2, height * 0.30, t('about.heading'), {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#bbf',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    // Dedicatória — the core message.
    this.objects.push(
      this.add
        .text(width / 2, height * 0.45, t('about.dedication'), {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffe',
          align: 'center',
          wordWrap: { width: width - 40 },
        })
        .setOrigin(0.5)
        .setLineSpacing(8),
    );

    // Secondary line — short, intimate, sits below the dedication.
    this.objects.push(
      this.add
        .text(width / 2, height * 0.62, t('about.tagline'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aab',
          align: 'center',
          wordWrap: { width: width - 40 },
        })
        .setOrigin(0.5)
        .setLineSpacing(6),
    );

    // Version + a tiny heart to keep the tone warm.
    this.objects.push(
      this.add
        .text(width / 2, height - 36, `PISKA v${PISKA_VERSION}  •  ♥`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#8a7a98',
        })
        .setOrigin(0.5),
    );
  }

  private back(): void {
    this.scene.start('TitleScene');
  }

  private relayout(): void {
    this.drawScreen();
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
    this.game.events.off('layout-changed', this.relayout, this);
    this.backBtn?.destroy();
    this.backBtn = null;
    this.destroyObjects();
  }
}
