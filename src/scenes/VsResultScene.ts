/**
 * VsResultScene — overlay shown after a Versus match ends.
 *
 * Handles two flavours of Vs mode:
 *   - mode 'ai' (default): "VOCÊ" vs "IA" — uses `playerScore`/`aiScore`.
 *   - mode 'local':         "P1" vs "P2"  — uses `p1Score`/`p2Score`.
 *
 * Both flows offer "Jogar de novo" and "Voltar ao menu". Replay re-launches
 * the appropriate scene (VsScene for AI, VsLocalScene for local).
 *
 * Cinematic treatment (fase 4 "FODA" polish):
 *   - 12-stripe vertical gradient backdrop matching VsScene's "Forja
 *     Vulcânica" palette so the result reads as the same arena.
 *   - Score numbers tween from 0 → final over ~700ms with Cubic.easeOut.
 *   - A glowing crown (★) sits next to the winner's score and pulses
 *     gently so the eye is drawn there first.
 *   - "Jogar de novo" is rendered larger / more prominent than "Voltar".
 */

import Phaser from 'phaser';
import type { AIDifficulty } from '@/engine/AIPlayer';
import { t } from '@/i18n';

export type VsResultMode = 'ai' | 'local';

interface VsResultData {
  // Discriminator. Defaults to 'ai' for backward compat.
  mode?: VsResultMode;
  // 'player' / 'ai' for AI mode; 'p1' / 'p2' for local mode.
  winner: 'player' | 'ai' | 'p1' | 'p2';
  // AI-mode scores (also accepted for local mode as a fallback).
  playerScore?: number;
  aiScore?: number;
  // Local-mode scores.
  p1Score?: number;
  p2Score?: number;
  difficulty?: AIDifficulty;
}

function difficultyLabel(d: AIDifficulty): string {
  return t(`difficulty.${d}.label`);
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';
const FOCUS_FILL = 0x36204c;
const UNFOCUS_FILL = 0x251338;

interface ActionCard {
  key: 'replay' | 'back';
  label: string;
  container: Phaser.GameObjects.Container;
  // Replay is rendered larger so it stands out as the dominant call-to-action.
  prominent: boolean;
}

interface ResolvedResult {
  mode: VsResultMode;
  winnerKey: 'player' | 'ai' | 'p1' | 'p2';
  leftLabel: string;
  rightLabel: string;
  leftScore: number;
  rightScore: number;
  // True when the winner sits on the right-hand column.
  winnerOnRight: boolean;
  headlineText: string;
  headlineColor: string;
  difficulty: AIDifficulty;
}

interface ScoreTracker {
  value: number;
  target: number;
  text: Phaser.GameObjects.Text;
  tween: Phaser.Tweens.Tween | null;
}

export class VsResultScene extends Phaser.Scene {
  private result!: ResolvedResult;
  private cursor = 0;
  private actions: ActionCard[] = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private scoreTrackers: ScoreTracker[] = [];

  constructor() {
    super('VsResultScene');
  }

  init(data: VsResultData): void {
    this.result = this.normalize(data);
    this.cursor = 0;
    this.actions = [];
    this.scoreTrackers = [];
  }

  private normalize(data: VsResultData): ResolvedResult {
    const mode: VsResultMode = data?.mode ?? 'ai';

    if (mode === 'local') {
      const winnerKey: 'p1' | 'p2' =
        data.winner === 'p2' ? 'p2'
          : data.winner === 'p1' ? 'p1'
          // Map AI-style winner to local just in case.
          : data.winner === 'ai' ? 'p2'
          : 'p1';
      const p1Score = data.p1Score ?? data.playerScore ?? 0;
      const p2Score = data.p2Score ?? data.aiScore ?? 0;
      return {
        mode,
        winnerKey,
        leftLabel: t('vs.p1'),
        rightLabel: t('vs.p2'),
        leftScore: p1Score,
        rightScore: p2Score,
        winnerOnRight: winnerKey === 'p2',
        headlineText: winnerKey === 'p1' ? t('vs.p1.won') : t('vs.p2.won'),
        headlineColor: winnerKey === 'p1' ? '#aef58a' : '#a8caff',
        difficulty: data.difficulty ?? 'medium',
      };
    }

    const winnerKey: 'player' | 'ai' = data.winner === 'ai' ? 'ai' : 'player';
    return {
      mode: 'ai',
      winnerKey,
      leftLabel: t('vs.you'),
      rightLabel: t('vs.ai'),
      leftScore: data.playerScore ?? 0,
      rightScore: data.aiScore ?? 0,
      winnerOnRight: winnerKey === 'ai',
      headlineText: winnerKey === 'player' ? t('vs.you.won') : t('vs.ai.won'),
      headlineColor: winnerKey === 'player' ? '#aef58a' : '#f88a8a',
      difficulty: data.difficulty ?? 'medium',
    };
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    // Opaque backdrop so the paused Vs scene (boards, HUD, chain popups,
    // garbage queue) doesn't bleed through and visually compete with the
    // result panel, then layer the gradient stripes on top.
    this.add.rectangle(0, 0, w, h, 0x14081c, 1).setOrigin(0, 0);
    this.drawGradient(w, h);

    this.add
      .text(w / 2, h * 0.18, this.result.headlineText, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: this.result.headlineColor,
      })
      .setOrigin(0.5);

    if (this.result.mode === 'ai') {
      this.add
        .text(
          w / 2,
          h * 0.28,
          t('vs.difficulty', { difficulty: difficultyLabel(this.result.difficulty) }),
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#bbf',
          },
        )
        .setOrigin(0.5);
    } else {
      this.add
        .text(w / 2, h * 0.28, t('vs.local.subtitle'), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#bbf',
        })
        .setOrigin(0.5);
    }

    // Scoreboard: two columns flanking the vertical centerline so the panel
    // reads as a head-to-head card on both narrow phones and wide desktop.
    const colOffset = 90;
    const leftX = w / 2 - colOffset;
    const rightX = w / 2 + colOffset;
    const scoreLabelY = h * 0.42;
    const scoreValueY = h * 0.5;

    this.add
      .text(leftX, scoreLabelY, this.result.leftLabel, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    const leftScoreText = this.add
      .text(leftX, scoreValueY, '0', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: this.result.winnerOnRight ? UNFOCUS_TEXT : FOCUS_TEXT,
      })
      .setOrigin(0.5);

    this.add
      .text(rightX, scoreLabelY, this.result.rightLabel, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    const rightScoreText = this.add
      .text(rightX, scoreValueY, '0', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: this.result.winnerOnRight ? FOCUS_TEXT : UNFOCUS_TEXT,
      })
      .setOrigin(0.5);

    this.animateScore(leftScoreText, this.result.leftScore);
    this.animateScore(rightScoreText, this.result.rightScore);

    // Crown / glow next to the winner's score column. Positioned to the
    // outside of the column so it doesn't crowd the number.
    const crownOffset = 56;
    const crownX = this.result.winnerOnRight ? rightX + crownOffset : leftX - crownOffset;
    this.drawWinnerCrown(crownX, scoreValueY);

    // Action buttons — replay is the primary CTA so it gets the larger box.
    this.buildAction(w / 2, h * 0.7, 'replay', t('vs.replay'), true);
    this.buildAction(w / 2, h * 0.81, 'back', t('vs.back'), false);

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
    // Same 12 stops as VsScene.drawBackdrop() — deep purple → ember base.
    const stops = [
      0x150624, 0x1b0a2c, 0x210c35, 0x270e3d, 0x2c1041, 0x2e1141,
      0x331243, 0x3a1545, 0x401545, 0x441444, 0x441241, 0x3a0f38,
    ];
    const g = this.add.graphics();
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    // Top/bottom vignette: matches the VsScene treatment.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, w, 24);
    g.fillRect(0, h - 24, w, 24);
    g.setDepth(-1000);
  }

  // ---------------------------------------------------------------------------
  // Score animation + crown
  // ---------------------------------------------------------------------------

  private animateScore(text: Phaser.GameObjects.Text, target: number): void {
    if (target <= 0) {
      text.setText('0');
      return;
    }
    const tracker: ScoreTracker = { value: 0, target, text, tween: null };
    tracker.tween = this.tweens.add({
      targets: tracker,
      value: target,
      duration: 600,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        text.setText(String(Math.floor(tracker.value)));
      },
      onComplete: () => {
        text.setText(String(target));
      },
    });
    this.scoreTrackers.push(tracker);
  }

  private drawWinnerCrown(cx: number, cy: number): void {
    // The '★' character is far more reliable across monospace fallbacks
    // than '👑' (emoji widths vary wildly between fonts).
    const crown = this.add
      .text(cx, cy, '★', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#ffe35a',
        stroke: '#3a1a02',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    crown.setAlpha(0).setScale(0.4);
    this.tweens.add({
      targets: crown,
      alpha: 1,
      scale: 1,
      duration: 320,
      delay: 500,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: crown,
          scale: 1.15,
          alpha: 0.85,
          duration: 800,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Action buttons
  // ---------------------------------------------------------------------------

  private buildAction(
    cx: number,
    cy: number,
    key: 'replay' | 'back',
    label: string,
    prominent: boolean,
  ): void {
    const idx = this.actions.length;
    const container = this.add.container(cx, cy);
    const width = prominent ? 240 : 200;
    const height = prominent ? 44 : 36;
    const bg = this.add
      .rectangle(0, 0, width, height, UNFOCUS_FILL, 0.95)
      .setStrokeStyle(2, UNFOCUS_COLOR, 1);
    bg.setName('bg');

    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: prominent ? '14px' : '12px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0.5);
    text.setName('label');

    container.add([bg, text]);
    container.setSize(width, height);

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

    this.actions.push({ key, label, container, prominent });
  }

  private refreshFocus(): void {
    this.actions.forEach((a, idx) => {
      const focused = idx === this.cursor;
      const bg = a.container.getByName('bg') as Phaser.GameObjects.Rectangle | null;
      const label = a.container.getByName('label') as Phaser.GameObjects.Text | null;
      if (bg !== null) {
        bg.setStrokeStyle(2, focused ? FOCUS_COLOR : UNFOCUS_COLOR, 1);
        bg.setFillStyle(focused ? FOCUS_FILL : UNFOCUS_FILL, 0.95);
      }
      if (label !== null) {
        label.setColor(focused ? FOCUS_TEXT : UNFOCUS_TEXT);
      }
      a.container.setScale(focused ? 1.04 : 1);
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
        case 'w':
        case 'W':
          e.preventDefault();
          move(-1);
          break;
        case 'ArrowDown':
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
          this.goBack();
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
    if (action.key === 'replay') {
      this.replay();
    } else {
      this.goBack();
    }
  }

  private replay(): void {
    if (this.result.mode === 'local') {
      this.scene.stop('VsLocalScene');
      this.scene.start('VsLocalScene');
    } else {
      const difficulty = this.result.difficulty;
      this.scene.stop('VsScene');
      this.scene.start('VsScene', { difficulty });
    }
    this.scene.stop();
  }

  private goBack(): void {
    if (this.result.mode === 'local') {
      this.scene.stop('VsLocalScene');
    } else {
      this.scene.stop('VsScene');
    }
    this.scene.start('ModeSelectScene');
    this.scene.stop();
  }

  private cleanup(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    for (const tr of this.scoreTrackers) {
      tr.tween?.stop();
    }
    this.scoreTrackers = [];
  }
}
