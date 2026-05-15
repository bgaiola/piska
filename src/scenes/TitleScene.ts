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

export class TitleScene extends Phaser.Scene {
  private localeUnsub: (() => void) | null = null;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.drawText();

    this.localeUnsub = i18n.onChange(() => {
      this.texts.forEach((t) => t.destroy());
      this.texts = [];
      this.drawText();
    });

    const unlockAndStart = (goToGame: boolean): void => {
      const bgm = BGMPlayer.get();
      bgm
        .unlock()
        .then(() => {
          if (goToGame) {
            this.scene.start('ModeSelectScene');
          } else if (!bgm.isUnlocked() || bgm.isUnlocked()) {
            bgm.play('title');
          }
        })
        .catch(() => {
          if (goToGame) this.scene.start('ModeSelectScene');
        });
    };

    const start = (): void => unlockAndStart(true);

    const playTitleOnFirstGesture = (): void => {
      BGMPlayer.get()
        .unlock()
        .then(() => BGMPlayer.get().play('title'))
        .catch(() => {});
    };

    this.input.once('pointermove', playTitleOnFirstGesture);
    this.input.keyboard?.once('keydown', playTitleOnFirstGesture);

    this.input.keyboard?.on('keydown-SPACE', start);
    this.input.keyboard?.on('keydown-ENTER', start);
    this.input.once('pointerdown', start);

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  private drawText(): void {
    const { width, height } = this.scale.gameSize;

    this.texts.push(
      this.add
        .text(width / 2, height * 0.3, 'PISKA', {
          fontFamily: 'monospace',
          fontSize: '48px',
          color: '#ffe',
        })
        .setOrigin(0.5),
    );

    this.texts.push(
      this.add
        .text(width / 2, height * 0.45, t('title.subtitle'), {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#bbf',
        })
        .setOrigin(0.5),
    );

    this.texts.push(
      this.add
        .text(width / 2, height * 0.6, t('title.prompt'), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#fff',
        })
        .setOrigin(0.5),
    );

    this.texts.push(
      this.add
        .text(width / 2, height * 0.85, t('title.dedication'), {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#bbb',
          align: 'center',
        })
        .setOrigin(0.5)
        .setLineSpacing(4),
    );
  }

  private cleanup(): void {
    if (this.localeUnsub) {
      this.localeUnsub();
      this.localeUnsub = null;
    }
    this.texts = [];
  }
}
