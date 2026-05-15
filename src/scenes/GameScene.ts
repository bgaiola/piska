/**
 * GameScene — owns the GameEngine, wires the InputController to it, and
 * renders the grid + cursor every frame.
 *
 * Mode dispatch (fase 2):
 *   The scene accepts an `init({ mode, ... })` payload from ModeSelectScene
 *   (or any scene starting GameScene). The payload picks one of the solo
 *   modes — endless, time-attack, stage-clear, puzzle — and supplies any
 *   mode-specific parameters. GameScene constructs the matching ModeBase
 *   subclass, ticks it after the engine, and routes the finished result to
 *   ResultScene. Endless remains the default for backward compatibility.
 *
 * Rendering strategy (fase 1):
 *   - Pure Graphics / Rectangle / Text primitives. No spritesheets yet.
 *   - One `Phaser.GameObjects.Container` holds all block visuals so they share
 *     the board origin. We rebuild it from scratch each frame — the grid is
 *     small (6×12 = 72 cells max), so this is cheaper than diffing.
 *   - Engine animation timers (swapTimer, fallTimer, clearTimer) are read
 *     directly from each Block and converted into pixel offsets / scale.
 *   - `grid.riseOffset` ∈ [0,1) is multiplied by cellSize and subtracted from
 *     every block's Y so the stack appears to slide upward smoothly between
 *     full-row rises.
 *
 * Input wiring delegates entirely to `setupDefaultInputs` from the engine
 * input module. We translate its high-level events into engine method calls.
 */

import Phaser from 'phaser';
import { GameEngine } from '@/engine';
import type { Block, BlockColor, EngineConfig, EngineEvent } from '@/engine';
import { setupDefaultInputs } from '@/engine/input/setupDefaultInputs';
import type { InputController } from '@/engine/input/InputController';
import { BGMPlayer, SFXPlayer } from '@/audio';
import {
  BLOCK_COLOR_HEX,
  BLOCK_SYMBOL,
  BLOCK_SIZE_LOGICAL,
  darken,
} from '@/config';
import {
  EndlessMode,
  PuzzleMode,
  StageClearMode,
  TimeAttackMode,
  type GameMode,
  type ModeBase,
} from '@/modes';
import { ChainPopup } from '@/ui/ChainPopup';
import { spawnClearBurst } from '@/engine/ParticleFX';
import { getStageById, computeStarsForStage } from '@/data/stages';

interface GameSceneInit {
  mode?: GameMode;
  timeLimitMs?: number;
  movesAllowed?: number;
  initialStackHeight?: number;
  targetLine?: number;
  /** Adventure difficulty: number of colors in the bag. */
  numColors?: 4 | 5 | 6;
  /** Adventure difficulty: base rise speed in rows/sec. */
  baseRiseSpeed?: number;
  /** Adventure determinism: optional fixed RNG seed for the stage. */
  rngSeed?: number;
  /** When set, GameScene is running inside the Adventure flow and will
   *  route the result to StageOutroScene instead of ResultScene. */
  adventureStageId?: string;
}

export class GameScene extends Phaser.Scene {
  private engine!: GameEngine;
  private mode!: ModeBase;
  private modeKind: GameMode = 'endless';
  private modeInit: GameSceneInit = {};
  private boardOrigin = { x: 0, y: 0 };
  private blocks: Phaser.GameObjects.Container | null = null;
  private cursorGfx: Phaser.GameObjects.Graphics | null = null;
  private gridGfx: Phaser.GameObjects.Graphics | null = null;
  private engineEventOff: (() => void) | null = null;
  private controllerOffs: Array<() => void> = [];
  private inputCtrlDestroy: (() => void) | null = null;
  private resultLaunched = false;
  private readonly cellSize = BLOCK_SIZE_LOGICAL;
  // Tween-driven scale read by drawCursor() each frame so the outline
  // breathes alongside the sine-wave alpha pulse.
  private cursorScale = 1;
  private cursorScaleTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('GameScene');
  }

  init(data?: GameSceneInit): void {
    this.modeInit = data ?? {};
    this.modeKind = this.modeInit.mode ?? 'endless';
    this.resultLaunched = false;
  }

  create(): void {
    this.engine = new GameEngine(this.engineConfigForMode());

    // Some modes seed a hand-crafted layout after the engine has populated its
    // default initial stack. We replace the grid contents in-place; the engine
    // doesn't expose a "reset grid" helper, so this is the least-invasive
    // option that still uses public state.
    this.applyModeLayout();

    this.mode = this.buildMode();

    this.computeBoardOrigin();

    this.gridGfx = this.add.graphics();
    this.drawBoardFrame();

    this.blocks = this.add.container(this.boardOrigin.x, this.boardOrigin.y);
    this.cursorGfx = this.add.graphics();

    // HUD overlay
    this.scene.launch('HUDScene', { engine: this.engine, mode: this.mode });

    this.setupInputs();
    this.setupEngineHooks();
    this.setupAudio();

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());

    this.game.events.on('layout-changed', this.relayout, this);

    this.startCursorPulse();
  }

  private startCursorPulse(): void {
    this.cursorScaleTween?.stop();
    this.cursorScale = 1;
    this.cursorScaleTween = this.tweens.add({
      targets: this,
      cursorScale: { from: 1, to: 1.04 },
      duration: 600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  update(_time: number, dtMs: number): void {
    if (this.scene.isPaused()) return;
    this.engine.tick(dtMs);
    this.mode.onTick(dtMs);
    if (this.mode.isFinished() && !this.resultLaunched) {
      this.resultLaunched = true;
      BGMPlayer.get().stop();
      if (this.mode.getResult() === 'lost') SFXPlayer.get().gameOver();
      const adventureStageId = this.modeInit.adventureStageId;
      if (adventureStageId) {
        this.routeAdventureResult(adventureStageId);
      } else {
        this.scene.launch('ResultScene', { result: this.mode.getResultData() });
      }
      this.scene.pause();
    }
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Adventure result routing
  // ---------------------------------------------------------------------------

  private routeAdventureResult(stageId: string): void {
    const stage = getStageById(stageId);
    const result = this.mode.getResult();
    const data = this.mode.getResultData();
    const stars = stage
      ? computeStarsForStage(stage, data, result === 'won')
      : 0;
    this.scene.launch('StageOutroScene', {
      stageId,
      result: result === 'won' ? 'won' : 'lost',
      stars,
      score: data.score,
      timeMs: data.timeMs,
    });
  }

  // ---------------------------------------------------------------------------
  // Mode setup
  // ---------------------------------------------------------------------------

  private engineConfigForMode(): Partial<EngineConfig> {
    // Adventure passes numColors / baseRiseSpeed / rngSeed. We respect those
    // overrides on top of the per-mode defaults below.
    const adv: Partial<EngineConfig> = {};
    if (this.modeInit.numColors) adv.numColors = this.modeInit.numColors;
    if (this.modeInit.rngSeed !== undefined) adv.rngSeed = this.modeInit.rngSeed;

    switch (this.modeKind) {
      case 'stage-clear':
        return {
          rows: 12,
          cols: 6,
          numColors: 5,
          initialStackHeight: this.modeInit.initialStackHeight ?? 8,
          baseRiseSpeed: this.modeInit.baseRiseSpeed ?? 0,
          ...adv,
        };
      case 'puzzle':
        return {
          rows: 8,
          cols: 6,
          numColors: 5,
          initialStackHeight: 0,
          baseRiseSpeed: 0,
          ...adv,
        };
      case 'time-attack':
      case 'endless':
      case 'vs-ai':
      default:
        return {
          rows: 12,
          cols: 6,
          numColors: 5,
          initialStackHeight: this.modeInit.initialStackHeight ?? 5,
          ...(this.modeInit.baseRiseSpeed !== undefined
            ? { baseRiseSpeed: this.modeInit.baseRiseSpeed }
            : {}),
          ...adv,
        };
    }
  }

  /**
   * Replace the engine's grid cells in-place for modes that need a fixed
   * layout. Currently only Puzzle does this; other modes accept the engine's
   * randomized starting stack.
   */
  private applyModeLayout(): void {
    if (this.modeKind !== 'puzzle') return;
    this.seedPuzzleLayout();
  }

  /**
   * One hand-crafted starter puzzle. Designed to be solvable in ~3 swaps:
   * - bottom row has two color clusters that align into vertical/horizontal
   *   matches with one or two swaps.
   *
   * Layout (8 rows × 6 cols, top empty):
   *
   *   . . . . . .
   *   . . . . . .
   *   . . . . . .
   *   . . . . . .
   *   . . . . . .
   *   . R . . . .
   *   B R . . G G
   *   B R B G B G
   *
   * Optimal solution clears all blocks in 3 swaps.
   */
  private seedPuzzleLayout(): void {
    const g = this.engine.grid;
    // Clear the entire grid first.
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        g.cells[r][c] = null;
      }
    }
    const place = (row: number, col: number, color: BlockColor): void => {
      g.cells[row][col] = {
        id: -(row * g.cols + col + 1),
        color,
        kind: 'color',
        state: 'idle',
        swapTimer: 0,
        clearTimer: 0,
        fallTimer: 0,
        swapDir: 0,
      };
    };
    const last = g.rows - 1; // 7
    const penultimate = g.rows - 2; // 6
    const above = g.rows - 3; // 5

    // Bottom row.
    place(last, 0, 'blue');
    place(last, 1, 'red');
    place(last, 2, 'blue');
    place(last, 3, 'green');
    place(last, 4, 'blue');
    place(last, 5, 'green');
    // Row above bottom.
    place(penultimate, 0, 'blue');
    place(penultimate, 1, 'red');
    place(penultimate, 4, 'green');
    place(penultimate, 5, 'green');
    // Two rows above bottom.
    place(above, 1, 'red');
  }

  private buildMode(): ModeBase {
    switch (this.modeKind) {
      case 'time-attack':
        return new TimeAttackMode(this.engine, {
          totalMs: this.modeInit.timeLimitMs ?? 120_000,
        });
      case 'stage-clear':
        return new StageClearMode(this.engine, {
          initialStackHeight: this.modeInit.initialStackHeight ?? 8,
          targetLine: this.modeInit.targetLine ?? this.engine.cfg.rows - 2,
          timeLimitMs: this.modeInit.timeLimitMs,
        });
      case 'puzzle':
        return new PuzzleMode(this.engine, {
          movesAllowed: this.modeInit.movesAllowed ?? 5,
        });
      case 'endless':
      case 'vs-ai':
      default:
        return new EndlessMode(this.engine);
    }
  }

  // ---------------------------------------------------------------------------
  // Setup helpers
  // ---------------------------------------------------------------------------

  private setupInputs(): void {
    const canvas = this.game.canvas;
    const root = document.getElementById('game-root');
    if (!root) {
      throw new Error("PISKA: #game-root element missing from index.html");
    }

    const wired = setupDefaultInputs({
      canvas,
      virtualButtonsContainer: root,
      cellAt: (clientX: number, clientY: number) =>
        this.clientToCell(clientX, clientY),
      cellSizePx: () => this.cellSizeOnScreen(),
    });

    // Phaser's own keyboard system would otherwise swallow the same keys that
    // our adapter listens to. Disabling global capture lets the document-level
    // listeners in KeyboardAdapter receive events unimpeded.
    this.input.keyboard?.disableGlobalCapture();

    const c: InputController = wired.controller;
    this.inputCtrlDestroy = () => {
      c.destroy();
      wired.virtualButtons.destroy();
    };

    this.controllerOffs.push(
      c.on('cursorMove', (p: { dRow?: number; dCol?: number }) => {
        this.engine.moveCursor(p.dRow ?? 0, p.dCol ?? 0);
      }),
    );
    this.controllerOffs.push(
      c.on('cursorSet', (p: { row: number; col: number }) => {
        this.engine.setCursor(p.row, p.col);
      }),
    );
    this.controllerOffs.push(c.on('swap', () => this.engine.swap()));
    this.controllerOffs.push(
      c.on('raisePress', () => this.engine.setManualRaise(true)),
    );
    this.controllerOffs.push(
      c.on('raiseRelease', () => this.engine.setManualRaise(false)),
    );
    this.controllerOffs.push(
      c.on('pause', () => {
        if (this.engine.gameOver || this.mode.isFinished()) return;
        this.engine.pause();
        const quitSceneKey = this.modeInit.adventureStageId
          ? 'AdventureStageSelectScene'
          : 'ModeSelectScene';
        this.scene.launch('PauseScene', {
          engine: this.engine,
          resumeSceneKey: 'GameScene',
          quitSceneKey,
        });
        this.scene.pause();
      }),
    );
  }

  private setupEngineHooks(): void {
    this.engineEventOff = this.engine.events.on((e: EngineEvent) => {
      if (e.type === 'block.swapped') {
        SFXPlayer.get().swap();
      } else if (e.type === 'match.found') {
        SFXPlayer.get().clear(e.comboSize);
        if (e.chain >= 2) SFXPlayer.get().chain(e.chain);
        this.onMatchFound(e);
      }
      // game.over is handled by the active mode via its onTick — the unified
      // result flow routes the snapshot to ResultScene.
    });
  }

  /**
   * Visual feedback for a match: spawn a particle burst per cleared cell,
   * pop a chain/combo flash anchored at the topmost cell, and shake the
   * camera on really big chains.
   */
  private onMatchFound(e: Extract<EngineEvent, { type: 'match.found' }>): void {
    const cellSize = this.cellSize;
    const riseShift = this.engine.grid.riseOffset * cellSize;

    let topCell = e.cells[0];
    for (const c of e.cells) {
      if (c.row < topCell.row) topCell = c;
    }
    const popupX = this.boardOrigin.x + (topCell.col + 0.5) * cellSize;
    const popupY = this.boardOrigin.y + topCell.row * cellSize - riseShift - 12;
    ChainPopup.showCombo(this, popupX, popupY, e.comboSize);
    ChainPopup.showChain(this, popupX, popupY + 18, e.chain);

    for (const c of e.cells) {
      const block = this.engine.grid.cells[c.row]?.[c.col];
      if (!block || block.kind === 'garbage') continue;
      const cx = this.boardOrigin.x + (c.col + 0.5) * cellSize;
      const cy = this.boardOrigin.y + (c.row + 0.5) * cellSize - riseShift;
      spawnClearBurst(this, cx, cy, BLOCK_COLOR_HEX[block.color]);
    }

    if (e.chain >= 5 || e.comboSize >= 6) {
      this.cameras.main.shake(220, 0.005);
    }
  }

  private setupAudio(): void {
    const bgm = BGMPlayer.get();
    bgm
      .unlock()
      .then(() => bgm.play('world-1'))
      .catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    if (!this.blocks || !this.cursorGfx) return;

    this.blocks.removeAll(true);

    const cellSize = this.cellSize;
    const grid = this.engine.grid;
    const cfg = this.engine.cfg;
    const riseShift = grid.riseOffset * cellSize;

    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const cell = grid.cells[row]?.[col];
        if (!cell) continue;
        this.renderBlock(cell, row, col, cfg, cellSize, riseShift);
      }
    }

    this.drawCursor();
  }

  private renderBlock(
    block: Block,
    row: number,
    col: number,
    cfg: GameEngine['cfg'],
    cellSize: number,
    riseShift: number,
  ): void {
    if (!this.blocks) return;

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
    const fillColor = flashWhite
      ? 0xffffff
      : BLOCK_COLOR_HEX[block.color as BlockColor];
    const outlineColor = darken(BLOCK_COLOR_HEX[block.color as BlockColor], 0.5);

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

    const symbolColor = this.symbolColorFor(block.color);
    const label = this.add
      .text(cx, cy, BLOCK_SYMBOL[block.color as BlockColor], {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: symbolColor,
      })
      .setOrigin(0.5)
      .setAlpha(alpha)
      .setScale(scale);

    this.blocks.add(rect);
    this.blocks.add(label);
  }

  /**
   * Cursor is drawn as a 2-cell-wide outline (the player always swaps a pair).
   * Alpha pulses with a sine wave so the player can find it quickly.
   */
  private drawCursor(): void {
    if (!this.cursorGfx) return;
    const g = this.cursorGfx;
    g.clear();

    const { row, col } = this.engine.cursor;
    const cellSize = this.cellSize;
    const riseShift = this.engine.grid.riseOffset * cellSize;

    const baseX = this.boardOrigin.x + col * cellSize;
    const baseY = this.boardOrigin.y + row * cellSize - riseShift;
    const baseW = cellSize * 2;
    const baseH = cellSize;

    // Scale the outline outward from its center so it breathes.
    const s = this.cursorScale;
    const w = baseW * s;
    const h = baseH * s;
    const x = baseX + (baseW - w) / 2;
    const y = baseY + (baseH - h) / 2;

    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);
    g.lineStyle(2, 0xffffee, pulse);
    g.strokeRect(x, y, w, h);
  }

  private drawBoardFrame(): void {
    if (!this.gridGfx) return;
    const g = this.gridGfx;
    g.clear();

    const grid = this.engine.grid;
    const boardW = grid.cols * this.cellSize;
    const boardH = grid.rows * this.cellSize;

    // Subtle interior fill so the playfield reads as a distinct surface.
    g.fillStyle(0x0a0612, 0.85);
    g.fillRect(this.boardOrigin.x, this.boardOrigin.y, boardW, boardH);

    // Frame border.
    g.lineStyle(2, 0x5a3a72, 1);
    g.strokeRect(
      this.boardOrigin.x - 1,
      this.boardOrigin.y - 1,
      boardW + 2,
      boardH + 2,
    );
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  private computeBoardOrigin(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const boardW = this.engine.grid.cols * this.cellSize;
    const boardH = this.engine.grid.rows * this.cellSize;
    // 20px vertical offset accounts for the HUD strip at the top.
    this.boardOrigin = {
      x: Math.floor((w - boardW) / 2),
      y: Math.floor((h - boardH) / 2) + 20,
    };
  }

  private relayout(): void {
    this.computeBoardOrigin();
    this.drawBoardFrame();
    if (this.blocks) {
      this.blocks.setPosition(this.boardOrigin.x, this.boardOrigin.y);
    }
  }

  /**
   * Converts a CSS-space (clientX, clientY) into a (row, col) cell ref, or
   * null if the point lies outside the board.
   *
   * The Phaser canvas is laid out by FIT scaling, so we read the canvas's
   * actual CSS rectangle and undo the scale + the board origin manually.
   */
  private clientToCell(
    clientX: number,
    clientY: number,
  ): { row: number; col: number } | null {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const localX = ((clientX - rect.left) / rect.width) * this.scale.gameSize.width;
    const localY = ((clientY - rect.top) / rect.height) * this.scale.gameSize.height;

    const boardX = localX - this.boardOrigin.x;
    const boardY = localY - this.boardOrigin.y;
    if (boardX < 0 || boardY < 0) return null;

    const col = Math.floor(boardX / this.cellSize);
    const row = Math.floor(boardY / this.cellSize);
    if (row < 0 || row >= this.engine.grid.rows) return null;
    if (col < 0 || col >= this.engine.grid.cols) return null;
    return { row, col };
  }

  /**
   * Returns the on-screen (CSS px) size of one logical cell. Used by the input
   * layer's drag thresholds so a "one cell" drag stays accurate regardless of
   * how Phaser.Scale.FIT scaled the canvas to the viewport.
   */
  private cellSizeOnScreen(): number {
    const canvas = this.game.canvas;
    const ratio = canvas.clientWidth / this.scale.gameSize.width;
    return BLOCK_SIZE_LOGICAL * ratio;
  }

  private symbolColorFor(color: BlockColor): string {
    // Dark glyph on bright blocks, light glyph on dark ones.
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
  // Lifecycle
  // ---------------------------------------------------------------------------

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.inputCtrlDestroy?.();
    this.inputCtrlDestroy = null;
    this.controllerOffs.forEach((off) => off());
    this.controllerOffs = [];
    this.engineEventOff?.();
    this.engineEventOff = null;
    this.cursorScaleTween?.stop();
    this.cursorScaleTween = null;
    this.mode?.destroy();
  }
}

