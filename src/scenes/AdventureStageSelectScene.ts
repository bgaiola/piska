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
 *
 * Polish layer:
 *   - drawBackdrop() paints a 12-stripe vertical gradient that fades from
 *     a dark neutral at the top to the selected world's `themeColor` at the
 *     bottom, so the scene feels like the world itself (Vale do Carvalho →
 *     green-tinted, Pico Geada → ice-blue, ...).
 *   - The top of the scene gets a "world banner" with a CharacterPortrait
 *     on the left, the world name in large type, and the tagline below.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { WORLDS, type WorldId } from '@/data/worlds';
import { CHARACTER_BY_WORLD, CHARACTERS } from '@/data/characters';
import { getStagesForWorld, type StageDef } from '@/data/stages';
import { SaveManager } from '@/save/SaveManager';
import { darken } from '@/config';
import { CharacterPortrait } from '@/ui/CharacterPortrait';
import type { GameMode } from '@/modes';

const TILE_W = 76;
const TILE_H = 76;
const TILE_GAP = 8;

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;

const BANNER_H = 88;

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

/**
 * Lerps between two 0xRRGGBB ints. Cheaper than parsing colors and lets
 * drawBackdrop build a gradient between an arbitrary "top" neutral and the
 * world's themeColor at the bottom.
 */
function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bch = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bch;
}

export class AdventureStageSelectScene extends Phaser.Scene {
  private worldId: WorldId = 1;
  private cursor = 0;
  private cols = 3;
  private tiles: StageTile[] = [];
  private backdropGfx: Phaser.GameObjects.Graphics | null = null;
  private bannerObjects: Phaser.GameObjects.GameObject[] = [];
  private bannerPortrait: CharacterPortrait | null = null;
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

    this.drawBackdrop();
    this.drawScreen();
    this.bindKeyboard();

    this.game.events.on('layout-changed', this.relayout, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  /**
   * Vertical gradient: dark neutral at the top fading to the world's
   * `themeColor` at the bottom. 12 stripes give it depth without per-pixel
   * work. Drawn once at depth -1000.
   */
  private drawBackdrop(): void {
    this.backdropGfx?.destroy();
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const wdef = WORLDS[this.worldId];
    const g = this.add.graphics();

    const top = 0x0c0418; // matches the camera background
    // Bottom stop is the world's themeColor, but darkened a notch so the
    // grid tiles (which use a darker shade of the same colour) still stand
    // apart from the backdrop.
    const bottom = darken(wdef.themeColor, 0.35);

    const STRIPES = 12;
    const stripeH = Math.ceil(h / STRIPES);
    for (let i = 0; i < STRIPES; i++) {
      const t = i / (STRIPES - 1);
      const color = lerpHex(top, bottom, t);
      g.fillStyle(color, 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    // Top + bottom vignette stripes, same recipe as the other scenes.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, w, 22);
    g.fillRect(0, h - 22, w, 22);
    g.setDepth(-1000);
    this.backdropGfx = g;
  }

  private drawScreen(): void {
    this.destroyTiles();
    this.destroyBanner();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const wdef = WORLDS[this.worldId];
    const save = SaveManager.get();
    const stages = getStagesForWorld(this.worldId);
    const char = CHARACTERS[CHARACTER_BY_WORLD[this.worldId]];

    // ----- World banner ------------------------------------------------------
    // A horizontal band at the top with the portrait, world title, tagline,
    // and "Mundo N" label. Anchors centre-X. Keeps the cards below uncluttered.
    const bannerCy = 12 + BANNER_H / 2;
    const portraitSize = 56;
    const portraitX = Math.max(36, Math.floor(w / 2) - 130);

    this.bannerPortrait = new CharacterPortrait({
      scene: this,
      x: portraitX,
      y: bannerCy,
      characterId: CHARACTER_BY_WORLD[this.worldId],
      size: portraitSize,
      showLabel: false,
    });

    const textX = portraitX + portraitSize / 2 + 12;
    const mundoLabel = this.add
      .text(textX, bannerCy - 24, `Mundo ${this.worldId}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffd96b',
      })
      .setOrigin(0, 0.5);
    this.bannerObjects.push(mundoLabel);

    const nameText = this.add
      .text(textX, bannerCy - 8, wdef.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffe',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.bannerObjects.push(nameText);

    const taglineText = this.add
      .text(textX, bannerCy + 12, wdef.tagline, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#bbf',
        wordWrap: { width: w - textX - 24 },
      })
      .setOrigin(0, 0.5);
    this.bannerObjects.push(taglineText);

    const hostText = this.add
      .text(textX, bannerCy + 28, char.name, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ff8',
      })
      .setOrigin(0, 0.5);
    this.bannerObjects.push(hostText);

    // ----- Stage grid --------------------------------------------------------
    // Fit columns to viewport (3 default, drop to 2 on very narrow).
    this.cols = w < 320 ? 2 : 3;
    const rows = Math.ceil(stages.length / this.cols);
    const gridW = this.cols * TILE_W + (this.cols - 1) * TILE_GAP;
    const gridH = rows * TILE_H + (rows - 1) * TILE_GAP;
    const gridTop = bannerCy + BANNER_H / 2 + 12;
    const gridFooter = 56; // detail + hint
    const startX = Math.floor((w - gridW) / 2) + TILE_W / 2;
    const startY =
      gridTop + Math.max(0, Math.floor((h - gridTop - gridFooter - gridH) / 2));

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
    this.drawBackdrop();
    this.drawScreen();
  }

  private destroyTiles(): void {
    this.tiles.forEach((t) => t.container.destroy(true));
    this.tiles = [];
  }

  private destroyBanner(): void {
    this.bannerObjects.forEach((o) => o.destroy());
    this.bannerObjects = [];
    this.bannerPortrait?.destroy();
    this.bannerPortrait = null;
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.keyListeners.forEach(({ key, fn }) => window.removeEventListener(key, fn));
    this.keyListeners = [];
    this.destroyTiles();
    this.destroyBanner();
    this.hintText?.destroy();
    this.detailText?.destroy();
    this.hintText = null;
    this.detailText = null;
    this.backdropGfx?.destroy();
    this.backdropGfx = null;
  }
}
