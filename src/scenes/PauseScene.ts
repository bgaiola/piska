/**
 * PauseScene — overlay that dims the screen and lets the player either
 * resume or quit back to the menu / adventure map.
 *
 * In Vs mode the caller passes `vsAiEngine` so this scene can resume both
 * engines simultaneously, and `resumeSceneKey` lets it resume the right host.
 * If `quitSceneKey` is set, the "Sair" action stops the host scene and
 * starts the given scene (e.g. 'AdventureMapScene' for Adventure runs).
 */

import Phaser from 'phaser';
import type { GameEngine } from '@/engine';
import { BGMPlayer } from '@/audio';
import { t } from '@/i18n';

interface PauseInit {
  engine: GameEngine;
  vsAiEngine?: GameEngine;
  resumeSceneKey?: string;
  /** Defaults to 'ModeSelectScene'. */
  quitSceneKey?: string;
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';

interface ActionCard {
  key: 'resume' | 'quit';
  container: Phaser.GameObjects.Container;
}

export class PauseScene extends Phaser.Scene {
  private engine!: GameEngine;
  private vsAiEngine: GameEngine | null = null;
  private resumeSceneKey: string = 'GameScene';
  private quitSceneKey: string = 'ModeSelectScene';
  private actions: ActionCard[] = [];
  private cursor = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('PauseScene');
  }

  init(data: PauseInit): void {
    this.engine = data.engine;
    this.vsAiEngine = data.vsAiEngine ?? null;
    this.resumeSceneKey = data.resumeSceneKey ?? 'GameScene';
    this.quitSceneKey = data.quitSceneKey ?? 'ModeSelectScene';
    this.actions = [];
    this.cursor = 0;
  }

  create(): void {
    BGMPlayer.get().pause();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0, 0);

    this.add
      .text(w / 2, h * 0.32, t('pause.title'), {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    this.buildAction(w / 2, h * 0.52, 'resume', t('pause.resume'));
    this.buildAction(w / 2, h * 0.62, 'quit', t('pause.quit'));

    this.add
      .text(w / 2, h - 18, t('pause.hint'), {
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

  private buildAction(cx: number, cy: number, key: 'resume' | 'quit', label: string): void {
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

    this.actions.push({ key, container });
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
      if (this.actions.length === 0) return;
      this.cursor = (this.cursor + delta + this.actions.length) % this.actions.length;
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
          // Esc always resumes for muscle memory.
          e.preventDefault();
          this.resume();
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
    if (action.key === 'resume') this.resume();
    else this.quit();
  }

  private resume(): void {
    BGMPlayer.get().resume();
    this.engine.resume();
    if (this.vsAiEngine !== null) this.vsAiEngine.resume();
    this.scene.resume(this.resumeSceneKey);
    this.scene.stop();
  }

  private quit(): void {
    BGMPlayer.get().stop();
    // Stop both the host scene and any HUD overlay launched alongside it.
    this.scene.stop(this.resumeSceneKey);
    this.scene.stop('HUDScene');
    this.scene.start(this.quitSceneKey);
    this.scene.stop();
  }

  private cleanup(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
