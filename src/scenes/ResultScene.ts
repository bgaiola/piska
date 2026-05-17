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
 * Cinematic treatment (fase 4 "FODA" polish):
 *   - 12-stripe vertical gradient backdrop mirroring GameScene so the
 *     result screen feels like the same world as the playfield.
 *   - Score number tweens from 0 → final over ~700ms with Cubic.easeOut.
 *     The text is rewritten each frame inside `onUpdate` from a tracked
 *     numeric property.
 *   - Puzzle / stage-clear: 3 stars staggered fade+scale in with
 *     Back.easeOut; filled = bright gold ★, unfilled = grey ☆.
 *   - NEW HIGH SCORE detection: we compare against SaveManager's previous
 *     high BEFORE recording the result, then pop a gold "NOVO RECORDE!"
 *     badge with a gentle scale-pulse when the run beats it.
 *   - Filled "Retry" / "Menu" action buttons styled to match VsResultScene.
 *
 * Navigation:
 *   - Retry → re-launch GameScene with `{ mode: result.mode }`. Puzzle
 *     restart loses the specific `puzzleId` (we don't get it back from the
 *     result snapshot) and falls back to the first authored puzzle, which
 *     is the same fallback the scene already uses on cold boot.
 *   - Menu  → ModeSelectScene if registered, otherwise TitleScene.
 *
 * For backward compatibility we keep `GameOverScene` registered, but
 * GameScene now routes every mode (including 'endless') through here.
 */

import Phaser from 'phaser';
import type { ModeResultData } from '@/modes/ModeBase';
import { SaveManager } from '@/save/SaveManager';
import { t } from '@/i18n';
import { PUZZLES, getPuzzleById } from '@/data/puzzles';

const FOCUS_STROKE = 0xffeecc;
const UNFOCUS_STROKE = 0x777777;
const FOCUS_FILL = 0x36204c;
const UNFOCUS_FILL = 0x251338;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';
const BTN_W = 240;
const BTN_H = 42;

type ActionKey = 'retry' | 'menu' | 'next';

interface ActionCard {
  key: ActionKey;
  container: Phaser.GameObjects.Container;
}

export class ResultScene extends Phaser.Scene {
  private resultData!: ModeResultData;
  private actions: ActionCard[] = [];
  private cursor = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  // Box used as the tween target for the count-up score animation. We keep
  // it on `this` so the tween can be torn down on shutdown.
  private scoreTrack = { value: 0 };
  private scoreTween: Phaser.Tweens.Tween | null = null;
  private scoreText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('ResultScene');
  }

  init(d: { result: ModeResultData }): void {
    this.resultData = d.result;
    this.actions = [];
    this.cursor = 0;
    this.scoreTrack = { value: 0 };
    this.scoreTween = null;
    this.scoreText = null;
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    // Opaque base so the paused GameScene doesn't bleed through, then the
    // gradient on top — exact same palette as GameScene.drawBackdrop().
    this.add.rectangle(0, 0, w, h, 0x10081a, 1).setOrigin(0, 0);
    this.drawGradient(w, h);
    this.add.rectangle(0, 0, w, 24, 0x000000, 0.35).setOrigin(0, 0);
    this.add.rectangle(0, h - 24, w, 24, 0x000000, 0.35).setOrigin(0, 0);

    // Detect a new high score BEFORE recording the result so we compare
    // against the old value.
    const prevHigh = SaveManager.get().getHighScore(this.resultData.mode);
    const isNewHigh = this.resultData.score > prevHigh;

    // Header (mode title)
    this.add
      .text(w / 2, h * 0.18, this.titleFor(this.resultData), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    // Stars row (puzzle + any mode that exposes star ratings)
    if (this.resultData.stars !== undefined) {
      this.drawStars(w / 2, h * 0.28, this.resultData.stars);
    }

    // "NOVO RECORDE!" badge, only when applicable. Sits above the score.
    if (isNewHigh && this.resultData.score > 0) {
      this.drawNewRecordBadge(w / 2, h * 0.38);
    }

    // SCORE label + animated count-up. We use two separate Text nodes so the
    // label stays static while the number tweens.
    this.add
      .text(w / 2, h * 0.45, 'SCORE', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#bbb',
      })
      .setOrigin(0.5);

    const scoreText = this.add
      .text(w / 2, h * 0.52, '0', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffe',
      })
      .setOrigin(0.5);
    this.scoreText = scoreText;
    this.animateScore(this.resultData.score);

    // Time + mode-specific extras stacked under the score.
    let y = 0.6;
    this.add
      .text(w / 2, h * y, t('result.time', { t: this.fmt(this.resultData.timeMs) }), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaf',
      })
      .setOrigin(0.5);
    y += 0.05;

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
      y += 0.05;
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

    // Save high score (after the comparison above).
    SaveManager.get().recordResult(this.resultData);

    // Action buttons — vertically stacked. For puzzle wins we show
    // [Próximo, Refazer, Menu]: clearing this puzzle unlocked the next, so
    // the natural default is to move forward instead of re-doing.
    const nextPuzzleId = this.nextPuzzleId();
    if (nextPuzzleId !== null) {
      this.buildAction(w / 2, h * 0.7, 'next', t('result.puzzle.next'));
      this.buildAction(w / 2, h * 0.77, 'retry', t('result.puzzle.retry'));
      this.buildAction(w / 2, h * 0.84, 'menu', t('vs.back'));
    } else {
      this.buildAction(w / 2, h * 0.74, 'retry', t('result.puzzle.retry'));
      this.buildAction(w / 2, h * 0.82, 'menu', t('vs.back'));
    }

    // Hint line at the bottom — reused from the Vs hint key.
    this.add
      .text(w / 2, h - 18, t('vs.hint'), {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#bbb',
      })
      .setOrigin(0.5);

    this.refreshFocus();
    this.bindInput();

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Backdrop
  // ---------------------------------------------------------------------------

  private drawGradient(w: number, h: number): void {
    // Same 12 stops as GameScene.drawBackdrop() — deep indigo top → warm
    // dawn bottom — so the result screen reads as the same world.
    const stops = [
      0x0e0420, 0x140628, 0x180830, 0x1d0a37, 0x230d3d, 0x281143,
      0x2e1547, 0x331848, 0x381844, 0x3a163d, 0x3a1334, 0x35102c,
    ];
    const g = this.add.graphics();
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    g.setDepth(-1000);
  }

  // ---------------------------------------------------------------------------
  // Stars / record badge / score animation
  // ---------------------------------------------------------------------------

  private drawStars(cx: number, cy: number, stars: number): void {
    const spacing = 36;
    const size = 30;
    const safeStars = Math.max(0, Math.min(3, stars));
    for (let i = 0; i < 3; i++) {
      const filled = i < safeStars;
      const star = this.add
        .text((i - 1) * spacing + cx, cy, filled ? '★' : '☆', {
          fontFamily: 'monospace',
          fontSize: `${size}px`,
          color: filled ? '#ffe35a' : '#888',
          stroke: '#1a0a22',
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      if (filled) {
        star.setAlpha(0).setScale(0.2);
        this.tweens.add({
          targets: star,
          alpha: 1,
          scale: 1,
          duration: 280,
          delay: 200 + i * 280,
          ease: 'Back.easeOut',
        });
      } else {
        star.setAlpha(0.7);
      }
    }
  }

  private drawNewRecordBadge(cx: number, cy: number): void {
    const badge = this.add
      .text(cx, cy, 'NOVO RECORDE!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffe35a',
        stroke: '#3a1a02',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    // Quick pop on enter, then a soft yoyo scale-pulse for emphasis.
    badge.setScale(0.6).setAlpha(0);
    this.tweens.add({
      targets: badge,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: badge,
          scale: 1.08,
          duration: 700,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      },
    });
  }

  private animateScore(target: number): void {
    const text = this.scoreText;
    if (text === null) return;
    if (target <= 0) {
      text.setText('0');
      return;
    }
    this.scoreTrack.value = 0;
    text.setText('0');
    this.scoreTween = this.tweens.add({
      targets: this.scoreTrack,
      value: target,
      duration: 700,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const v = Math.floor(this.scoreTrack.value);
        text.setText(String(v));
      },
      onComplete: () => {
        text.setText(String(target));
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Action buttons
  // ---------------------------------------------------------------------------

  private buildAction(cx: number, cy: number, key: ActionKey, label: string): void {
    const idx = this.actions.length;
    const container = this.add.container(cx, cy);
    const bg = this.add
      .rectangle(0, 0, BTN_W, BTN_H, UNFOCUS_FILL, 0.95)
      .setStrokeStyle(2, UNFOCUS_STROKE, 1);
    bg.setName('bg');

    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0.5);
    text.setName('label');

    container.add([bg, text]);
    container.setSize(BTN_W, BTN_H);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      this.cursor = idx;
      this.refreshFocus();
    });
    bg.on('pointerdown', () => {
      this.cursor = idx;
      this.refreshFocus();
      this.confirm();
    });

    this.actions.push({ key, container });
  }

  private refreshFocus(): void {
    this.actions.forEach((a, idx) => {
      const focused = idx === this.cursor;
      const bg = a.container.getByName('bg') as Phaser.GameObjects.Rectangle | null;
      const label = a.container.getByName('label') as Phaser.GameObjects.Text | null;
      if (bg !== null) {
        bg.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_STROKE : UNFOCUS_STROKE, 1);
        bg.setFillStyle(focused ? FOCUS_FILL : UNFOCUS_FILL, 0.95);
      }
      if (label !== null) {
        label.setColor(focused ? FOCUS_TEXT : UNFOCUS_TEXT);
      }
      // Tween the scale so swapping focus doesn't snap.
      this.tweens.killTweensOf(a.container);
      this.tweens.add({
        targets: a.container,
        scale: focused ? 1.05 : 1,
        duration: focused ? 140 : 90,
        ease: focused ? 'Back.easeOut' : 'Sine.easeOut',
      });
    });
  }

  private bindInput(): void {
    const move = (delta: number): void => {
      const count = this.actions.length;
      if (count === 0) return;
      this.cursor = (this.cursor + delta + count) % count;
      this.refreshFocus();
    };

    const onDown = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'w':
        case 'W':
          e.preventDefault();
          move(-1);
          break;
        case 'ArrowDown':
        case 'ArrowRight':
        case 's':
        case 'S':
          e.preventDefault();
          move(1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.confirm();
          break;
        case 'Escape':
          e.preventDefault();
          this.goMenu();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyHandler = onDown;
  }

  private confirm(): void {
    const action = this.actions[this.cursor];
    if (!action) return;
    if (action.key === 'retry') {
      this.goRetry();
    } else if (action.key === 'next') {
      this.goNextPuzzle();
    } else {
      this.goMenu();
    }
  }

  private goRetry(): void {
    this.scene.stop('GameScene');
    this.scene.stop('HUDScene');
    this.scene.stop('PauseScene');
    // Re-launch GameScene with the same mode kind, forwarding the puzzle id
    // when we have one so Refazer goes back into the SAME puzzle instead of
    // falling back to the first catalog entry.
    const payload: { mode: string; puzzleId?: string } = {
      mode: this.resultData.mode,
    };
    if (this.resultData.mode === 'puzzle' && this.resultData.puzzleId) {
      payload.puzzleId = this.resultData.puzzleId;
    }
    this.scene.start('GameScene', payload);
    this.scene.stop();
  }

  private goNextPuzzle(): void {
    const nextId = this.nextPuzzleId();
    if (nextId === null) {
      this.goRetry();
      return;
    }
    this.scene.stop('GameScene');
    this.scene.stop('HUDScene');
    this.scene.stop('PauseScene');
    this.scene.start('GameScene', { mode: 'puzzle', puzzleId: nextId });
    this.scene.stop();
  }

  /** Returns the next puzzle id if (a) we just cleared a puzzle, (b) there
   * is a next puzzle in the catalog. Returns null otherwise. */
  private nextPuzzleId(): string | null {
    if (this.resultData.mode !== 'puzzle') return null;
    if (this.resultData.stars === undefined) return null;
    const currentId = this.resultData.puzzleId;
    if (!currentId) return null;
    if (!getPuzzleById(currentId)) return null;
    const idx = PUZZLES.findIndex((p) => p.id === currentId);
    if (idx < 0 || idx >= PUZZLES.length - 1) return null;
    return PUZZLES[idx + 1].id;
  }

  private goMenu(): void {
    this.scene.stop('GameScene');
    this.scene.stop('HUDScene');
    this.scene.stop('PauseScene');
    const targetKey = this.scene.manager.keys['ModeSelectScene']
      ? 'ModeSelectScene'
      : 'TitleScene';
    this.scene.start(targetKey);
    this.scene.stop();
  }

  private cleanup(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.scoreTween) {
      this.scoreTween.stop();
      this.scoreTween = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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
