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
import type { Block, EngineEvent } from '@/engine';
import { AIPlayer, type AIDifficulty } from '@/engine/AIPlayer';
import { setupDefaultInputs } from '@/engine/input/setupDefaultInputs';
import type { InputController } from '@/engine/input/InputController';
import { BGMPlayer, SFXPlayer } from '@/audio';
import { BLOCK_COLOR_HEX, BLOCK_SIZE_LOGICAL } from '@/config';
import { ChainPopup } from '@/ui/ChainPopup';
import { spawnClearBurst } from '@/engine/ParticleFX';
import { getStageById, computeStarsForStage, type StageDef } from '@/data/stages';
import { haptic, HAPTIC } from '@/utils/haptics';
import { CHARACTERS, type CharacterDef } from '@/data/characters';
import { CharacterPortrait } from '@/ui/CharacterPortrait';

const VS_CELL_SIZE = 22;
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

  private readonly cellSize = VS_CELL_SIZE;
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

    BGMPlayer.get().play('world-5');

    this.cameras.main.setBackgroundColor('#160a1f');

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
    const boardW = this.playerCols() * this.cellSize;
    const boardH = this.playerRows() * this.cellSize;
    const gap = portrait ? 16 : 80;
    const totalW = boardW * 2 + gap;
    const baseX = Math.floor((w - totalW) / 2);
    const baseY = portrait
      ? Math.max(60, Math.floor((h - boardH) / 2))
      : Math.max(40, Math.floor((h - boardH) / 2));
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
    const labelY = Math.max(8, this.playerOrigin.y - 36);
    const subY = Math.max(22, this.playerOrigin.y - 22);

    const playerCenterX =
      this.playerOrigin.x + (this.playerCols() * this.cellSize) / 2;
    const aiCenterX =
      this.aiOrigin.x + (this.playerCols() * this.cellSize) / 2;

    this.playerLabel = this.add
      .text(playerCenterX, labelY, 'VOCÊ', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: HUD_LABEL_COLOR,
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
      .text(aiCenterX, labelY, aiLabelText, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: HUD_LABEL_COLOR,
      })
      .setOrigin(0.5);

    if (aiSubText) {
      this.aiSubLabel = this.add
        .text(aiCenterX, labelY + 12, aiSubText, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: HUD_SUB_COLOR,
        })
        .setOrigin(0.5);
    }

    // Small character portrait tucked to the outer-left of the AI board
    // (Adventure runs only). Positioned beside the board so it does not
    // overlap with the playfield or the HUD labels above it.
    if (charDef) {
      const portraitSize = 48;
      const portraitX = Math.max(
        portraitSize / 2 + 4,
        this.aiOrigin.x - portraitSize / 2 - 8,
      );
      const portraitY =
        this.aiOrigin.y + this.playerRows() * this.cellSize - portraitSize / 2;
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
      .text(playerCenterX, subY, '0', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: HUD_SUB_COLOR,
      })
      .setOrigin(0.5);

    this.aiScoreText = this.add
      .text(aiCenterX, subY, '0', {
        fontFamily: 'monospace',
        fontSize: '10px',
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

    // Vs boards use a 22px cell; the baked block-<color> texture is
    // BLOCK_SIZE_LOGICAL (28px), so we scale it down. Animation scale
    // multiplies on top to drive swap/clear/falling feedback.
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
    const g = this.cursorGfx;
    g.clear();

    const { row, col } = this.playerEngine.cursor;
    const cellSize = this.cellSize;
    const riseShift = this.playerEngine.grid.riseOffset * cellSize;

    const baseX = this.playerOrigin.x + col * cellSize;
    const baseY = this.playerOrigin.y + row * cellSize - riseShift;
    const baseW = cellSize * 2;
    const baseH = cellSize;
    const s = this.cursorScale;
    const w = baseW * s;
    const h = baseH * s;
    const x = baseX + (baseW - w) / 2;
    const y = baseY + (baseH - h) / 2;

    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);
    g.lineStyle(2, 0xffffee, pulse);
    g.strokeRect(x, y, w, h);
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
      spawnClearBurst(this, cx, cy, BLOCK_COLOR_HEX[block.color]);
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
