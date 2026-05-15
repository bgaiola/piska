/**
 * AdventureStageSelectScene — grid of stage tiles for a single world.
 *
 * Each tile shows: stage index, mode glyph, three stars (filled/empty per
 * save data). Locked stages render a lock and refuse confirmation.
 *
 * Navigation:
 *   - Arrow keys move the cursor across the grid.
 *   - Enter / Space confirms → StageIntroScene.
 *   - Esc / Backspace returns to AdventureMapScene.
 *
 * Stage unlock rule (mirrors SaveManager.isStageUnlocked): stage 1 is always
 * playable; stage N requires the previous stage to have ≥1 star.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { WORLDS, type WorldId } from '@/data/worlds';
import { getStagesForWorld, type StageDef } from '@/data/stages';
import { SaveManager } from '@/save/SaveManager';
import { darken } from '@/config';
import type { GameMode } from '@/modes';

const TILE_W = 76;
const TILE_H = 76;
const TILE_GAP = 8;

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;

const MODE_GLYPH: Record<GameMode, string> = {
  endless: '∞',
  'time-attack': '⏱',
  'stage-clear': '⬛',
  puzzle: '🧩',
  'vs-ai': '🤖',
};

const MODE_LABEL: Record<GameMode, string> = {
  endless: 'Endless',
  'time-attack': 'Time Attack',
  'stage-clear': 'Stage Clear',
  puzzle: 'Puzzle',
  'vs-ai': 'Vs IA',
};

interface StageTile {
  stage: StageDef;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  indexText: Phaser.GameObjects.Text;
  glyphText: Phaser.GameObjects.Text;
  starsText: Phaser.GameObjects.Text;
  modeText: Phaser.GameObjects.Text;
  lockBadge: Phaser.GameObjects.Text | null;
  unlocked: boolean;
}

export class AdventureStageSelectScene extends Phaser.Scene {
  private worldId: WorldId = 1;
  private cursor = 0;
  private cols = 3;
  private tiles: StageTile[] = [];
  private titleText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private detailText: Phaser.GameObjects.Text | null = null;
  private keyListeners: Array<{ key: 'keydown'; fn: (e: KeyboardEvent) => void }> = [];

  constructor() {
    super('AdventureStageSelectScene');
  }

  init(data: { worldId: WorldId }): void {
    this.worldId = data?.worldId ?? 1;
    this.cursor = 0;
  }

  create(): void {
    const wdef = WORLDS[this.worldId];
    BGMPlayer.get().play(wdef.trackId);
    this.cameras.main.setBackgroundColor('#0c0418');

    this.drawScreen();
    this.bindKeyboard();

    this.game.events.on('layout-changed', this.relayout, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  private drawScreen(): void {
    this.destroyTiles();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const wdef = WORLDS[this.worldId];
    const save = SaveManager.get();
    const stages = getStagesForWorld(this.worldId);

    this.titleText?.destroy();
    this.titleText = this.add
      .text(w / 2, 22, `Mundo ${this.worldId} — ${wdef.name}`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    // Fit columns to viewport (3 default, drop to 2 on very narrow).
    this.cols = w < 320 ? 2 : 3;
    const rows = Math.ceil(stages.length / this.cols);
    const gridW = this.cols * TILE_W + (this.cols - 1) * TILE_GAP;
    const gridH = rows * TILE_H + (rows - 1) * TILE_GAP;
    const startX = Math.floor((w - gridW) / 2) + TILE_W / 2;
    const startY = 56 + Math.max(0, Math.floor((h - 110 - gridH) / 2));

    stages.forEach((stage, idx) => {
      const r = Math.floor(idx / this.cols);
      const c = idx % this.cols;
      const cx = startX + c * (TILE_W + TILE_GAP);
      const cy = startY + r * (TILE_H + TILE_GAP);

      const progress = save.getAdventureProgress(stage.id);
      const unlocked = save.isStageUnlocked(this.worldId, stage.index);

      const container = this.add.container(cx, cy);

      const bg = this.add
        .rectangle(0, 0, TILE_W, TILE_H, darken(wdef.themeColor, 0.25), unlocked ? 0.9 : 0.45)
        .setStrokeStyle(2, UNFOCUS_COLOR, 1);
      container.add(bg);

      const indexText = this.add
        .text(0, -TILE_H / 2 + 10, `${stage.index}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: unlocked ? '#ffe' : '#666',
        })
        .setOrigin(0.5);
      const glyphText = this.add
        .text(0, -4, MODE_GLYPH[stage.mode], {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: unlocked ? '#ffe' : '#666',
        })
        .setOrigin(0.5);
      const starsStr = unlocked
        ? '★'.repeat(progress.stars) + '☆'.repeat(3 - progress.stars)
        : '   ';
      const starsText = this.add
        .text(0, TILE_H / 2 - 20, starsStr, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: progress.stars >= 1 ? '#ff8' : '#666',
        })
        .setOrigin(0.5);
      const modeText = this.add
        .text(0, TILE_H / 2 - 9, unlocked ? MODE_LABEL[stage.mode] : '', {
          fontFamily: 'monospace',
          fontSize: '7px',
          color: '#bbf',
        })
        .setOrigin(0.5);
      container.add([indexText, glyphText, starsText, modeText]);

      let lockBadge: Phaser.GameObjects.Text | null = null;
      if (!unlocked) {
        lockBadge = this.add
          .text(0, 0, '🔒', {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: '#aaa',
          })
          .setOrigin(0.5);
        container.add(lockBadge);
      }

      container.setSize(TILE_W, TILE_H);
      bg.setInteractive({ useHandCursor: unlocked });
      bg.on('pointerover', () => {
        if (!unlocked) return;
        this.cursor = idx;
        this.refreshFocus();
      });
      bg.on('pointerdown', () => {
        this.cursor = idx;
        this.refreshFocus();
        this.confirm();
      });

      this.tiles.push({
        stage,
        container,
        bg,
        indexText,
        glyphText,
        starsText,
        modeText,
        lockBadge,
        unlocked,
      });
    });

    // Detail line below grid: shows focused stage's mode label.
    this.detailText?.destroy();
    this.detailText = this.add
      .text(w / 2, h - 36, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#bbf',
      })
      .setOrigin(0.5);

    this.hintText?.destroy();
    this.hintText = this.add
      .text(w / 2, h - 16, '←→↑↓ Navegar  •  Enter Jogar  •  Esc Voltar', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#bbb',
      })
      .setOrigin(0.5);

    // Snap to first unlocked tile.
    if (!this.tiles[this.cursor]?.unlocked) {
      const idx = this.tiles.findIndex((t) => t.unlocked);
      this.cursor = Math.max(0, idx);
    }
    this.refreshFocus();
  }

  private refreshFocus(): void {
    const wdef = WORLDS[this.worldId];
    this.tiles.forEach((t, idx) => {
      const focused = idx === this.cursor;
      t.bg.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_COLOR : UNFOCUS_COLOR, 1);
      t.bg.setFillStyle(
        focused ? wdef.themeColor : darken(wdef.themeColor, 0.25),
        t.unlocked ? 0.9 : 0.45,
      );
      t.container.setScale(focused ? 1.05 : 1);
    });
    const focused = this.tiles[this.cursor];
    if (focused && this.detailText) {
      this.detailText.setText(
        focused.unlocked
          ? `${MODE_LABEL[focused.stage.mode]}  •  ${focused.stage.id}`
          : 'Fase bloqueada',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    const move = (delta: number): void => {
      const count = this.tiles.length;
      if (count === 0) return;
      let next = this.cursor;
      for (let i = 0; i < count; i++) {
        next = (next + delta + count) % count;
        if (this.tiles[next].unlocked) break;
      }
      this.cursor = next;
      this.refreshFocus();
    };

    const onDown = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          move(-this.cols);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          move(this.cols);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          move(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          move(1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.confirm();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          this.back();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyListeners.push({ key: 'keydown', fn: onDown });
  }

  private confirm(): void {
    const tile = this.tiles[this.cursor];
    if (!tile || !tile.unlocked) return;
    this.scene.start('StageIntroScene', { stageId: tile.stage.id });
  }

  private back(): void {
    this.scene.start('AdventureMapScene');
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    this.drawScreen();
  }

  private destroyTiles(): void {
    this.tiles.forEach((t) => t.container.destroy(true));
    this.tiles = [];
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.keyListeners.forEach(({ key, fn }) => window.removeEventListener(key, fn));
    this.keyListeners = [];
    this.destroyTiles();
    this.titleText?.destroy();
    this.hintText?.destroy();
    this.detailText?.destroy();
    this.titleText = null;
    this.hintText = null;
    this.detailText = null;
  }
}
