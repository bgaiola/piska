/**
 * OnlineResultScene — overlay shown after a networked Vs match ends.
 *
 * Reports outcome (won/lost), the reason (topout vs. opponent disconnect),
 * and the final scores. Owns the peer for the duration of this screen and
 * offers three actions:
 *
 * - "Jogar de novo": both sides have to click this to start a rematch.
 *   When both have asked, the host emits a `rematch-start` message with
 *   fresh seeds and both peers transition into a new OnlineVsScene
 *   without rebuilding the connection.
 * - "Voltar ao lobby": destroys the peer and returns to OnlineLobbyScene.
 * - "Menu principal": destroys the peer and returns to ModeSelectScene.
 *
 * The rematch button is only offered when the peer is still open and the
 * opponent did not just disconnect.
 */

import Phaser from 'phaser';
import type { OnlinePeer, OnlineMessage, OnlineRole } from '@/net/OnlinePeer';

type ActionKey = 'rematch' | 'lobby' | 'menu';

interface OnlineResultData {
  outcome: 'won' | 'lost';
  reason: 'topout' | 'disconnect';
  myScore: number;
  opponentScore: number;
  peer?: OnlinePeer;
  role?: OnlineRole;
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';
const REMATCH_FILL = 0x3a1e58;
const REMATCH_STROKE = 0xffcc55;
const REMATCH_LABEL_TEXT = 'Jogar de novo';
const REMATCH_WAITING_TEXT = 'Aguardando adversário...';
const REMATCH_GO_TEXT = 'Começando!';

interface ActionCard {
  key: ActionKey;
  label: string;
  container: Phaser.GameObjects.Container;
}

export class OnlineResultScene extends Phaser.Scene {
  private result!: OnlineResultData;
  private peer: OnlinePeer | null = null;
  private role: OnlineRole | null = null;
  private cursor = 0;
  private actions: ActionCard[] = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  private iAskedRematch = false;
  private opponentAskedRematch = false;
  private rematchTransitioned = false;

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
    this.peer = data?.peer ?? null;
    this.role = data?.role ?? null;
    this.cursor = 0;
    this.actions = [];
    this.iAskedRematch = false;
    this.opponentAskedRematch = false;
    this.rematchTransitioned = false;
  }

  create(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    // Opaque backdrop — the paused OnlineVsScene would otherwise show
    // through, with its HUD landing right where our score lines do.
    this.add.rectangle(0, 0, w, h, 0x14081c, 1).setOrigin(0, 0);

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
      .text(w / 2, h * 0.18, headline, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: headlineColor,
        align: 'center',
      })
      .setOrigin(0.5);

    // Scoreboard as a two-column head-to-head, mirroring VsResultScene so
    // the result panel looks consistent across AI / local / online modes.
    const colOffset = 90;
    const scoreLabelY = h * 0.34;
    const scoreValueY = h * 0.4;
    this.add
      .text(w / 2 - colOffset, scoreLabelY, 'VOCÊ', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    this.add
      .text(w / 2 - colOffset, scoreValueY, `${this.result.myScore}`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: FOCUS_TEXT,
      })
      .setOrigin(0.5);
    this.add
      .text(w / 2 + colOffset, scoreLabelY, 'ADVERSÁRIO', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    this.add
      .text(w / 2 + colOffset, scoreValueY, `${this.result.opponentScore}`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0.5);

    // Rematch is only offered if the peer is still open. After a disconnect
    // the connection is one-way at best, so we skip the option and let the
    // player head back to the lobby to find a new opponent.
    const canRematch =
      this.peer !== null &&
      this.role !== null &&
      this.result.reason !== 'disconnect' &&
      this.peer.isOpen();

    if (canRematch) {
      this.buildAction(w / 2, h * 0.56, 'rematch', REMATCH_LABEL_TEXT);
      this.installPeerHandlers();
    }
    this.buildAction(w / 2, canRematch ? h * 0.7 : h * 0.6, 'lobby', 'Voltar ao lobby');
    this.buildAction(w / 2, canRematch ? h * 0.8 : h * 0.7, 'menu', 'Menu principal');

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

  // ---------------------------------------------------------------------------
  // Rematch protocol
  // ---------------------------------------------------------------------------

  private installPeerHandlers(): void {
    if (!this.peer) return;
    // We take over the peer's message handler so the paused OnlineVsScene
    // doesn't keep mutating its state with late `state` snapshots. We only
    // react to rematch messages and connection events; other messages are
    // dropped on the floor — the match is over.
    this.peer.setHandlers({
      onMessage: (m) => this.handleMessage(m),
      onDisconnect: () => this.handleDisconnect(),
      onError: () => this.handleDisconnect(),
    });
  }

  private handleMessage(m: OnlineMessage): void {
    if (m.kind === 'rematch') {
      this.opponentAskedRematch = true;
      this.updateRematchLabel();
      this.maybeStartRematch();
      return;
    }
    if (m.kind === 'rematch-start') {
      // Guest path. Hosts ignore — they already scheduled their own start.
      if (this.role === 'host') return;
      this.beginRematchTransition(m.hostSeed, m.guestSeed);
    }
  }

  private handleDisconnect(): void {
    // Peer dropped mid-result-screen. Disable the rematch action and update
    // the headline so the player knows.
    const rematch = this.actions.find((a) => a.key === 'rematch');
    if (rematch) {
      const label = rematch.container.getByName('label') as Phaser.GameObjects.Text | null;
      label?.setText('Adversário saiu');
      label?.setColor('#f88a8a');
      const bg = rematch.container.getByName('bg') as Phaser.GameObjects.Rectangle | null;
      bg?.disableInteractive();
      bg?.setFillStyle(0x2a1430, 0.95);
      bg?.setStrokeStyle(2, 0x553344, 1);
    }
  }

  private onRematchClicked(): void {
    if (!this.peer || this.iAskedRematch || this.rematchTransitioned) return;
    if (!this.peer.isOpen()) {
      this.handleDisconnect();
      return;
    }
    this.iAskedRematch = true;
    this.peer.send({ kind: 'rematch' });
    this.updateRematchLabel();
    this.maybeStartRematch();
  }

  private updateRematchLabel(): void {
    const rematch = this.actions.find((a) => a.key === 'rematch');
    if (!rematch) return;
    const label = rematch.container.getByName('label') as Phaser.GameObjects.Text | null;
    if (!label) return;
    if (this.iAskedRematch && !this.opponentAskedRematch) {
      label.setText(REMATCH_WAITING_TEXT);
    } else if (!this.iAskedRematch && this.opponentAskedRematch) {
      label.setText(`${REMATCH_LABEL_TEXT} (adversário quer!)`);
    }
  }

  private maybeStartRematch(): void {
    if (this.rematchTransitioned) return;
    if (!this.iAskedRematch || !this.opponentAskedRematch) return;
    if (!this.peer) return;
    if (this.role !== 'host') return; // guest waits for rematch-start

    const hostSeed = Math.floor(Math.random() * 0x7fffffff);
    const guestSeed = Math.floor(Math.random() * 0x7fffffff);
    const startsAt = Date.now() + 800;
    this.peer.send({ kind: 'rematch-start', hostSeed, guestSeed, startsAt });
    this.beginRematchTransition(hostSeed, guestSeed);
  }

  private beginRematchTransition(hostSeed: number, guestSeed: number): void {
    if (this.rematchTransitioned) return;
    this.rematchTransitioned = true;
    const rematch = this.actions.find((a) => a.key === 'rematch');
    if (rematch) {
      const label = rematch.container.getByName('label') as Phaser.GameObjects.Text | null;
      label?.setText(REMATCH_GO_TEXT);
    }
    const peer = this.peer;
    const role = this.role;
    if (!peer || !role) return;
    // Small delay so both clients land on the rematch transition at roughly
    // the same wall-clock moment; the host already scheduled startsAt above.
    this.time.delayedCall(400, () => {
      this.scene.stop('OnlineVsScene');
      this.scene.start('OnlineVsScene', { peer, role, hostSeed, guestSeed });
      this.scene.stop();
    });
  }

  // ---------------------------------------------------------------------------
  // Action cards
  // ---------------------------------------------------------------------------

  private buildAction(cx: number, cy: number, key: ActionKey, label: string): void {
    const idx = this.actions.length;
    const isRematch = key === 'rematch';
    const container = this.add.container(cx, cy);
    const bg = this.add
      .rectangle(
        0,
        0,
        isRematch ? 240 : 200,
        isRematch ? 44 : 36,
        isRematch ? REMATCH_FILL : 0x251338,
        0.95,
      )
      .setStrokeStyle(isRematch ? 3 : 2, isRematch ? REMATCH_STROKE : UNFOCUS_COLOR, 1);
    bg.setName('bg');

    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: isRematch ? '14px' : '12px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0.5);
    text.setName('label');

    container.add([bg, text]);
    container.setSize(isRematch ? 240 : 200, isRematch ? 44 : 36);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      this.cursor = idx;
      this.refreshFocus();
    });
    bg.on('pointerup', () => {
      this.cursor = idx;
      this.refreshFocus();
      this.confirm();
    });

    this.actions.push({ key, label, container });
  }

  private refreshFocus(): void {
    this.actions.forEach((a, idx) => {
      const focused = idx === this.cursor;
      const isRematch = a.key === 'rematch';
      const bg = a.container.getByName('bg') as Phaser.GameObjects.Rectangle | null;
      const label = a.container.getByName('label') as Phaser.GameObjects.Text | null;
      if (bg !== null) {
        bg.setStrokeStyle(
          isRematch ? 3 : 2,
          focused ? FOCUS_COLOR : isRematch ? REMATCH_STROKE : UNFOCUS_COLOR,
          1,
        );
        bg.setFillStyle(
          focused ? (isRematch ? 0x5a3a78 : 0x36204c) : isRematch ? REMATCH_FILL : 0x251338,
          0.95,
        );
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
    switch (action.key) {
      case 'rematch':
        this.onRematchClicked();
        break;
      case 'lobby':
        this.goLobby();
        break;
      case 'menu':
        this.goMenu();
        break;
    }
  }

  private goLobby(): void {
    this.peer?.destroy();
    this.peer = null;
    this.scene.stop('OnlineVsScene');
    this.scene.start('OnlineLobbyScene');
    this.scene.stop();
  }

  private goMenu(): void {
    this.peer?.destroy();
    this.peer = null;
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
