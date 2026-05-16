/**
 * ResultScene — universal end-of-run summary screen. Replaces the old
 * GameOverScene for every mode that produces a `ModeResultData` snapshot:
 * Endless (final score), Time Attack (score within time window), Stage Clear
 * (remaining blocks + clear time) and Puzzle (stars + moves used).
 *
 * Recording is fire-and-forget: we hand the snapshot to SaveManager before
 * drawing the prompt; if the user immediately taps to return, the save call
 * has already finished synchronously.
 *
 * Navigation:
 *   - Endless / Time Attack / Stage Clear → ModeSelectScene if registered,
 *     otherwise TitleScene as a graceful fallback.
 *   - Puzzle → same.
 *
 * For backward compatibility we keep `GameOverScene` registered, but
 * GameScene now routes every mode (including 'endless') through here.
 */

import Phaser from 'phaser';
import type { ModeResultData } from '@/modes/ModeBase';
import { SaveManager } from '@/save/SaveManager';
import { t } from '@/i18n';

export class ResultScene extends Phaser.Scene {
  private resultData!: ModeResultData;

  constructor() {
    super('ResultScene');
  }

  init(d: { result: ModeResultData }): void {
    this.resultData = d.result;
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    this.add.rectangle(0, 0, w, h, 0x10081a, 1).setOrigin(0, 0);
    this.add.rectangle(0, 0, w, 24, 0x000000, 0.35).setOrigin(0, 0);
    this.add.rectangle(0, h - 24, w, 24, 0x000000, 0.35).setOrigin(0, 0);

    // Header
    this.add
      .text(w / 2, h * 0.2, this.titleFor(this.resultData), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    // Score
    this.add
      .text(w / 2, h * 0.32, t('result.score', { n: this.resultData.score }), {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    // Time
    this.add
      .text(w / 2, h * 0.4, t('result.time', { t: this.fmt(this.resultData.timeMs) }), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaf',
      })
      .setOrigin(0.5);

    // Mode-specific extras
    let y = 0.5;
    if (this.resultData.mode === 'puzzle' && this.resultData.stars !== undefined) {
      const s = '★'.repeat(this.resultData.stars) + '☆'.repeat(3 - this.resultData.stars);
      this.add
        .text(w / 2, h * y, s, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#ff8',
        })
        .setOrigin(0.5);
      y += 0.06;
    }
    if (
      this.resultData.mode === 'puzzle' &&
      this.resultData.movesUsed !== undefined &&
      this.resultData.movesAllowed !== undefined
    ) {
      this.add
        .text(
          w / 2,
          h * y,
          t('result.moves', {
            used: this.resultData.movesUsed,
            allowed: this.resultData.movesAllowed,
          }),
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#aaf',
          },
        )
        .setOrigin(0.5);
      y += 0.06;
    }
    if (
      this.resultData.mode === 'stage-clear' &&
      this.resultData.remainingBlocks !== undefined
    ) {
      this.add
        .text(
          w / 2,
          h * y,
          t('result.remaining', { n: this.resultData.remainingBlocks }),
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#aaf',
          },
        )
        .setOrigin(0.5);
    }

    // Save high score
    SaveManager.get().recordResult(this.resultData);

    // Continue prompt
    this.add
      .text(w / 2, h * 0.78, t('result.prompt'), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#fff',
      })
      .setOrigin(0.5);

    const back = (): void => {
      this.scene.stop('GameScene');
      this.scene.stop('HUDScene');
      this.scene.stop('PauseScene');
      // ModeSelectScene is added by another agent; fall back to TitleScene if
      // it hasn't been registered yet.
      const targetKey = this.scene.manager.keys['ModeSelectScene']
        ? 'ModeSelectScene'
        : 'TitleScene';
      this.scene.start(targetKey);
      this.scene.stop();
    };
    this.input.keyboard?.on('keydown-SPACE', back);
    this.input.keyboard?.on('keydown-ENTER', back);
    this.input.once('pointerdown', back);
  }

  private titleFor(d: ModeResultData): string {
    switch (d.mode) {
      case 'endless':
        return t('result.endless');
      case 'time-attack':
        return t('result.timeattack');
      case 'stage-clear':
        return t('result.stageclear');
      case 'puzzle':
        return d.stars && d.stars >= 1
          ? t('result.puzzle.complete')
          : t('result.puzzle.retry');
      case 'vs-ai':
        return t('result.vs');
      default:
        return t('result.generic');
    }
  }

  private fmt(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
