/**
 * AdventureMapScene — top-level adventure entry. Shows six world nodes laid
 * out in a zig-zag path with the world hero portrait, name, theme color and a
 * star tally. Locked worlds are dimmed and refuse confirmation.
 *
 * Navigation:
 *   - ↑/↓ or W/S moves the cursor between unlocked worlds.
 *   - Enter / Space / pointer down on a node selects it → AdventureStageSelectScene.
 *   - Esc / Backspace → ModeSelectScene.
 *
 * Style is consistent with ModeSelectScene: dark background, monospace HUD,
 * gold highlight on the focused tile.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { WORLDS, WORLD_IDS, type WorldId } from '@/data/worlds';
import { CHARACTERS, CHARACTER_BY_WORLD } from '@/data/characters';
import { getStagesForWorld } from '@/data/stages';
import { SaveManager } from '@/save/SaveManager';
import { darken } from '@/config';
import { CharacterPortrait } from '@/ui/CharacterPortrait';

interface WorldNode {
  worldId: WorldId;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  portrait: CharacterPortrait;
  nameText: Phaser.GameObjects.Text;
  taglineText: Phaser.GameObjects.Text;
  starsText: Phaser.GameObjects.Text;
  lockBadge: Phaser.GameObjects.Text | null;
  unlocked: boolean;
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const LOCKED_TEXT = '#666';

export class AdventureMapScene extends Phaser.Scene {
  private cursor = 0;
  private nodes: WorldNode[] = [];
  private titleText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private keyListeners: Array<{ key: 'keydown'; fn: (e: KeyboardEvent) => void }> = [];

  constructor() {
    super('AdventureMapScene');
  }

  create(): void {
    BGMPlayer.get().play('title');
    this.cameras.main.setBackgroundColor('#0c0418');

    this.drawScreen();
    this.bindKeyboard();

    this.game.events.on('layout-changed', this.relayout, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private drawScreen(): void {
    this.destroyNodes();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const save = SaveManager.get();

    this.titleText?.destroy();
    this.titleText = this.add
      .text(w / 2, 24, 'Aventura', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffe',
      })
      .setOrigin(0.5);

    // Layout: vertical stack of six nodes with a slight horizontal zig-zag.
    const headerY = 56;
    const footerY = 28;
    const usableH = h - headerY - footerY;
    const nodeCount = WORLD_IDS.length;
    const nodeH = Math.max(58, Math.min(80, Math.floor(usableH / nodeCount) - 6));
    const totalH = nodeH * nodeCount + (nodeCount - 1) * 6;
    const startY = headerY + Math.max(0, Math.floor((usableH - totalH) / 2));

    WORLD_IDS.forEach((wid, idx) => {
      const wdef = WORLDS[wid];
      const stages = getStagesForWorld(wid);
      const earned = stages.reduce(
        (acc, s) => acc + save.getAdventureProgress(s.id).stars,
        0,
      );
      const maxStars = stages.length * 3;
      const unlocked = save.isWorldUnlocked(wid);

      const cy = startY + idx * (nodeH + 6) + nodeH / 2;
      // Zig-zag x: offset alternates +/-.
      const offset = (idx % 2 === 0 ? -1 : 1) * 16;
      const cx = Math.floor(w / 2) + offset;

      const container = this.add.container(cx, cy);
      const cardW = Math.min(280, w - 40);

      const bg = this.add
        .rectangle(0, 0, cardW, nodeH, darken(wdef.themeColor, 0.18), unlocked ? 0.9 : 0.45)
        .setStrokeStyle(2, UNFOCUS_COLOR, 1);
      container.add(bg);

      // Portrait on left.
      const portraitSize = Math.max(40, Math.min(54, nodeH - 12));
      const portraitX = -Math.floor(cardW / 2) + Math.floor(portraitSize / 2) + 10;
      const portrait = new CharacterPortrait({
        scene: this,
        x: portraitX,
        y: 0,
        characterId: CHARACTER_BY_WORLD[wid],
        size: portraitSize,
        showLabel: false,
      });
      container.add(portrait.container);
      portrait.container.setAlpha(unlocked ? 1 : 0.45);

      // Text block on right of portrait.
      const textX = portraitX + Math.floor(portraitSize / 2) + 10;
      const nameText = this.add
        .text(textX, -16, `${wid}. ${wdef.name}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: unlocked ? '#ffe' : LOCKED_TEXT,
        })
        .setOrigin(0, 0.5);
      const taglineText = this.add
        .text(textX, 0, wdef.tagline, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: unlocked ? '#bbf' : LOCKED_TEXT,
          wordWrap: { width: cardW - portraitSize - 50 },
        })
        .setOrigin(0, 0.5);
      const starsText = this.add
        .text(
          textX,
          16,
          unlocked
            ? `★ ${earned}/${maxStars}  •  ${CHARACTERS[CHARACTER_BY_WORLD[wid]].name}`
            : 'Bloqueado',
          {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: unlocked ? '#ff8' : LOCKED_TEXT,
          },
        )
        .setOrigin(0, 0.5);
      container.add([nameText, taglineText, starsText]);

      let lockBadge: Phaser.GameObjects.Text | null = null;
      if (!unlocked) {
        lockBadge = this.add
          .text(Math.floor(cardW / 2) - 14, 0, '🔒', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#888',
          })
          .setOrigin(0.5);
        container.add(lockBadge);
      }

      container.setSize(cardW, nodeH);
      container.setData('index', idx);
      container.setData('worldId', wid);

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

      this.nodes.push({
        worldId: wid,
        container,
        bg,
        portrait,
        nameText,
        taglineText,
        starsText,
        lockBadge,
        unlocked,
      });
    });

    // Snap cursor to first unlocked node if needed.
    if (!this.nodes[this.cursor]?.unlocked) {
      const firstUnlocked = this.nodes.findIndex((n) => n.unlocked);
      this.cursor = Math.max(0, firstUnlocked);
    }

    this.hintText?.destroy();
    this.hintText = this.add
      .text(w / 2, h - 14, '↑↓ Navegar  •  Enter Entrar  •  Esc Voltar', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#bbb',
      })
      .setOrigin(0.5);

    this.refreshFocus();
  }

  private refreshFocus(): void {
    this.nodes.forEach((n, idx) => {
      const focused = idx === this.cursor;
      const wdef = WORLDS[n.worldId];
      n.bg.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_COLOR : UNFOCUS_COLOR, 1);
      n.bg.setFillStyle(
        focused ? wdef.themeColor : darken(wdef.themeColor, 0.18),
        n.unlocked ? 0.9 : 0.45,
      );
      n.container.setScale(focused ? 1.03 : 1);
    });
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    const move = (delta: number): void => {
      const count = this.nodes.length;
      if (count === 0) return;
      // Skip locked nodes — they're not selectable.
      let next = this.cursor;
      for (let i = 0; i < count; i++) {
        next = (next + delta + count) % count;
        if (this.nodes[next].unlocked) break;
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
    const node = this.nodes[this.cursor];
    if (!node || !node.unlocked) return;
    this.scene.start('AdventureStageSelectScene', { worldId: node.worldId });
  }

  private back(): void {
    this.scene.start('ModeSelectScene');
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    this.drawScreen();
  }

  private destroyNodes(): void {
    this.nodes.forEach((n) => {
      n.portrait.destroy();
      n.container.destroy(true);
    });
    this.nodes = [];
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.keyListeners.forEach(({ key, fn }) => window.removeEventListener(key, fn));
    this.keyListeners = [];
    this.destroyNodes();
    this.titleText?.destroy();
    this.hintText?.destroy();
    this.titleText = null;
    this.hintText = null;
  }
}
