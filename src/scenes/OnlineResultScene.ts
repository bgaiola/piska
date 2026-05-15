/**
 * OnlineResultScene — overlay shown after a networked Vs match ends.
 *
 * Reports outcome (won/lost), the reason (topout vs. opponent disconnect),
 * and the final scores. Offers two actions: return to the lobby (where the
 * user can host or join again) or back to the main mode select. In either
 * case we stop `OnlineVsScene` cleanly so its peer/connection is torn down.
 */

import Phaser from 'phaser';

interface OnlineResultData {
  outcome: 'won' | 'lost';
  reason: 'topout' | 'disconnect';
  myScore: number;
  opponentScore: number;
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';

interface ActionCard {
  key: 'lobby' | 'menu';
  label: string;
  container: Phaser.GameObjects.Container;
}

export class OnlineResultScene extends Phaser.Scene {
  private result!: OnlineResultData;
  private cursor = 0;
  private actions: ActionCard[] = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('OnlineResultScene');
  }

  init(data: OnlineResultData): void {
    this.result = {
      outcome: data?.outcome ?? 'won',
      reason: data?.reason ?? 'topout',
      myScore: data?.myScore ?? 0,
      opponentScore: data?.opponentScore ?? 0,
    };
    this.cursor = 0;
    this.actions = [];
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.add.rectangle(0, 0, w, h, 0x000000, 0.75).setOrigin(0, 0);

    let headline: string;
    let headlineColor: string;
    if (this.result.reason === 'disconnect' && this.result.outcome === 'won') {
      headline = 'ADVERSÁRIO DESCONECTOU';
      headlineColor = '#f5d24a';
    } else if (this.result.outcome === 'won') {
      headline = 'VOCÊ VENCEU!';
      headlineColor = '#aef58a';
    } else {
      headline = 'VOCÊ PERDEU!';
      headlineColor = '#f88a8a';
    }

    this.add
      .text(w / 2, h * 0.22, headline, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: headlineColor,
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(
        w / 2,
        h * 0.4,
        `VOCÊ        ${this.result.myScore}`,
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: FOCUS_TEXT,
        },
      )
      .setOrigin(0.5);

    this.add
      .text(
        w / 2,
        h * 0.48,
        `ADVERSÁRIO  ${this.result.opponentScore}`,
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: UNFOCUS_TEXT,
        },
      )
      .setOrigin(0.5);

    this.buildAction(w / 2, h * 0.68, 'lobby', 'Voltar ao lobby');
    this.buildAction(w / 2, h * 0.78, 'menu', 'Menu principal');

    this.add
      .text(w / 2, h - 18, '↑↓ Navegar  •  Enter Selecionar', {
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
    key: 'lobby' | 'menu',
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
    if (action.key === 'lobby') {
      this.goLobby();
    } else {
      this.goMenu();
    }
  }

  private goLobby(): void {
    // Stop the Vs scene first so its cleanup destroys the peer.
    this.scene.stop('OnlineVsScene');
    this.scene.start('OnlineLobbyScene');
    this.scene.stop();
  }

  private goMenu(): void {
    this.scene.stop('OnlineVsScene');
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
