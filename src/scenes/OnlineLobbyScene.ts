/**
 * OnlineLobbyScene — UI shell that owns the `OnlinePeer` during the
 * pre-match handshake.
 *
 * Steps:
 *   menu     → choose Host / Guest
 *   hosting  → display the generated code, wait for guest to dial in
 *   joining  → input for the code + Connect button
 *   waiting  → connected, exchanging `hello` / `start`, counting down
 *
 * Once both sides agree on a `startsAt`, ownership of the `OnlinePeer` is
 * handed off to `OnlineVsScene` via init data so the connection survives the
 * scene transition.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { createBackButton, type BackButtonHandle } from '@/ui/BackButton';
import {
  OnlinePeer,
  normalizeRoomCode,
  type OnlineMessage,
  type OnlineRole,
} from '@/net/OnlinePeer';

type LobbyStep = 'menu' | 'hosting' | 'joining' | 'waiting';

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#cccccc';
const SUBTITLE_TEXT = '#bbb';
const ERROR_TEXT = '#f88a8a';

interface ButtonSpec {
  label: string;
  onClick: () => void;
}

export class OnlineLobbyScene extends Phaser.Scene {
  private step: LobbyStep = 'menu';
  private peer: OnlinePeer | null = null;
  private codeInput: HTMLInputElement | null = null;
  private codeInputAnchor: HTMLDivElement | null = null;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private statusText: Phaser.GameObjects.Text | null = null;
  private codeText: Phaser.GameObjects.Text | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private startCountdownEvent: Phaser.Time.TimerEvent | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private didTransfer = false;

  constructor() {
    super('OnlineLobbyScene');
  }

  create(): void {
    BGMPlayer.get().play('title');
    this.cameras.main.setBackgroundColor('#150a1c');
    this.drawMenu();
    this.bindKeyboard();

    this.backBtn = createBackButton({
      scene: this,
      onClick: () => {
        if (this.step === 'menu') {
          this.scene.start('ModeSelectScene');
        } else {
          this.cancelAndReturnToMenu();
        }
      },
    });

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
    this.game.events.on('layout-changed', this.relayout, this);
  }

  private backBtn: BackButtonHandle | null = null;

  // ---------------------------------------------------------------------------
  // Step renderers
  // ---------------------------------------------------------------------------

  private clearUi(): void {
    this.uiObjects.forEach((o) => o.destroy());
    this.uiObjects = [];
    this.statusText = null;
    this.codeText = null;
    this.removeCodeInput();
  }

  private addText(
    cx: number,
    cy: number,
    text: string,
    size: number,
    color: string,
  ): Phaser.GameObjects.Text {
    const t = this.add
      .text(cx, cy, text, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color,
        align: 'center',
      })
      .setOrigin(0.5);
    this.uiObjects.push(t);
    return t;
  }

  private addButton(
    cx: number,
    cy: number,
    width: number,
    height: number,
    spec: ButtonSpec,
  ): void {
    const container = this.add.container(cx, cy);
    const bg = this.add
      .rectangle(0, 0, width, height, 0x251338, 0.95)
      .setStrokeStyle(2, UNFOCUS_COLOR, 1);
    const label = this.add
      .text(0, 0, spec.label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0.5);
    container.add([bg, label]);
    container.setSize(width, height);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, FOCUS_COLOR, 1);
      bg.setFillStyle(0x36204c, 0.95);
      label.setColor(FOCUS_TEXT);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, UNFOCUS_COLOR, 1);
      bg.setFillStyle(0x251338, 0.95);
      label.setColor(UNFOCUS_TEXT);
    });
    bg.on('pointerdown', () => spec.onClick());

    this.uiObjects.push(container);
  }

  private drawMenu(): void {
    this.step = 'menu';
    this.clearUi();
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.addText(w / 2, Math.max(28, h * 0.16), 'Vs Online', 18, FOCUS_TEXT);
    this.addText(
      w / 2,
      Math.max(54, h * 0.24),
      'Duelo via código de sala',
      11,
      SUBTITLE_TEXT,
    );

    const btnW = 220;
    const btnH = 44;
    const gap = 16;
    const centerX = w / 2;
    const centerY = h / 2;

    this.addButton(centerX, centerY - btnH / 2 - gap / 2, btnW, btnH, {
      label: 'Criar sala',
      onClick: () => this.startHost(),
    });
    this.addButton(centerX, centerY + btnH / 2 + gap / 2, btnW, btnH, {
      label: 'Entrar em sala',
      onClick: () => this.drawJoining(),
    });

    this.addButton(centerX, h - 36, 140, 28, {
      label: 'Voltar',
      onClick: () => this.scene.start('ModeSelectScene'),
    });

    this.addText(
      w / 2,
      h - 12,
      'Servidor público PeerJS  •  até ~50 salas simultâneas',
      9,
      SUBTITLE_TEXT,
    );
  }

  private drawHosting(): void {
    this.step = 'hosting';
    this.clearUi();
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.addText(w / 2, Math.max(28, h * 0.14), 'Sala criada', 16, FOCUS_TEXT);
    this.addText(
      w / 2,
      Math.max(54, h * 0.22),
      'Compartilhe o código com seu adversário',
      10,
      SUBTITLE_TEXT,
    );

    this.codeText = this.addText(
      w / 2,
      h * 0.42,
      this.peer?.code ?? '------',
      36,
      '#ffeecc',
    );

    this.statusText = this.addText(
      w / 2,
      h * 0.56,
      'Aguardando jogador...',
      11,
      SUBTITLE_TEXT,
    );

    this.addButton(w / 2 - 90, h * 0.72, 160, 36, {
      label: 'Copiar código',
      onClick: () => this.copyCode(),
    });
    this.addButton(w / 2 + 90, h * 0.72, 160, 36, {
      label: 'Cancelar',
      onClick: () => this.cancelAndReturnToMenu(),
    });
  }

  private drawJoining(): void {
    this.step = 'joining';
    this.clearUi();
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.addText(
      w / 2,
      Math.max(28, h * 0.16),
      'Entrar em sala',
      16,
      FOCUS_TEXT,
    );
    this.addText(
      w / 2,
      Math.max(54, h * 0.24),
      'Digite o código que seu adversário compartilhou',
      10,
      SUBTITLE_TEXT,
    );

    this.mountCodeInput();

    this.addButton(w / 2 - 90, h * 0.62, 160, 36, {
      label: 'Conectar',
      onClick: () => this.tryConnectGuest(),
    });
    this.addButton(w / 2 + 90, h * 0.62, 160, 36, {
      label: 'Voltar',
      onClick: () => this.drawMenu(),
    });

    this.statusText = this.addText(w / 2, h * 0.74, '', 11, SUBTITLE_TEXT);
  }

  private drawWaiting(remoteWasGuest: boolean): void {
    this.step = 'waiting';
    this.clearUi();
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.addText(
      w / 2,
      h * 0.32,
      remoteWasGuest ? 'Adversário conectado!' : 'Conectado ao host!',
      16,
      '#aef58a',
    );
    this.statusText = this.addText(
      w / 2,
      h * 0.5,
      'Sincronizando...',
      12,
      SUBTITLE_TEXT,
    );
    this.addButton(w / 2, h * 0.72, 160, 36, {
      label: 'Cancelar',
      onClick: () => this.cancelAndReturnToMenu(),
    });
  }

  // ---------------------------------------------------------------------------
  // Code input (DOM overlay)
  // ---------------------------------------------------------------------------

  private mountCodeInput(): void {
    this.removeCodeInput();
    const root = document.getElementById('game-root');
    if (!root) return;

    // Anchor div lets us position the input relative to the game canvas in
    // page coordinates regardless of FIT scaling.
    const anchor = document.createElement('div');
    anchor.style.position = 'absolute';
    anchor.style.left = '50%';
    anchor.style.top = '46%';
    anchor.style.transform = 'translate(-50%, -50%)';
    anchor.style.zIndex = '20';
    anchor.style.pointerEvents = 'auto';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 8;
    input.placeholder = 'CÓDIGO';
    input.autocapitalize = 'characters';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.font = 'bold 28px monospace';
    input.style.padding = '10px 14px';
    input.style.width = '180px';
    input.style.textAlign = 'center';
    input.style.letterSpacing = '6px';
    input.style.background = '#1a0f1f';
    input.style.color = '#ffeecc';
    input.style.border = '2px solid #5a3a72';
    input.style.borderRadius = '6px';
    input.style.outline = 'none';
    input.addEventListener('input', () => {
      input.value = normalizeRoomCode(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.tryConnectGuest();
      }
    });

    anchor.appendChild(input);
    root.appendChild(anchor);

    this.codeInput = input;
    this.codeInputAnchor = anchor;
    // Defer focus so Phaser's keyboard plugin doesn't immediately steal it.
    setTimeout(() => input.focus(), 50);
  }

  private removeCodeInput(): void {
    this.codeInput?.remove();
    this.codeInput = null;
    this.codeInputAnchor?.remove();
    this.codeInputAnchor = null;
  }

  private async copyCode(): Promise<void> {
    if (!this.peer) return;
    const code = this.peer.code;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(code);
        this.statusText?.setText('Código copiado! Aguardando jogador...');
        return;
      }
    } catch {
      // Fall through to manual selection prompt.
    }
    this.statusText?.setText(`Código: ${code} (copie manualmente)`);
  }

  // ---------------------------------------------------------------------------
  // Connection wiring
  // ---------------------------------------------------------------------------

  private startHost(): void {
    this.peer?.destroy();
    this.peer = new OnlinePeer({ role: 'host' });
    this.peer.setHandlers({
      onOpen: (code) => {
        if (this.codeText) this.codeText.setText(code);
        else this.drawHosting();
      },
      onConnect: () => {
        this.drawWaiting(true);
        this.sendHelloAndStart('host');
      },
      onMessage: (m) => this.handleMessage('host', m),
      onError: (e) => this.showError(e.message),
      onDisconnect: () => this.handleDisconnect(),
    });
    // Render immediately so the user sees we're preparing the room.
    this.drawHosting();
    if (this.codeText) this.codeText.setText(this.peer.code);
    void this.peer.start();
  }

  private tryConnectGuest(): void {
    const raw = this.codeInput?.value ?? '';
    const code = normalizeRoomCode(raw);
    if (code.length < 4) {
      this.statusText?.setText('Código muito curto.');
      this.statusText?.setColor(ERROR_TEXT);
      return;
    }
    this.statusText?.setColor(SUBTITLE_TEXT);
    this.statusText?.setText('Conectando...');
    this.peer?.destroy();
    this.peer = new OnlinePeer({ role: 'guest', code });
    this.peer.setHandlers({
      onOpen: () => {
        this.statusText?.setText('Localizando sala...');
      },
      onConnect: () => {
        this.drawWaiting(false);
        this.sendHelloAndStart('guest');
      },
      onMessage: (m) => this.handleMessage('guest', m),
      onError: (e) => this.showError(e.message),
      onDisconnect: () => this.handleDisconnect(),
    });
    void this.peer.start();
  }

  private sendHelloAndStart(role: OnlineRole): void {
    if (!this.peer) return;
    this.peer.send({ kind: 'hello', role, protocolVersion: 1 });
    if (role === 'host') {
      const startsAt = Date.now() + 2000;
      const hostSeed = Math.floor(Math.random() * 0x7fffffff);
      const guestSeed = Math.floor(Math.random() * 0x7fffffff);
      this.peer.send({ kind: 'start', hostSeed, guestSeed, startsAt });
      this.scheduleStart(startsAt, role, hostSeed, guestSeed);
    }
    // Guests wait for the host's `start` message.
  }

  private handleMessage(role: OnlineRole, m: OnlineMessage): void {
    if (m.kind === 'start' && role === 'guest') {
      this.scheduleStart(m.startsAt, role, m.hostSeed, m.guestSeed);
      return;
    }
    // hello/garbage/state/etc are ignored in the lobby.
  }

  private scheduleStart(
    startsAt: number,
    role: OnlineRole,
    hostSeed: number,
    guestSeed: number,
  ): void {
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.startCountdownEvent) {
      this.startCountdownEvent.remove(false);
      this.startCountdownEvent = null;
    }
    const tick = (): void => {
      const left = Math.max(0, startsAt - Date.now());
      if (this.statusText) {
        this.statusText.setText(`Iniciando em ${Math.ceil(left / 1000)}...`);
      }
    };
    tick();
    this.startCountdownEvent = this.time.addEvent({
      delay: 250,
      loop: true,
      callback: tick,
    });

    const delay = Math.max(0, startsAt - Date.now());
    this.startTimer = setTimeout(() => {
      if (!this.peer) return;
      this.didTransfer = true;
      const peer = this.peer;
      // Hand ownership of the peer to OnlineVsScene. We must not destroy it
      // in `cleanup()` — null it out first.
      this.peer = null;
      this.scene.start('OnlineVsScene', {
        peer,
        role,
        hostSeed,
        guestSeed,
      });
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Error / disconnect / nav
  // ---------------------------------------------------------------------------

  private showError(msg: string): void {
    if (this.statusText) {
      this.statusText.setText(msg);
      this.statusText.setColor(ERROR_TEXT);
    } else {
      // No status text in the current step — fall back to a banner.
      const w = this.scale.gameSize.width;
      const h = this.scale.gameSize.height;
      this.statusText = this.addText(w / 2, h - 60, msg, 11, ERROR_TEXT);
    }
  }

  private handleDisconnect(): void {
    if (this.didTransfer) return; // already handed off to OnlineVsScene
    this.showError('Conexão perdida.');
  }

  private cancelAndReturnToMenu(): void {
    this.peer?.destroy();
    this.peer = null;
    this.drawMenu();
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    const onDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.step === 'menu') {
          this.scene.start('ModeSelectScene');
        } else {
          this.cancelAndReturnToMenu();
        }
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyHandler = onDown;
  }

  // ---------------------------------------------------------------------------
  // Layout / lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    // On Android, opening the virtual keyboard shrinks window.innerHeight,
    // which fires resize → layout-changed. If we redraw the joining step
    // we destroy and recreate the focused <input>, which dismisses the
    // keyboard, which fires another resize, and the user sees the
    // keyboard "going crazy". Skip the redraw while typing; the input
    // anchor is positioned in % so it remains usable without it.
    if (
      this.step === 'joining' &&
      this.codeInput &&
      document.activeElement === this.codeInput
    ) {
      return;
    }
    switch (this.step) {
      case 'menu':
        this.drawMenu();
        break;
      case 'hosting':
        this.drawHosting();
        break;
      case 'joining':
        this.drawJoining();
        break;
      case 'waiting':
        // Re-render preserving the connected message; we don't know which
        // role the user is in here without extra state, so just keep it.
        this.drawWaiting(true);
        break;
    }
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.backBtn?.destroy();
    this.backBtn = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.startCountdownEvent) {
      this.startCountdownEvent.remove(false);
      this.startCountdownEvent = null;
    }
    this.removeCodeInput();
    if (!this.didTransfer) {
      this.peer?.destroy();
    }
    this.peer = null;
    this.uiObjects = [];
  }
}
