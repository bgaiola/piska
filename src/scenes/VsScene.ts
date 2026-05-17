/**
 * VsScene — two-player Versus mode against the AI.
 *
 * Owns two independent `GameEngine` instances (player + AI) and wires the
 * `garbage.outgoing` event of each side into the opposing engine's
 * `receiveGarbage`. Renders both grids side-by-side. The player's cursor and
 * inputs go ONLY to the player's engine; the AIPlayer drives the AI engine.
 *
 * Visual layout adapts to portrait vs. landscape via `computeLayout`. The
 * shared engine animation timers (`swapTimer`, `clearTimer`, `fallTimer`,
 * `riseOffset`, `unlocking`) are read identically to `GameScene.renderBlock`.
 * Garbage cells (`kind === 'garbage'`) render as a flat gray tile with a
 * small lock glyph overlaid.
 */

import Phaser from 'phaser';
import { GameEngine } from '@/engine';
import type { Block, BlockColor, EngineEvent } from '@/engine';
import { AIPlayer, type AIDifficulty } from '@/engine/AIPlayer';
import { setupDefaultInputs } from '@/engine/input/setupDefaultInputs';
import type { InputController } from '@/engine/input/InputController';
import { BGMPlayer, SFXPlayer } from '@/audio';
import { BLOCK_COLOR_HEX, BLOCK_SYMBOL } from '@/config';
import { drawBeveledBlock, drawFlashBlock } from '@/ui/drawBeveledBlock';
import { drawCursor } from '@/ui/drawCursor';
import { ChainPopup } from '@/ui/ChainPopup';
import { spawnClearBurst } from '@/engine/ParticleFX';
import { getStageById, computeStarsForStage, type StageDef } from '@/data/stages';
import { haptic, HAPTIC } from '@/utils/haptics';
import { CHARACTERS, type CharacterDef } from '@/data/characters';
import { CharacterPortrait } from '@/ui/CharacterPortrait';
import { virtualButtonReserve } from '@/utils/virtualButtonReserve';

const VS_CELL_SIZE_MIN = 22;
const VS_CELL_SIZE_MAX = 56;
const HUD_RESERVE_TOP = 64;
const HUD_RESERVE_BOTTOM = 32;
const GARBAGE_FILL = 0x666666;
const GARBAGE_OUTLINE = 0x222222;
const GARBAGE_UNLOCK_FILL = 0xa08070;
const HUD_LABEL_COLOR = '#ffe';
const HUD_SUB_COLOR = '#bbf';
const GARBAGE_COUNTER_COLOR = '#f9c';

const DIFFICULTY_LABEL: Record<AIDifficulty, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  master: 'Mestre',
};

export class VsScene extends Phaser.Scene {
  private playerEngine!: GameEngine;
  private aiEngine!: GameEngine;
  private ai!: AIPlayer;
  private difficulty: AIDifficulty = 'medium';

  private cellSize = VS_CELL_SIZE_MIN;
  private playerOrigin = { x: 0, y: 0 };
  private aiOrigin = { x: 0, y: 0 };

  // Visual layers — separate containers per side so `removeAll(true)` is cheap.
  private playerBlocks: Phaser.GameObjects.Container | null = null;
  private aiBlocks: Phaser.GameObjects.Container | null = null;
  private framesGfx: Phaser.GameObjects.Graphics | null = null;
  private cursorGfx: Phaser.GameObjects.Graphics | null = null;
  private telegraphGfx: Phaser.GameObjects.Graphics | null = null;

  // HUD labels per side.
  private playerLabel: Phaser.GameObjects.Text | null = null;
  private aiLabel: Phaser.GameObjects.Text | null = null;
  private aiSubLabel: Phaser.GameObjects.Text | null = null;
  private playerScoreText: Phaser.GameObjects.Text | null = null;
  private aiScoreText: Phaser.GameObjects.Text | null = null;
  private playerGarbageText: Phaser.GameObjects.Text | null = null;
  private aiGarbageText: Phaser.GameObjects.Text | null = null;
  private aiPortrait: CharacterPortrait | null = null;

  private offFns: Array<() => void> = [];
  private inputCtrlDestroy: (() => void) | null = null;
  private gameEnded = false;
  private cursorScale = 1;
  private cursorScaleTween: Phaser.Tweens.Tween | null = null;
  /** Set when launched from the Adventure flow. Routes the end-of-match to
   *  StageOutroScene instead of VsResultScene. */
  private adventureStageId: string | undefined;
  /** Cached Adventure stage def + character def for HUD rendering. */
  private adventureStage: StageDef | undefined;
  private adventureCharacter: CharacterDef | undefined;

  constructor() {
    super('VsScene');
  }

  init(data: { difficulty?: AIDifficulty; adventureStageId?: string }): void {
    this.difficulty = data?.difficulty ?? 'medium';
    this.adventureStageId = data?.adventureStageId;
    this.gameEnded = false;
    this.offFns = [];
    this.inputCtrlDestroy = null;
  }

  create(): void {
    // Resolve the Adventure stage/character once so HUD rendering and
    // re-layouts can rebuild the portrait without re-doing the lookup.
    this.adventureStage = this.adventureStageId
      ? getStageById(this.adventureStageId)
      : undefined;
    this.adventureCharacter = this.adventureStage
      ? CHARACTERS[this.adventureStage.characterId]
      : undefined;

    // Distinct seeds so the two boards diverge from the start.
    const baseSeed = Date.now() & 0x7fffffff;
    this.playerEngine = new GameEngine({ rngSeed: baseSeed });
    this.aiEngine = new GameEngine({ rngSeed: (baseSeed ^ 0xa11) & 0x7fffffff });
    this.ai = new AIPlayer(this.aiEngine, this.difficulty);

    // Adventure-mode duels play the host character's world track so each
    // boss fight has its own theme; menu Vs-IA falls back to the volcanic
    // Forja Vulcânica anthem.
    const vsTrack = this.adventureStage
      ? `world-${this.adventureStage.worldId}`
      : 'world-5';
    BGMPlayer.get().play(vsTrack);

    this.cameras.main.setBackgroundColor('#08030f');
    this.drawBackdrop();

    this.computeLayout();

    this.framesGfx = this.add.graphics();
    this.drawFrames();

    this.playerBlocks = this.add.container(this.playerOrigin.x, this.playerOrigin.y);
    this.aiBlocks = this.add.container(this.aiOrigin.x, this.aiOrigin.y);
    this.cursorGfx = this.add.graphics();
    this.telegraphGfx = this.add.graphics();

    this.drawHudLabels();

    this.bindGarbageBridge();
    this.bindEngineEvents();
    this.bindPlayerInputs();
    this.bindEndConditions();

    this.game.events.on('layout-changed', this.relayout, this);

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());

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

  update(_t: number, dtMs: number): void {
    if (this.scene.isPaused()) return;
    if (this.gameEnded) return;
    this.playerEngine.tick(dtMs);
    this.aiEngine.tick(dtMs);
    this.ai.update(dtMs);
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
    const cols = this.playerCols();
    const rows = this.playerRows();

    // Reserve extra margins so the virtual buttons on touch devices don't
    // overlap the playfield.
    const vbReserve = virtualButtonReserve({ portrait });
    const reserveTop = HUD_RESERVE_TOP + vbReserve.top;
    const reserveBottom = HUD_RESERVE_BOTTOM + vbReserve.bottom;
    const reserveLeft = 16 + vbReserve.left;
    const reserveRight = 16 + vbReserve.right;

    // Pick the largest integer cell size that still fits both boards side by
    // side with HUD-friendly margins. Without this the cells stay at 22px and
    // look tiny on desktop monitors.
    const gap = portrait ? 16 : 80;
    const availableW = w - reserveLeft - reserveRight - gap;
    const availableH = h - reserveTop - reserveBottom;
    const fitByWidth = Math.floor(availableW / (cols * 2));
    const fitByHeight = Math.floor(availableH / rows);
    const cellSize = Math.max(
      VS_CELL_SIZE_MIN,
      Math.min(VS_CELL_SIZE_MAX, Math.min(fitByWidth, fitByHeight)),
    );
    this.cellSize = cellSize;

    const boardW = cols * cellSize;
    const boardH = rows * cellSize;
    const totalW = boardW * 2 + gap;
    const baseX = Math.floor((w - totalW) / 2);
    const centeredY = Math.floor(
      reserveTop + (h - reserveTop - reserveBottom - boardH) / 2,
    );
    const baseY = Math.max(reserveTop, centeredY);
    this.playerOrigin = { x: baseX, y: baseY };
    this.aiOrigin = { x: baseX + boardW + gap, y: baseY };
  }

  private playerRows(): number {
    return this.playerEngine.cfg.rows;
  }
  private playerCols(): number {
    return this.playerEngine.cfg.cols;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private drawHudLabels(): void {
    // Three stacked rows above each board: name (top), sub/species (middle,
    // adventure only), score (bottom). Spacing scaled so the rows never
    // overlap even with the adventure sub-label present.
    const hasSub = this.adventureCharacter !== undefined;
    const nameY = Math.max(12, this.playerOrigin.y - (hasSub ? 50 : 32));
    const subY = nameY + 14;
    const scoreY = hasSub ? nameY + 28 : nameY + 16;

    const playerCenterX =
      this.playerOrigin.x + (this.playerCols() * this.cellSize) / 2;
    const aiCenterX =
      this.aiOrigin.x + (this.playerCols() * this.cellSize) / 2;

    this.playerLabel = this.add
      .text(playerCenterX, nameY, 'VOCÊ', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: HUD_LABEL_COLOR,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // In Adventure runs the AI is the world's character (Pim, Salla, ...),
    // so we show their name + species/difficulty in place of "Cláudio: <diff>".
    const charDef = this.adventureCharacter;
    const aiLabelText = charDef
      ? charDef.name
      : `Cláudio: ${DIFFICULTY_LABEL[this.difficulty]}`;
    const aiSubText = charDef
      ? `${charDef.species} • ${DIFFICULTY_LABEL[this.difficulty]}`
      : null;

    this.aiLabel = this.add
      .text(aiCenterX, nameY, aiLabelText, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: HUD_LABEL_COLOR,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    if (aiSubText) {
      this.aiSubLabel = this.add
        .text(aiCenterX, subY, aiSubText, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: HUD_SUB_COLOR,
        })
        .setOrigin(0.5);
    }

    // Character portrait sits to the OUTER edge of the AI board so it
    // doesn't crowd the playfield or the labels stacked on top.
    if (charDef) {
      const portraitSize = 64;
      const aiBoardRight =
        this.aiOrigin.x + this.playerCols() * this.cellSize;
      // Prefer placing it to the right of the AI board, fall back to the
      // viewport edge clamp on narrow screens.
      const portraitX = Math.min(
        this.scale.gameSize.width - portraitSize / 2 - 8,
        aiBoardRight + portraitSize / 2 + 12,
      );
      const portraitY =
        this.aiOrigin.y + Math.floor(portraitSize / 2) + 4;
      this.aiPortrait = new CharacterPortrait({
        scene: this,
        x: portraitX,
        y: portraitY,
        characterId: charDef.id,
        size: portraitSize,
        showLabel: false,
      });
    }

    this.playerScoreText = this.add
      .text(playerCenterX, scoreY, '0', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    this.aiScoreText = this.add
      .text(aiCenterX, scoreY, '0', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    const garbageY =
      this.playerOrigin.y + this.playerRows() * this.cellSize + 8;
    this.playerGarbageText = this.add
      .text(playerCenterX, garbageY, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: GARBAGE_COUNTER_COLOR,
      })
      .setOrigin(0.5);
    this.aiGarbageText = this.add
      .text(aiCenterX, garbageY, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: GARBAGE_COUNTER_COLOR,
      })
      .setOrigin(0.5);
  }

  private updateHud(): void {
    if (this.playerScoreText)
      this.playerScoreText.setText(`SCORE ${this.playerEngine.score.score}`);
    if (this.aiScoreText)
      this.aiScoreText.setText(`SCORE ${this.aiEngine.score.score}`);

    const pq = this.playerEngine.garbage?.size?.() ?? 0;
    const aq = this.aiEngine.garbage?.size?.() ?? 0;
    if (this.playerGarbageText)
      this.playerGarbageText.setText(pq > 0 ? `GARBAGE: ${pq}` : '');
    if (this.aiGarbageText)
      this.aiGarbageText.setText(aq > 0 ? `GARBAGE: ${aq}` : '');
  }

  // ---------------------------------------------------------------------------
  // Frame & rendering
  // ---------------------------------------------------------------------------

  private drawBackdrop(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const g = this.add.graphics();
    // Vertical multi-stop gradient via 12 stripes from a deep purple top to
    // an ember-tinged base (this is the Forja Vulcânica world). Cheap and
    // gives the scene depth without sampling per-pixel.
    const stops = [
      0x150624, 0x1b0a2c, 0x210c35, 0x270e3d, 0x2c1041, 0x2e1141,
      0x331243, 0x3a1545, 0x401545, 0x441444, 0x441241, 0x3a0f38,
    ];
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    // A subtle vignette: dark soft border that pulls the eye to the center.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, w, 24);
    g.fillRect(0, h - 24, w, 24);
    g.setDepth(-1000);
  }

  private drawFrames(): void {
    if (!this.framesGfx) return;
    const g = this.framesGfx;
    g.clear();

    const boardW = this.playerCols() * this.cellSize;
    const boardH = this.playerRows() * this.cellSize;

    for (const origin of [this.playerOrigin, this.aiOrigin]) {
      g.fillStyle(0x0a0612, 0.85);
      g.fillRect(origin.x, origin.y, boardW, boardH);
      g.lineStyle(2, 0x5a3a72, 1);
      g.strokeRect(origin.x - 1, origin.y - 1, boardW + 2, boardH + 2);
    }
  }

  private render(): void {
    if (!this.playerBlocks || !this.aiBlocks || !this.cursorGfx) return;
    this.playerBlocks.removeAll(true);
    this.aiBlocks.removeAll(true);

    this.renderEngine(this.playerEngine, this.playerBlocks);
    this.renderEngine(this.aiEngine, this.aiBlocks);

    this.drawPlayerCursor();
    this.drawTelegraph();
  }

  /**
   * Draws "incoming garbage" badges above each board. Each queued piece shows
   * as a thin gray strip whose width matches the piece width. The next piece
   * to drop also gets a countdown bar so the player sees it coming and can
   * try to defensively chain before impact.
   */
  private drawTelegraph(): void {
    if (!this.telegraphGfx) return;
    const g = this.telegraphGfx;
    g.clear();

    const cellSize = this.cellSize;
    const draw = (engine: GameEngine, originX: number, originY: number): void => {
      const queue = (engine.garbage as unknown as { queue?: ReadonlyArray<{ width: number; height: number }> }).queue;
      // GarbageManager.queue is private; fall back to size() if internals
      // aren't accessible, drawing generic strips.
      const size = engine.garbage.size();
      if (size === 0) return;

      const stripY = originY - 12;
      const stripH = 4;
      const peekW = engine.cfg.cols * cellSize;
      const gap = 2;
      let x = originX;
      const pieces = queue ?? Array.from({ length: size }, () => ({ width: engine.cfg.cols, height: 1 }));
      const boardRight = originX + peekW;
      for (let idx = 0; idx < pieces.length; idx++) {
        const p = pieces[idx];
        // Scale each piece's strip down to a fraction of board width so the
        // whole queue always fits within the board's horizontal footprint
        // (the old forEach + `return` only skipped a single callback,
        // letting later pieces spill across the gap into the other board).
        const w = Math.max(2, (p.width / engine.cfg.cols) * (peekW / Math.max(1, Math.min(pieces.length, 6))));
        if (x + w > boardRight) break;
        const h = stripH * Math.min(p.height, 2);
        g.fillStyle(idx === 0 ? 0xffaa44 : 0x8866cc, 0.95);
        g.fillRect(x, stripY - (h - stripH), w, h);
        g.lineStyle(1, 0x000000, 0.6);
        g.strokeRect(x, stripY - (h - stripH), w, h);
        x += w + gap;
      }
      // Countdown bar for the next piece.
      const dropMs = engine.cfg.garbageDropDelayMs;
      const left = Math.max(0, engine.dropDelayTimer);
      const ratio = Math.min(1, left / dropMs);
      const barY = stripY + stripH + 2;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(originX, barY, peekW, 2);
      g.fillStyle(0xff5555, 0.95);
      g.fillRect(originX, barY, peekW * (1 - ratio), 2);
    };
    draw(this.playerEngine, this.playerOrigin.x, this.playerOrigin.y);
    draw(this.aiEngine, this.aiOrigin.x, this.aiOrigin.y);
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
        // Multi-cell garbage groups render as a single rectangle anchored
        // at the group's top-left; the other cells of the group skip so we
        // get one solid bar instead of a row of bordered tiles.
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

    const blockColor = BLOCK_COLOR_HEX[block.color as BlockColor];
    const blockObj = flashWhite
      ? drawFlashBlock({
          scene: this,
          parent: container,
          x: cx,
          y: cy,
          size: cellSize,
        })
      : drawBeveledBlock({
          scene: this,
          parent: container,
          x: cx,
          y: cy,
          size: cellSize,
          color: blockColor,
        });
    blockObj.setAlpha(alpha);
    blockObj.setScale(scale);

    const symbolPx = Math.max(8, Math.floor(cellSize * 0.42));
    const label = this.add
      .text(cx, cy, BLOCK_SYMBOL[block.color as BlockColor], {
        fontFamily: 'monospace',
        fontSize: `${symbolPx}px`,
        color: this.symbolColorFor(block.color),
      })
      .setOrigin(0.5)
      .setAlpha(alpha * 0.92)
      .setScale(scale);

    container.add(label);
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

  private drawGarbageCell(
    container: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    cellSize: number,
    block: Block,
  ): void {
    const fill = block.unlocking ? GARBAGE_UNLOCK_FILL : GARBAGE_FILL;
    // Group dimensions in cells. Falls back to 1×1 for legacy / decoded data
    // that doesn't carry the group bounds.
    const gw = block.garbageWidth ?? 1;
    const gh = block.garbageHeight ?? 1;
    const totalW = gw * cellSize;
    const totalH = gh * cellSize;
    // (cx, cy) is the *single-cell* center. The group's center is offset by
    // (gw - 1)/2 cells right and (gh - 1)/2 cells down from the top-left cell.
    const groupCx = cx + ((gw - 1) * cellSize) / 2;
    const groupCy = cy + ((gh - 1) * cellSize) / 2;
    const rect = this.add.rectangle(groupCx, groupCy, totalW - 2, totalH - 2, fill, 1);
    rect.setStrokeStyle(2, GARBAGE_OUTLINE, 1);

    const glyph = this.add
      .text(groupCx, groupCy, '■', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#bbb',
      })
      .setOrigin(0.5);
    if (block.unlocking) {
      // Pulse the glyph during unlock so the player sees it's about to drop.
      const t = (block.unlockTimer ?? 0) % 200;
      glyph.setAlpha(0.5 + (t / 200) * 0.5);
    }

    container.add(rect);
    container.add(glyph);
  }

  private drawPlayerCursor(): void {
    if (!this.cursorGfx) return;
    const { row, col } = this.playerEngine.cursor;
    const cellSize = this.cellSize;
    const riseShift = this.playerEngine.grid.riseOffset * cellSize;
    this.cursorGfx.clear();
    drawCursor({
      g: this.cursorGfx,
      x: this.playerOrigin.x + col * cellSize,
      y: this.playerOrigin.y + row * cellSize - riseShift,
      cellSize,
      scale: this.cursorScale,
      timeMs: performance.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  private bindGarbageBridge(): void {
    this.offFns.push(
      this.playerEngine.events.on((e: EngineEvent) => {
        if (e.type === 'garbage.outgoing') {
          for (const piece of e.pieces) {
            this.aiEngine.receiveGarbage(piece);
          }
        }
      }),
    );
    this.offFns.push(
      this.aiEngine.events.on((e: EngineEvent) => {
        if (e.type === 'garbage.outgoing') {
          for (const piece of e.pieces) {
            this.playerEngine.receiveGarbage(piece);
          }
        }
      }),
    );
  }

  private bindEngineEvents(): void {
    // Player-side SFX (chiptune only fires for the human board) + popups and
    // particle bursts for either side so the screen feels alive.
    this.offFns.push(
      this.playerEngine.events.on((e: EngineEvent) => {
        if (e.type === 'block.swapped') {
          SFXPlayer.get().swap();
          haptic(HAPTIC.swap);
        } else if (e.type === 'match.found') {
          SFXPlayer.get().clear(e.comboSize);
          if (e.chain >= 2) SFXPlayer.get().chain(e.chain);
          this.onMatchFound(this.playerEngine, e, this.playerOrigin.x, this.playerOrigin.y);
        } else if (e.type === 'garbage.dropped') {
          haptic(HAPTIC.garbage);
        } else if (e.type === 'game.over') {
          haptic(HAPTIC.gameOver);
        }
      }),
    );
    this.offFns.push(
      this.aiEngine.events.on((e: EngineEvent) => {
        if (e.type === 'match.found') {
          this.onMatchFound(this.aiEngine, e, this.aiOrigin.x, this.aiOrigin.y);
        }
      }),
    );
  }

  private onMatchFound(
    engine: GameEngine,
    e: Extract<EngineEvent, { type: 'match.found' }>,
    originX: number,
    originY: number,
  ): void {
    const cellSize = this.cellSize;
    const riseShift = engine.grid.riseOffset * cellSize;

    let topCell = e.cells[0];
    for (const c of e.cells) {
      if (c.row < topCell.row) topCell = c;
    }
    const popupX = originX + (topCell.col + 0.5) * cellSize;
    const popupY = originY + topCell.row * cellSize - riseShift - 12;
    ChainPopup.showCombo(this, popupX, popupY, e.comboSize);
    ChainPopup.showChain(this, popupX, popupY + 16, e.chain);

    for (const c of e.cells) {
      const block = engine.grid.cells[c.row]?.[c.col];
      if (!block || block.kind === 'garbage') continue;
      const cx = originX + (c.col + 0.5) * cellSize;
      const cy = originY + (c.row + 0.5) * cellSize - riseShift;
      spawnClearBurst(this, cx, cy, BLOCK_COLOR_HEX[block.color], this.cellSize);
    }

    if (e.chain >= 3 || e.comboSize >= 5) {
      const intensity = Math.min(0.012, 0.004 + e.chain * 0.0015);
      this.cameras.main.shake(100 + e.chain * 20, intensity);
    }
    if (engine === this.playerEngine) {
      if (e.chain >= 2) haptic(HAPTIC.chain(e.chain));
      else haptic(HAPTIC.match);
    }
  }

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
        this.playerEngine.moveCursor(p.dRow ?? 0, p.dCol ?? 0),
      ),
    );
    this.offFns.push(
      c.on('cursorSet', (p: { row: number; col: number }) =>
        this.playerEngine.setCursor(p.row, p.col),
      ),
    );
    this.offFns.push(c.on('swap', () => this.playerEngine.swap()));
    this.offFns.push(
      c.on('raisePress', () => this.playerEngine.setManualRaise(true)),
    );
    this.offFns.push(
      c.on('raiseRelease', () => this.playerEngine.setManualRaise(false)),
    );
    this.offFns.push(
      c.on('pause', () => {
        if (this.playerEngine.gameOver || this.aiEngine.gameOver) return;
        this.playerEngine.pause();
        this.aiEngine.pause();
        const quitSceneKey = this.adventureStageId
          ? 'AdventureStageSelectScene'
          : 'ModeSelectScene';
        this.scene.launch('PauseScene', {
          engine: this.playerEngine,
          vsAiEngine: this.aiEngine,
          resumeSceneKey: 'VsScene',
          quitSceneKey,
        });
        this.scene.pause();
      }),
    );
  }

  private bindEndConditions(): void {
    const onOver = (winner: 'player' | 'ai'): void => {
      if (this.gameEnded) return;
      this.gameEnded = true;
      BGMPlayer.get().stop();
      SFXPlayer.get().gameOver();
      if (this.adventureStageId) {
        this.routeAdventureResult(winner);
      } else {
        this.scene.launch('VsResultScene', {
          winner,
          playerScore: this.playerEngine.score.score,
          aiScore: this.aiEngine.score.score,
          difficulty: this.difficulty,
        });
      }
      this.scene.pause();
    };

    this.offFns.push(
      this.playerEngine.events.on((e: EngineEvent) => {
        if (e.type === 'game.over') onOver('ai');
      }),
    );
    this.offFns.push(
      this.aiEngine.events.on((e: EngineEvent) => {
        if (e.type === 'game.over') onOver('player');
      }),
    );
  }

  private routeAdventureResult(winner: 'player' | 'ai'): void {
    const stageId = this.adventureStageId;
    if (!stageId) return;
    const stage = getStageById(stageId);
    const won = winner === 'player';
    const score = this.playerEngine.score.score;
    // Approximate elapsed time from the engine — Vs has no central clock, so
    // we infer from the player's chain tracker is not reliable. Use a fresh
    // performance.now() delta tracked from create() instead would require
    // extra state; for now we record 0 and rely on `bestScore` only.
    const timeMs = 0;
    const stars = stage
      ? computeStarsForStage(
          stage,
          { mode: 'vs-ai', score, timeMs },
          won,
        )
      : (won ? 1 : 0);
    this.scene.launch('StageOutroScene', {
      stageId,
      result: won ? 'won' : 'lost',
      stars,
      score,
      timeMs,
    });
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers (player board only)
  // ---------------------------------------------------------------------------

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
    if (row < 0 || row >= this.playerRows()) return null;
    if (col < 0 || col >= this.playerCols()) return null;
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
    if (this.aiBlocks) {
      this.aiBlocks.setPosition(this.aiOrigin.x, this.aiOrigin.y);
    }
    // Re-anchor HUD.
    this.destroyHud();
    this.drawHudLabels();
  }

  private destroyHud(): void {
    this.playerLabel?.destroy();
    this.aiLabel?.destroy();
    this.aiSubLabel?.destroy();
    this.playerScoreText?.destroy();
    this.aiScoreText?.destroy();
    this.playerGarbageText?.destroy();
    this.aiGarbageText?.destroy();
    this.aiPortrait?.destroy();
    this.playerLabel = null;
    this.aiLabel = null;
    this.aiSubLabel = null;
    this.playerScoreText = null;
    this.aiScoreText = null;
    this.playerGarbageText = null;
    this.aiGarbageText = null;
    this.aiPortrait = null;
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.inputCtrlDestroy?.();
    this.inputCtrlDestroy = null;
    this.offFns.forEach((off) => off());
    this.offFns = [];
    this.cursorScaleTween?.stop();
    this.cursorScaleTween = null;
    this.destroyHud();
  }
}
