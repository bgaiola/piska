/**
 * OnlineVsScene — networked Versus mode.
 *
 * Local engine runs on the left side; the right side is rendered from
 * periodic `state` snapshots streamed by the opponent. Outgoing garbage from
 * the local engine is sent over the wire so the opponent's engine can call
 * `receiveGarbage` with the same `GarbagePiece` objects.
 *
 * Visual layout mirrors `VsScene` (with shared cell size / colors) so players
 * see the same thing they're used to in the local Vs mode. Snapshots are
 * sent at ~10Hz which is enough for the right-side board to feel live without
 * saturating the data channel. Encoding is a compact 1-byte-per-cell scheme
 * — see `encodeBlock` below.
 */

import Phaser from 'phaser';
import { GameEngine } from '@/engine';
import {
  ALL_COLORS,
  type Block,
  type BlockColor,
  type BlockState,
  type EngineEvent,
} from '@/engine';
import { setupDefaultInputs } from '@/engine/input/setupDefaultInputs';
import type { InputController } from '@/engine/input/InputController';
import { BGMPlayer, SFXPlayer } from '@/audio';
import { BLOCK_COLOR_HEX, BLOCK_SYMBOL, darken } from '@/config';
import type { BoardSnapshot, OnlineMessage, OnlinePeer } from '@/net/OnlinePeer';

const VS_CELL_SIZE = 22;
const GARBAGE_FILL = 0x666666;
const GARBAGE_OUTLINE = 0x222222;
const GARBAGE_UNLOCK_FILL = 0xa08070;
const HUD_LABEL_COLOR = '#ffe';
const HUD_SUB_COLOR = '#bbf';
const SNAPSHOT_INTERVAL_MS = 100;

interface InitData {
  peer: OnlinePeer;
  role: 'host' | 'guest';
  hostSeed: number;
  guestSeed: number;
}

interface DecodedCell {
  color: BlockColor;
  kind: 'color' | 'garbage';
  state: BlockState;
  unlocking: boolean;
}

const BLOCK_STATES: readonly BlockState[] = [
  'idle',
  'swapping',
  'falling',
  'clearing',
  'landed',
];

/** Pack a Block into a single byte:
 *   bits 0..2: color index (0..5)
 *   bit  3:    kind (0 = color, 1 = garbage)
 *   bits 4..6: state index (0..4)
 *   bit  7:    unlocking flag
 */
function encodeBlock(b: Block): number {
  const colorIdx = Math.max(0, ALL_COLORS.indexOf(b.color));
  const kindBit = b.kind === 'garbage' ? 1 : 0;
  const stateIdx = Math.max(0, BLOCK_STATES.indexOf(b.state));
  const unlockBit = b.unlocking ? 1 : 0;
  return (
    (colorIdx & 0x07) |
    ((kindBit & 0x01) << 3) |
    ((stateIdx & 0x07) << 4) |
    ((unlockBit & 0x01) << 7)
  );
}

function decodeBlock(byte: number): DecodedCell {
  const colorIdx = byte & 0x07;
  const kindBit = (byte >> 3) & 0x01;
  const stateIdx = (byte >> 4) & 0x07;
  const unlockBit = (byte >> 7) & 0x01;
  return {
    color: ALL_COLORS[colorIdx % ALL_COLORS.length],
    kind: kindBit === 1 ? 'garbage' : 'color',
    state: BLOCK_STATES[Math.min(stateIdx, BLOCK_STATES.length - 1)],
    unlocking: unlockBit === 1,
  };
}

export class OnlineVsScene extends Phaser.Scene {
  private peer!: OnlinePeer;
  private myEngine!: GameEngine;
  private remoteSnapshot: BoardSnapshot | null = null;
  private mySeed = 0;

  private readonly cellSize = VS_CELL_SIZE;
  private playerOrigin = { x: 0, y: 0 };
  private opponentOrigin = { x: 0, y: 0 };

  private playerBlocks: Phaser.GameObjects.Container | null = null;
  private opponentBlocks: Phaser.GameObjects.Container | null = null;
  private framesGfx: Phaser.GameObjects.Graphics | null = null;
  private cursorGfx: Phaser.GameObjects.Graphics | null = null;

  private playerLabel: Phaser.GameObjects.Text | null = null;
  private opponentLabel: Phaser.GameObjects.Text | null = null;
  private playerScoreText: Phaser.GameObjects.Text | null = null;
  private opponentScoreText: Phaser.GameObjects.Text | null = null;
  private rttText: Phaser.GameObjects.Text | null = null;

  private snapshotAccum = 0;
  private gameEnded = false;
  private offFns: Array<() => void> = [];
  private inputCtrlDestroy: (() => void) | null = null;
  private didTransferPeer = false;

  constructor() {
    super('OnlineVsScene');
  }

  init(data: InitData): void {
    this.peer = data.peer;
    this.mySeed = data.role === 'host' ? data.hostSeed : data.guestSeed;
    this.gameEnded = false;
    this.remoteSnapshot = null;
    this.snapshotAccum = 0;
    this.offFns = [];
    this.inputCtrlDestroy = null;
    this.didTransferPeer = false;
  }

  create(): void {
    this.myEngine = new GameEngine({ rngSeed: this.mySeed });

    BGMPlayer.get().play('world-5');
    this.cameras.main.setBackgroundColor('#160a1f');

    this.computeLayout();

    this.framesGfx = this.add.graphics();
    this.drawFrames();

    this.playerBlocks = this.add.container(this.playerOrigin.x, this.playerOrigin.y);
    this.opponentBlocks = this.add.container(
      this.opponentOrigin.x,
      this.opponentOrigin.y,
    );
    this.cursorGfx = this.add.graphics();

    this.drawHudLabels();

    this.peer.setHandlers({
      onMessage: (m) => this.handleMessage(m),
      onDisconnect: () => this.handleDisconnect(),
      onError: (e) => this.handleError(e),
    });

    this.offFns.push(this.myEngine.events.on((e) => this.onEngineEvent(e)));

    this.bindPlayerInputs();

    this.game.events.on('layout-changed', this.relayout, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  update(_t: number, dtMs: number): void {
    if (this.gameEnded) return;
    if (this.scene.isPaused()) return;
    this.myEngine.tick(dtMs);
    this.snapshotAccum += dtMs;
    if (this.snapshotAccum >= SNAPSHOT_INTERVAL_MS) {
      this.snapshotAccum = 0;
      if (this.peer.isOpen()) {
        this.peer.send({ kind: 'state', snapshot: this.makeSnapshot() });
      }
    }
    this.render();
    this.updateHud();
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private computeLayout(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const portrait = w < h;
    const boardW = this.myCols() * this.cellSize;
    const boardH = this.myRows() * this.cellSize;
    const gap = portrait ? 16 : 80;
    const totalW = boardW * 2 + gap;
    const baseX = Math.floor((w - totalW) / 2);
    const baseY = portrait
      ? Math.max(60, Math.floor((h - boardH) / 2))
      : Math.max(40, Math.floor((h - boardH) / 2));
    this.playerOrigin = { x: baseX, y: baseY };
    this.opponentOrigin = { x: baseX + boardW + gap, y: baseY };
  }

  private myRows(): number {
    return this.myEngine.cfg.rows;
  }
  private myCols(): number {
    return this.myEngine.cfg.cols;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private drawHudLabels(): void {
    const labelY = Math.max(8, this.playerOrigin.y - 36);
    const subY = Math.max(22, this.playerOrigin.y - 22);
    const playerCenterX =
      this.playerOrigin.x + (this.myCols() * this.cellSize) / 2;
    const opponentCenterX =
      this.opponentOrigin.x + (this.myCols() * this.cellSize) / 2;

    this.playerLabel = this.add
      .text(playerCenterX, labelY, 'VOCÊ', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: HUD_LABEL_COLOR,
      })
      .setOrigin(0.5);

    this.opponentLabel = this.add
      .text(opponentCenterX, labelY, 'ADVERSÁRIO', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: HUD_LABEL_COLOR,
      })
      .setOrigin(0.5);

    this.playerScoreText = this.add
      .text(playerCenterX, subY, '0', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    this.opponentScoreText = this.add
      .text(opponentCenterX, subY, '0', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    const rttY =
      this.playerOrigin.y + this.myRows() * this.cellSize + 8;
    this.rttText = this.add
      .text(this.scale.gameSize.width / 2, rttY, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#999',
      })
      .setOrigin(0.5);
  }

  private updateHud(): void {
    if (this.playerScoreText) {
      this.playerScoreText.setText(`SCORE ${this.myEngine.score.score}`);
    }
    if (this.opponentScoreText) {
      const remoteScore = this.remoteSnapshot?.score ?? 0;
      this.opponentScoreText.setText(`SCORE ${remoteScore}`);
    }
    if (this.rttText) {
      const rtt = this.peer.rttMs();
      this.rttText.setText(rtt > 0 ? `RTT ${rtt}ms` : '');
    }
  }

  // ---------------------------------------------------------------------------
  // Frame / rendering
  // ---------------------------------------------------------------------------

  private drawFrames(): void {
    if (!this.framesGfx) return;
    const g = this.framesGfx;
    g.clear();
    const boardW = this.myCols() * this.cellSize;
    const boardH = this.myRows() * this.cellSize;
    for (const origin of [this.playerOrigin, this.opponentOrigin]) {
      g.fillStyle(0x0a0612, 0.85);
      g.fillRect(origin.x, origin.y, boardW, boardH);
      g.lineStyle(2, 0x5a3a72, 1);
      g.strokeRect(origin.x - 1, origin.y - 1, boardW + 2, boardH + 2);
    }
  }

  private render(): void {
    if (!this.playerBlocks || !this.opponentBlocks || !this.cursorGfx) return;
    this.playerBlocks.removeAll(true);
    this.opponentBlocks.removeAll(true);

    this.renderLocalEngine(this.playerBlocks);
    this.renderRemoteSnapshot(this.opponentBlocks);

    this.drawPlayerCursor();
  }

  private renderLocalEngine(container: Phaser.GameObjects.Container): void {
    const engine = this.myEngine;
    const grid = engine.grid;
    const cfg = engine.cfg;
    const cellSize = this.cellSize;
    const riseShift = grid.riseOffset * cellSize;

    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const cell = grid.cells[row]?.[col];
        if (!cell) continue;
        this.renderLocalBlock(cell, row, col, cfg, cellSize, riseShift, container);
      }
    }
  }

  private renderLocalBlock(
    block: Block,
    row: number,
    col: number,
    cfg: GameEngine['cfg'],
    cellSize: number,
    riseShift: number,
    container: Phaser.GameObjects.Container,
  ): void {
    let x = col * cellSize;
    let y = row * cellSize - riseShift;
    let scale = 1;
    let alpha = 1;
    let flashWhite = false;

    if (block.state === 'swapping' && cfg.swapDurationMs > 0) {
      const progress = 1 - block.swapTimer / cfg.swapDurationMs;
      const clamped = Math.max(0, Math.min(1, progress));
      x += block.swapDir * clamped * cellSize;
    } else if (block.state === 'falling' && cfg.fallStepMs > 0) {
      const progress = block.fallTimer / cfg.fallStepMs;
      const clamped = Math.max(0, Math.min(1, progress));
      y += clamped * cellSize;
    } else if (block.state === 'clearing' && cfg.clearDurationMs > 0) {
      const ratio = block.clearTimer / cfg.clearDurationMs;
      const clamped = Math.max(0, Math.min(1, ratio));
      scale = clamped;
      alpha = clamped;
      flashWhite = true;
    }

    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;

    if (block.kind === 'garbage') {
      this.drawGarbageCell(container, cx, cy, cellSize, block.unlocking ?? false);
      return;
    }

    this.drawColorCell(container, cx, cy, cellSize, block.color, scale, alpha, flashWhite);
  }

  private renderRemoteSnapshot(container: Phaser.GameObjects.Container): void {
    const snap = this.remoteSnapshot;
    if (!snap) return;
    const cellSize = this.cellSize;
    const riseShift = snap.riseOffset * cellSize;
    for (const [row, col, byte] of snap.cells) {
      const cell = decodeBlock(byte);
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize - riseShift + cellSize / 2;
      if (cell.kind === 'garbage') {
        this.drawGarbageCell(container, cx, cy, cellSize, cell.unlocking);
        continue;
      }
      // Render in a simplified state — the snapshot only carries the state
      // enum, not interpolation timers. Clearing/swapping appear as static
      // tiles which is fine at 10fps and saves the bandwidth.
      const flashWhite = cell.state === 'clearing';
      this.drawColorCell(container, cx, cy, cellSize, cell.color, 1, 1, flashWhite);
    }

    // Opponent cursor (drawn inside the container so it follows the right
    // origin without extra math). Container coords are board-local.
    const cursorRect = this.add.rectangle(
      snap.cursor.col * cellSize + cellSize,
      snap.cursor.row * cellSize - riseShift + cellSize / 2,
      cellSize * 2 - 2,
      cellSize - 2,
      0x000000,
      0,
    );
    cursorRect.setStrokeStyle(1, 0xffffee, 0.4);
    container.add(cursorRect);
  }

  private drawColorCell(
    container: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    cellSize: number,
    color: BlockColor,
    scale: number,
    alpha: number,
    flashWhite: boolean,
  ): void {
    const fillColor = flashWhite ? 0xffffff : BLOCK_COLOR_HEX[color];
    const outlineColor = darken(BLOCK_COLOR_HEX[color], 0.5);
    const rect = this.add.rectangle(
      cx,
      cy,
      cellSize - 2,
      cellSize - 2,
      fillColor,
      alpha,
    );
    rect.setStrokeStyle(1, outlineColor, alpha);
    rect.setScale(scale);

    const label = this.add
      .text(cx, cy, BLOCK_SYMBOL[color], {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: this.symbolColorFor(color),
      })
      .setOrigin(0.5)
      .setAlpha(alpha)
      .setScale(scale);

    container.add(rect);
    container.add(label);
  }

  private drawGarbageCell(
    container: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    cellSize: number,
    unlocking: boolean,
  ): void {
    const fill = unlocking ? GARBAGE_UNLOCK_FILL : GARBAGE_FILL;
    const rect = this.add.rectangle(cx, cy, cellSize - 2, cellSize - 2, fill, 1);
    rect.setStrokeStyle(1, GARBAGE_OUTLINE, 1);
    const glyph = this.add
      .text(cx, cy, '■', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    container.add(rect);
    container.add(glyph);
  }

  private drawPlayerCursor(): void {
    if (!this.cursorGfx) return;
    const g = this.cursorGfx;
    g.clear();
    const { row, col } = this.myEngine.cursor;
    const cellSize = this.cellSize;
    const riseShift = this.myEngine.grid.riseOffset * cellSize;
    const x = this.playerOrigin.x + col * cellSize;
    const y = this.playerOrigin.y + row * cellSize - riseShift;
    const w = cellSize * 2;
    const h = cellSize;
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);
    g.lineStyle(2, 0xffffee, pulse);
    g.strokeRect(x, y, w, h);
  }

  private symbolColorFor(color: BlockColor): string {
    switch (color) {
      case 'yellow':
      case 'cyan':
      case 'green':
        return '#1a0f1f';
      default:
        return '#ffffff';
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  private makeSnapshot(): BoardSnapshot {
    const g = this.myEngine.grid;
    const cells: Array<[number, number, number]> = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = g.cells[r]?.[c];
        if (!cell) continue;
        cells.push([r, c, encodeBlock(cell)]);
      }
    }
    return {
      cells,
      score: this.myEngine.score.score,
      cursor: { row: this.myEngine.cursor.row, col: this.myEngine.cursor.col },
      riseOffset: g.riseOffset,
      dropDelayMs: this.myEngine.dropDelayTimer,
      rows: g.rows,
      cols: g.cols,
    };
  }

  // ---------------------------------------------------------------------------
  // Engine ⇄ network bridge
  // ---------------------------------------------------------------------------

  private onEngineEvent(e: EngineEvent): void {
    if (this.gameEnded) return;
    if (e.type === 'garbage.outgoing') {
      this.peer.send({ kind: 'garbage', pieces: e.pieces });
    } else if (e.type === 'game.over') {
      // My engine topped out → I lose. Notify peer so they can call their win.
      this.peer.send({ kind: 'gameover', reason: 'topout' });
      this.endMatch('lost', 'topout');
    } else if (e.type === 'block.swapped') {
      SFXPlayer.get().swap();
    } else if (e.type === 'match.found') {
      SFXPlayer.get().clear(e.comboSize);
      if (e.chain >= 2) SFXPlayer.get().chain(e.chain);
    }
  }

  private handleMessage(m: OnlineMessage): void {
    if (this.gameEnded) return;
    if (m.kind === 'garbage') {
      for (const p of m.pieces) {
        this.myEngine.receiveGarbage(p);
      }
    } else if (m.kind === 'state') {
      this.remoteSnapshot = m.snapshot;
    } else if (m.kind === 'gameover') {
      // Opponent's engine topped out → I win.
      this.endMatch('won', m.reason);
    }
    // hello/start are lobby-only; ping/pong handled internally.
  }

  private handleDisconnect(): void {
    if (this.gameEnded) return;
    this.endMatch('won', 'disconnect');
  }

  private handleError(e: Error): void {
    if (this.gameEnded) return;
    // For now, treat a hard error like a disconnect — the game can't continue
    // without the channel.
    void e;
    this.endMatch('won', 'disconnect');
  }

  private endMatch(
    outcome: 'won' | 'lost',
    reason: 'topout' | 'disconnect',
  ): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    BGMPlayer.get().stop();
    SFXPlayer.get().gameOver();
    this.scene.launch('OnlineResultScene', {
      outcome,
      reason,
      myScore: this.myEngine.score.score,
      opponentScore: this.remoteSnapshot?.score ?? 0,
    });
    this.scene.pause();
  }

  // ---------------------------------------------------------------------------
  // Inputs (local engine only)
  // ---------------------------------------------------------------------------

  private bindPlayerInputs(): void {
    const canvas = this.game.canvas;
    const root = document.getElementById('game-root');
    if (!root) {
      throw new Error("PISKA: #game-root element missing from index.html");
    }

    const wired = setupDefaultInputs({
      canvas,
      virtualButtonsContainer: root,
      cellAt: (cx, cy) => this.clientToPlayerCell(cx, cy),
      cellSizePx: () => this.cellSizeOnScreenPx(),
    });
    this.input.keyboard?.disableGlobalCapture();

    const c: InputController = wired.controller;
    this.inputCtrlDestroy = () => {
      c.destroy();
      wired.virtualButtons.destroy();
    };

    this.offFns.push(
      c.on('cursorMove', (p: { dRow?: number; dCol?: number }) =>
        this.myEngine.moveCursor(p.dRow ?? 0, p.dCol ?? 0),
      ),
    );
    this.offFns.push(
      c.on('cursorSet', (p: { row: number; col: number }) =>
        this.myEngine.setCursor(p.row, p.col),
      ),
    );
    this.offFns.push(c.on('swap', () => this.myEngine.swap()));
    this.offFns.push(
      c.on('raisePress', () => this.myEngine.setManualRaise(true)),
    );
    this.offFns.push(
      c.on('raiseRelease', () => this.myEngine.setManualRaise(false)),
    );
    // Note: no Pause integration here — pausing a networked match would
    // require coordination. Esc/Pause is intercepted by OnlineResultScene
    // on game end.
  }

  private clientToPlayerCell(
    clientX: number,
    clientY: number,
  ): { row: number; col: number } | null {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const localX =
      ((clientX - rect.left) / rect.width) * this.scale.gameSize.width;
    const localY =
      ((clientY - rect.top) / rect.height) * this.scale.gameSize.height;
    const boardX = localX - this.playerOrigin.x;
    const boardY = localY - this.playerOrigin.y;
    if (boardX < 0 || boardY < 0) return null;
    const col = Math.floor(boardX / this.cellSize);
    const row = Math.floor(boardY / this.cellSize);
    if (row < 0 || row >= this.myRows()) return null;
    if (col < 0 || col >= this.myCols()) return null;
    return { row, col };
  }

  private cellSizeOnScreenPx(): number {
    const canvas = this.game.canvas;
    const ratio = canvas.clientWidth / this.scale.gameSize.width;
    return this.cellSize * ratio;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    this.computeLayout();
    this.drawFrames();
    if (this.playerBlocks) {
      this.playerBlocks.setPosition(this.playerOrigin.x, this.playerOrigin.y);
    }
    if (this.opponentBlocks) {
      this.opponentBlocks.setPosition(this.opponentOrigin.x, this.opponentOrigin.y);
    }
    this.destroyHud();
    this.drawHudLabels();
  }

  private destroyHud(): void {
    this.playerLabel?.destroy();
    this.opponentLabel?.destroy();
    this.playerScoreText?.destroy();
    this.opponentScoreText?.destroy();
    this.rttText?.destroy();
    this.playerLabel = null;
    this.opponentLabel = null;
    this.playerScoreText = null;
    this.opponentScoreText = null;
    this.rttText = null;
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.inputCtrlDestroy?.();
    this.inputCtrlDestroy = null;
    this.offFns.forEach((off) => off());
    this.offFns = [];
    this.destroyHud();
    if (!this.didTransferPeer) {
      // OnlineResultScene's actions destroy the peer themselves when leaving;
      // if we're being torn down without a result transfer (e.g. scene
      // shutdown via global stop), tear it down here as a safety net.
      this.peer?.destroy();
    }
  }
}
