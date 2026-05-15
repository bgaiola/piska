/**
 * VsLocalScene — Vs mode for two humans on the same keyboard.
 *
 * Mirrors VsScene's two-board layout and garbage bridge, but replaces the
 * single-player InputController + AIPlayer with ad-hoc window-level keyboard
 * listeners that fan out to two independent input states. The InputController
 * is single-player by design and isn't wired here.
 *
 * Controls:
 *   P1 (left)  — WASD to move, J swap, K (hold) raise.
 *   P2 (right) — Arrow keys to move, Enter or Right Shift swap, Shift (hold) raise.
 *                NumpadEnter / NumpadDecimal / Numpad0 are accepted aliases.
 *   Either    — P or Escape pauses.
 *
 * End condition: first engine to emit `game.over` loses; we launch
 * VsResultScene with `mode: 'local'` so the result screen shows P1/P2
 * labels instead of "VOCÊ / IA".
 *
 * Visual rendering reuses the same block / cursor / telegraph approach as
 * VsScene. We render once per frame; both boards share a single Graphics
 * instance for telegraphs and another for cursors.
 */

import Phaser from 'phaser';
import { GameEngine } from '@/engine';
import type { Block, EngineEvent } from '@/engine';
import { BGMPlayer, SFXPlayer } from '@/audio';
import { BLOCK_COLOR_HEX, BLOCK_SIZE_LOGICAL } from '@/config';
import { ChainPopup } from '@/ui/ChainPopup';
import { spawnClearBurst } from '@/engine/ParticleFX';
import { haptic, HAPTIC } from '@/utils/haptics';

const VS_CELL_SIZE = 22;
const GARBAGE_FILL = 0x666666;
const GARBAGE_OUTLINE = 0x222222;
const GARBAGE_UNLOCK_FILL = 0xa08070;
const HUD_LABEL_COLOR = '#ffe';
const HUD_SUB_COLOR = '#bbf';
const GARBAGE_COUNTER_COLOR = '#f9c';

interface PlayerInputs {
  up: string;
  down: string;
  left: string;
  right: string;
  swap: string[];
  raise: string[];
}

// Key matching is case-insensitive for letters; Arrow keys / Enter / Shift
// keep their exact `e.key` values. Numpad aliases are checked via `e.code`.
const P1_KEYS: PlayerInputs = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
  swap: ['j'],
  raise: ['k'],
};

const P2_KEYS: PlayerInputs = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  // Right Shift is captured via e.code === 'ShiftRight'; Enter via e.key.
  swap: ['Enter'],
  raise: ['Shift'],
};

export class VsLocalScene extends Phaser.Scene {
  private p1Engine!: GameEngine;
  private p2Engine!: GameEngine;

  private readonly cellSize = VS_CELL_SIZE;
  private p1Origin = { x: 0, y: 0 };
  private p2Origin = { x: 0, y: 0 };

  private p1Blocks: Phaser.GameObjects.Container | null = null;
  private p2Blocks: Phaser.GameObjects.Container | null = null;
  private framesGfx: Phaser.GameObjects.Graphics | null = null;
  private cursorGfx: Phaser.GameObjects.Graphics | null = null;
  private telegraphGfx: Phaser.GameObjects.Graphics | null = null;

  private p1Label: Phaser.GameObjects.Text | null = null;
  private p2Label: Phaser.GameObjects.Text | null = null;
  private p1ScoreText: Phaser.GameObjects.Text | null = null;
  private p2ScoreText: Phaser.GameObjects.Text | null = null;
  private p1GarbageText: Phaser.GameObjects.Text | null = null;
  private p2GarbageText: Phaser.GameObjects.Text | null = null;

  private p1RaiseHeld = false;
  private p2RaiseHeld = false;

  private keyDownH: ((e: KeyboardEvent) => void) | null = null;
  private keyUpH: ((e: KeyboardEvent) => void) | null = null;

  private offFns: Array<() => void> = [];
  private gameEnded = false;

  constructor() {
    super('VsLocalScene');
  }

  init(): void {
    this.gameEnded = false;
    this.p1RaiseHeld = false;
    this.p2RaiseHeld = false;
    this.offFns = [];
  }

  create(): void {
    const baseSeed = Date.now() & 0x7fffffff;
    this.p1Engine = new GameEngine({ rngSeed: baseSeed });
    this.p2Engine = new GameEngine({ rngSeed: (baseSeed ^ 0x99) & 0x7fffffff });

    BGMPlayer.get().play('world-5');

    this.cameras.main.setBackgroundColor('#160a1f');

    this.computeLayout();

    this.framesGfx = this.add.graphics();
    this.drawFrames();

    this.p1Blocks = this.add.container(this.p1Origin.x, this.p1Origin.y);
    this.p2Blocks = this.add.container(this.p2Origin.x, this.p2Origin.y);
    this.cursorGfx = this.add.graphics();
    this.telegraphGfx = this.add.graphics();

    this.drawHudLabels();

    this.bindGarbageBridge();
    this.bindEngineEvents();
    this.bindKeyboard();
    this.bindEndConditions();

    this.game.events.on('layout-changed', this.relayout, this);

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  update(_t: number, dtMs: number): void {
    if (this.scene.isPaused()) return;
    if (this.gameEnded) return;
    this.p1Engine.tick(dtMs);
    this.p2Engine.tick(dtMs);
    // Raise is a hold-to-apply action; re-assert every tick so the engine's
    // internal "manual raise active" stays true while the key is down.
    if (this.p1RaiseHeld) this.p1Engine.setManualRaise(true);
    if (this.p2RaiseHeld) this.p2Engine.setManualRaise(true);
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
    const boardW = this.p1Engine.cfg.cols * this.cellSize;
    const boardH = this.p1Engine.cfg.rows * this.cellSize;
    const gap = portrait ? 16 : 80;
    const totalW = boardW * 2 + gap;
    const baseX = Math.floor((w - totalW) / 2);
    const baseY = portrait
      ? Math.max(60, Math.floor((h - boardH) / 2))
      : Math.max(40, Math.floor((h - boardH) / 2));
    this.p1Origin = { x: baseX, y: baseY };
    this.p2Origin = { x: baseX + boardW + gap, y: baseY };
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private drawHudLabels(): void {
    const labelY = Math.max(8, this.p1Origin.y - 36);
    const subY = Math.max(22, this.p1Origin.y - 22);

    const cols = this.p1Engine.cfg.cols;
    const p1CenterX = this.p1Origin.x + (cols * this.cellSize) / 2;
    const p2CenterX = this.p2Origin.x + (cols * this.cellSize) / 2;

    this.p1Label = this.add
      .text(p1CenterX, labelY, 'JOGADOR 1', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: HUD_LABEL_COLOR,
      })
      .setOrigin(0.5);

    this.p2Label = this.add
      .text(p2CenterX, labelY, 'JOGADOR 2', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: HUD_LABEL_COLOR,
      })
      .setOrigin(0.5);

    this.p1ScoreText = this.add
      .text(p1CenterX, subY, '0', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    this.p2ScoreText = this.add
      .text(p2CenterX, subY, '0', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    const garbageY = this.p1Origin.y + this.p1Engine.cfg.rows * this.cellSize + 8;
    this.p1GarbageText = this.add
      .text(p1CenterX, garbageY, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: GARBAGE_COUNTER_COLOR,
      })
      .setOrigin(0.5);
    this.p2GarbageText = this.add
      .text(p2CenterX, garbageY, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: GARBAGE_COUNTER_COLOR,
      })
      .setOrigin(0.5);
  }

  private updateHud(): void {
    if (this.p1ScoreText)
      this.p1ScoreText.setText(`SCORE ${this.p1Engine.score.score}`);
    if (this.p2ScoreText)
      this.p2ScoreText.setText(`SCORE ${this.p2Engine.score.score}`);

    const pq1 = this.p1Engine.garbage?.size?.() ?? 0;
    const pq2 = this.p2Engine.garbage?.size?.() ?? 0;
    if (this.p1GarbageText)
      this.p1GarbageText.setText(pq1 > 0 ? `GARBAGE: ${pq1}` : '');
    if (this.p2GarbageText)
      this.p2GarbageText.setText(pq2 > 0 ? `GARBAGE: ${pq2}` : '');
  }

  // ---------------------------------------------------------------------------
  // Frame & rendering
  // ---------------------------------------------------------------------------

  private drawFrames(): void {
    if (!this.framesGfx) return;
    const g = this.framesGfx;
    g.clear();

    const cols = this.p1Engine.cfg.cols;
    const rows = this.p1Engine.cfg.rows;
    const boardW = cols * this.cellSize;
    const boardH = rows * this.cellSize;

    for (const origin of [this.p1Origin, this.p2Origin]) {
      g.fillStyle(0x0a0612, 0.85);
      g.fillRect(origin.x, origin.y, boardW, boardH);
      g.lineStyle(2, 0x5a3a72, 1);
      g.strokeRect(origin.x - 1, origin.y - 1, boardW + 2, boardH + 2);
    }
  }

  private render(): void {
    if (!this.p1Blocks || !this.p2Blocks || !this.cursorGfx) return;
    this.p1Blocks.removeAll(true);
    this.p2Blocks.removeAll(true);

    this.renderEngine(this.p1Engine, this.p1Blocks);
    this.renderEngine(this.p2Engine, this.p2Blocks);

    this.drawCursors();
    this.drawTelegraph();
  }

  private drawTelegraph(): void {
    if (!this.telegraphGfx) return;
    const g = this.telegraphGfx;
    g.clear();

    const cellSize = this.cellSize;
    const draw = (engine: GameEngine, originX: number, originY: number): void => {
      const queue = (engine.garbage as unknown as {
        queue?: ReadonlyArray<{ width: number; height: number }>;
      }).queue;
      const size = engine.garbage.size();
      if (size === 0) return;

      const stripY = originY - 12;
      const stripH = 4;
      const peekW = engine.cfg.cols * cellSize;
      const gap = 2;
      let x = originX;
      const pieces =
        queue ?? Array.from({ length: size }, () => ({ width: engine.cfg.cols, height: 1 }));
      let totalDrawnW = 0;
      pieces.forEach((p, idx) => {
        const w = (p.width / engine.cfg.cols) * peekW;
        const h = stripH * Math.min(p.height, 2);
        g.fillStyle(idx === 0 ? 0xffaa44 : 0x8866cc, 0.95);
        g.fillRect(x, stripY - (h - stripH), w, h);
        g.lineStyle(1, 0x000000, 0.6);
        g.strokeRect(x, stripY - (h - stripH), w, h);
        x += w + gap;
        totalDrawnW += w + gap;
        if (totalDrawnW > peekW) return;
      });
      const dropMs = engine.cfg.garbageDropDelayMs;
      const left = Math.max(0, engine.dropDelayTimer);
      const ratio = Math.min(1, left / dropMs);
      const barY = stripY + stripH + 2;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(originX, barY, peekW, 2);
      g.fillStyle(0xff5555, 0.95);
      g.fillRect(originX, barY, peekW * (1 - ratio), 2);
    };
    draw(this.p1Engine, this.p1Origin.x, this.p1Origin.y);
    draw(this.p2Engine, this.p2Origin.x, this.p2Origin.y);
  }

  private renderEngine(
    engine: GameEngine,
    container: Phaser.GameObjects.Container,
  ): void {
    const grid = engine.grid;
    const cfg = engine.cfg;
    const cellSize = this.cellSize;
    const riseShift = grid.riseOffset * cellSize;

    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const cell = grid.cells[row]?.[col];
        if (!cell) continue;
        if (cell.kind === 'garbage') {
          const id = cell.garbageGroupId;
          if (id !== undefined) {
            const above = row > 0 ? grid.cells[row - 1]?.[col] : null;
            const left = col > 0 ? grid.cells[row]?.[col - 1] : null;
            if (above?.kind === 'garbage' && above.garbageGroupId === id) continue;
            if (left?.kind === 'garbage' && left.garbageGroupId === id) continue;
          }
        }
        this.renderBlock(cell, row, col, cfg, cellSize, riseShift, container);
      }
    }
  }

  private renderBlock(
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
      this.drawGarbageCell(container, cx, cy, cellSize, block);
      return;
    }

    const baseScale = cellSize / BLOCK_SIZE_LOGICAL;
    const sprite = this.add.image(cx, cy, `block-${block.color}`);
    sprite.setAlpha(alpha);
    sprite.setScale(baseScale * scale);
    if (flashWhite) sprite.setTintFill(0xffffff);
    container.add(sprite);
  }

  private drawGarbageCell(
    container: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    cellSize: number,
    block: Block,
  ): void {
    const fill = block.unlocking ? GARBAGE_UNLOCK_FILL : GARBAGE_FILL;
    const gw = block.garbageWidth ?? 1;
    const gh = block.garbageHeight ?? 1;
    const totalW = gw * cellSize;
    const totalH = gh * cellSize;
    const groupCx = cx + ((gw - 1) * cellSize) / 2;
    const groupCy = cy + ((gh - 1) * cellSize) / 2;
    const rect = this.add.rectangle(groupCx, groupCy, totalW - 2, totalH - 2, fill, 1);
    rect.setStrokeStyle(2, GARBAGE_OUTLINE, 1);

    const glyph = this.add
      .text(groupCx, groupCy, '■', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    if (block.unlocking) {
      const t = (block.unlockTimer ?? 0) % 200;
      glyph.setAlpha(0.5 + (t / 200) * 0.5);
    }

    container.add(rect);
    container.add(glyph);
  }

  private drawCursors(): void {
    if (!this.cursorGfx) return;
    const g = this.cursorGfx;
    g.clear();

    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);
    const cellSize = this.cellSize;

    // P1 cursor.
    {
      const { row, col } = this.p1Engine.cursor;
      const riseShift = this.p1Engine.grid.riseOffset * cellSize;
      const x = this.p1Origin.x + col * cellSize;
      const y = this.p1Origin.y + row * cellSize - riseShift;
      g.lineStyle(2, 0xa6f0ff, pulse);
      g.strokeRect(x, y, cellSize * 2, cellSize);
    }
    // P2 cursor.
    {
      const { row, col } = this.p2Engine.cursor;
      const riseShift = this.p2Engine.grid.riseOffset * cellSize;
      const x = this.p2Origin.x + col * cellSize;
      const y = this.p2Origin.y + row * cellSize - riseShift;
      g.lineStyle(2, 0xffd0a6, pulse);
      g.strokeRect(x, y, cellSize * 2, cellSize);
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  private bindGarbageBridge(): void {
    this.offFns.push(
      this.p1Engine.events.on((e: EngineEvent) => {
        if (e.type === 'garbage.outgoing') {
          for (const piece of e.pieces) {
            this.p2Engine.receiveGarbage(piece);
          }
        }
      }),
    );
    this.offFns.push(
      this.p2Engine.events.on((e: EngineEvent) => {
        if (e.type === 'garbage.outgoing') {
          for (const piece of e.pieces) {
            this.p1Engine.receiveGarbage(piece);
          }
        }
      }),
    );
  }

  private bindEngineEvents(): void {
    // SFX + popups + bursts + camera shake fire on either side; both players
    // share the same display.
    const wireSide = (
      engine: GameEngine,
      originX: number,
      originY: number,
    ): void => {
      this.offFns.push(
        engine.events.on((e: EngineEvent) => {
          if (e.type === 'block.swapped') {
            SFXPlayer.get().swap();
            haptic(HAPTIC.swap);
          } else if (e.type === 'match.found') {
            SFXPlayer.get().clear(e.comboSize);
            if (e.chain >= 2) SFXPlayer.get().chain(e.chain);
            this.onMatchFound(engine, e, originX, originY);
          } else if (e.type === 'garbage.dropped') {
            haptic(HAPTIC.garbage);
          } else if (e.type === 'game.over') {
            haptic(HAPTIC.gameOver);
          }
        }),
      );
    };
    wireSide(this.p1Engine, this.p1Origin.x, this.p1Origin.y);
    wireSide(this.p2Engine, this.p2Origin.x, this.p2Origin.y);
  }

  private onMatchFound(
    engine: GameEngine,
    e: Extract<EngineEvent, { type: 'match.found' }>,
    originX: number,
    originY: number,
  ): void {
    const cellSize = this.cellSize;
    const riseShift = engine.grid.riseOffset * cellSize;

    // Topmost (smallest row) cell anchors the chain/combo popup.
    let topCell = e.cells[0];
    for (const c of e.cells) {
      if (c.row < topCell.row) topCell = c;
    }
    const popupX = originX + (topCell.col + 0.5) * cellSize;
    const popupY = originY + topCell.row * cellSize - riseShift - 12;
    ChainPopup.showCombo(this, popupX, popupY, e.comboSize);
    ChainPopup.showChain(this, popupX, popupY + 16, e.chain);

    // Per-cell sparks; tint matches the cleared block color when present.
    for (const c of e.cells) {
      const block = engine.grid.cells[c.row]?.[c.col];
      if (!block || block.kind === 'garbage') continue;
      const cx = originX + (c.col + 0.5) * cellSize;
      const cy = originY + (c.row + 0.5) * cellSize - riseShift;
      spawnClearBurst(this, cx, cy, BLOCK_COLOR_HEX[block.color]);
    }

    if (e.chain >= 3 || e.comboSize >= 5) {
      const intensity = Math.min(0.012, 0.004 + e.chain * 0.0015);
      this.cameras.main.shake(100 + e.chain * 20, intensity);
    }
    if (e.chain >= 2) haptic(HAPTIC.chain(e.chain));
    else haptic(HAPTIC.match);
  }

  private bindEndConditions(): void {
    const onOver = (winner: 'p1' | 'p2'): void => {
      if (this.gameEnded) return;
      this.gameEnded = true;
      BGMPlayer.get().stop();
      SFXPlayer.get().gameOver();
      this.scene.launch('VsResultScene', {
        winner,
        mode: 'local',
        p1Score: this.p1Engine.score.score,
        p2Score: this.p2Engine.score.score,
        playerScore: this.p1Engine.score.score,
        aiScore: this.p2Engine.score.score,
      });
      this.scene.pause();
    };

    this.offFns.push(
      this.p1Engine.events.on((e: EngineEvent) => {
        if (e.type === 'game.over') onOver('p2');
      }),
    );
    this.offFns.push(
      this.p2Engine.events.on((e: EngineEvent) => {
        if (e.type === 'game.over') onOver('p1');
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Keyboard — ad-hoc two-player handling.
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    // Disable Phaser's keyboard so it doesn't also dispatch — we want a single
    // source of truth at the window level for both players.
    this.input.keyboard?.disableGlobalCapture();

    const isP2Swap = (e: KeyboardEvent): boolean => {
      if (e.key === 'Enter') return true;
      if (e.code === 'NumpadEnter') return true;
      if (e.code === 'Numpad0') return true;
      if (e.code === 'ShiftRight') return true;
      return false;
    };
    const isP2Raise = (e: KeyboardEvent): boolean => {
      // Right shift is the canonical "raise" for P2. Numpad decimal is the
      // alias mentioned in the spec.
      if (e.code === 'ShiftRight') return true;
      if (e.code === 'NumpadDecimal') return true;
      return false;
    };
    const isP1Key = (e: KeyboardEvent, key: string): boolean =>
      e.key.toLowerCase() === key;

    const onDown = (e: KeyboardEvent): void => {
      if (this.gameEnded) return;

      // Pause shortcut — accept either P / Esc; either player can trigger it.
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        this.pauseGame();
        return;
      }

      // ── Player 1 ───────────────────────────────────────────────────────
      if (isP1Key(e, P1_KEYS.up)) {
        e.preventDefault();
        this.p1Engine.moveCursor(-1, 0);
        return;
      }
      if (isP1Key(e, P1_KEYS.down)) {
        e.preventDefault();
        this.p1Engine.moveCursor(1, 0);
        return;
      }
      if (isP1Key(e, P1_KEYS.left)) {
        e.preventDefault();
        this.p1Engine.moveCursor(0, -1);
        return;
      }
      if (isP1Key(e, P1_KEYS.right)) {
        e.preventDefault();
        this.p1Engine.moveCursor(0, 1);
        return;
      }
      if (P1_KEYS.swap.some((k) => isP1Key(e, k))) {
        e.preventDefault();
        this.p1Engine.swap();
        return;
      }
      if (P1_KEYS.raise.some((k) => isP1Key(e, k))) {
        e.preventDefault();
        if (!e.repeat) {
          this.p1RaiseHeld = true;
          this.p1Engine.setManualRaise(true);
        }
        return;
      }

      // ── Player 2 ───────────────────────────────────────────────────────
      if (e.key === P2_KEYS.up) {
        e.preventDefault();
        this.p2Engine.moveCursor(-1, 0);
        return;
      }
      if (e.key === P2_KEYS.down) {
        e.preventDefault();
        this.p2Engine.moveCursor(1, 0);
        return;
      }
      if (e.key === P2_KEYS.left) {
        e.preventDefault();
        this.p2Engine.moveCursor(0, -1);
        return;
      }
      if (e.key === P2_KEYS.right) {
        e.preventDefault();
        this.p2Engine.moveCursor(0, 1);
        return;
      }
      if (isP2Swap(e)) {
        e.preventDefault();
        this.p2Engine.swap();
        return;
      }
      if (isP2Raise(e)) {
        e.preventDefault();
        if (!e.repeat) {
          this.p2RaiseHeld = true;
          this.p2Engine.setManualRaise(true);
        }
        return;
      }
    };

    const onUp = (e: KeyboardEvent): void => {
      // Stopping raise is the only release we care about.
      if (P1_KEYS.raise.some((k) => e.key.toLowerCase() === k)) {
        this.p1RaiseHeld = false;
        this.p1Engine.setManualRaise(false);
      }
      if (isP2Raise(e)) {
        this.p2RaiseHeld = false;
        this.p2Engine.setManualRaise(false);
      }
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    this.keyDownH = onDown;
    this.keyUpH = onUp;
  }

  private pauseGame(): void {
    if (this.p1Engine.gameOver || this.p2Engine.gameOver) return;
    if (this.gameEnded) return;
    // Releasing raise on pause avoids "stuck raise" on resume.
    this.p1RaiseHeld = false;
    this.p2RaiseHeld = false;
    this.p1Engine.setManualRaise(false);
    this.p2Engine.setManualRaise(false);
    this.p1Engine.pause();
    this.p2Engine.pause();
    this.scene.launch('PauseScene', {
      engine: this.p1Engine,
      vsAiEngine: this.p2Engine,
      resumeSceneKey: 'VsLocalScene',
      quitSceneKey: 'ModeSelectScene',
    });
    this.scene.pause();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    this.computeLayout();
    this.drawFrames();
    if (this.p1Blocks) this.p1Blocks.setPosition(this.p1Origin.x, this.p1Origin.y);
    if (this.p2Blocks) this.p2Blocks.setPosition(this.p2Origin.x, this.p2Origin.y);
    this.destroyHud();
    this.drawHudLabels();
  }

  private destroyHud(): void {
    this.p1Label?.destroy();
    this.p2Label?.destroy();
    this.p1ScoreText?.destroy();
    this.p2ScoreText?.destroy();
    this.p1GarbageText?.destroy();
    this.p2GarbageText?.destroy();
    this.p1Label = null;
    this.p2Label = null;
    this.p1ScoreText = null;
    this.p2ScoreText = null;
    this.p1GarbageText = null;
    this.p2GarbageText = null;
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    if (this.keyDownH) {
      window.removeEventListener('keydown', this.keyDownH);
      this.keyDownH = null;
    }
    if (this.keyUpH) {
      window.removeEventListener('keyup', this.keyUpH);
      this.keyUpH = null;
    }
    this.offFns.forEach((off) => off());
    this.offFns = [];
    this.destroyHud();
  }
}
