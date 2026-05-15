/**
 * VsResultScene — overlay shown after a Versus match ends.
 *
 * Handles two flavours of Vs mode:
 *   - mode 'ai' (default): "VOCÊ" vs "IA" — uses `playerScore`/`aiScore`.
 *   - mode 'local':         "P1" vs "P2"  — uses `p1Score`/`p2Score`.
 *
 * Both flows offer "Jogar de novo" and "Voltar ao menu". Replay re-launches
 * the appropriate scene (VsScene for AI, VsLocalScene for local).
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

interface ActionCard {
  key: 'replay' | 'back';
  label: string;
  container: Phaser.GameObjects.Container;
}

interface ResolvedResult {
  mode: VsResultMode;
  winnerKey: 'player' | 'ai' | 'p1' | 'p2';
  leftLabel: string;
  rightLabel: string;
  leftScore: number;
  rightScore: number;
  headlineText: string;
  headlineColor: string;
  difficulty: AIDifficulty;
}

export class VsResultScene extends Phaser.Scene {
  private result!: ResolvedResult;
  private cursor = 0;
  private actions: ActionCard[] = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('VsResultScene');
  }

  init(data: VsResultData): void {
    this.result = this.normalize(data);
    this.cursor = 0;
    this.actions = [];
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
      headlineText: winnerKey === 'player' ? t('vs.you.won') : t('vs.ai.won'),
      headlineColor: winnerKey === 'player' ? '#aef58a' : '#f88a8a',
      difficulty: data.difficulty ?? 'medium',
    };
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.add.rectangle(0, 0, w, h, 0x000000, 0.75).setOrigin(0, 0);

    this.add
      .text(w / 2, h * 0.22, this.result.headlineText, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: this.result.headlineColor,
      })
      .setOrigin(0.5);

    // Difficulty banner only relevant for the AI flow.
    if (this.result.mode === 'ai') {
      this.add
        .text(
          w / 2,
          h * 0.36,
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
        .text(w / 2, h * 0.36, t('vs.local.subtitle'), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#bbf',
        })
        .setOrigin(0.5);
    }

    this.add
      .text(
        w / 2,
        h * 0.46,
        `${this.result.leftLabel}   ${this.result.leftScore}`,
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: FOCUS_TEXT,
        },
      )
      .setOrigin(0.5);

    this.add
      .text(
        w / 2,
        h * 0.52,
        `${this.result.rightLabel}   ${this.result.rightScore}`,
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: UNFOCUS_TEXT,
        },
      )
      .setOrigin(0.5);

    this.buildAction(w / 2, h * 0.7, 'replay', t('vs.replay'));
    this.buildAction(w / 2, h * 0.8, 'back', t('vs.back'));

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

  private buildAction(
    cx: number,
    cy: number,
    key: 'replay' | 'back',
    label: string,
  ): void {
    const idx = this.actions.length;
    const container = this.add.container(cx, cy);
    const bg = this.add
      .rectangle(0, 0, 200, 36, 0x251338, 0.95)
      .setStrokeStyle(2, UNFOCUS_COLOR, 1);
    bg.setName('bg');

    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0.5);
    text.setName('label');

    container.add([bg, text]);
    container.setSize(200, 36);

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

    this.actions.push({ key, label, container });
  }

  private refreshFocus(): void {
    this.actions.forEach((a, idx) => {
      const focused = idx === this.cursor;
      const bg = a.container.getByName('bg') as Phaser.GameObjects.Rectangle | null;
      const label = a.container.getByName('label') as Phaser.GameObjects.Text | null;
      if (bg !== null) {
        bg.setStrokeStyle(2, focused ? FOCUS_COLOR : UNFOCUS_COLOR, 1);
        bg.setFillStyle(focused ? 0x36204c : 0x251338, 0.95);
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
  }
}
