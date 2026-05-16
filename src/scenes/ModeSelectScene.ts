/**
 * ModeSelectScene — fase 2 entrypoint shown after the title screen.
 *
 * Renders a vertical list of mode cards. Arrow keys / D-pad navigate, Enter /
 * Space / gamepad-A confirm, Esc / B returns to TitleScene. Touch users can
 * tap a card directly. Selecting "Vs IA" swaps the scene's internal `mode`
 * state into a difficulty-picker substep before launching VsScene.
 *
 * The scene only knows about UI — actual mode configuration lives in
 * GameScene / VsScene init data.
 *
 * Fase 5: a small gear icon in the top-right corner opens SettingsScene.
 * Card labels and hints now come from the i18n runtime so the menu reflects
 * the player's chosen language.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { t, i18n } from '@/i18n';
import type { AIDifficulty } from '@/engine/AIPlayer';
import { PUZZLES } from '@/data/puzzles';
import { SaveManager } from '@/save/SaveManager';

type MenuMode = 'main' | 'vs-difficulty' | 'puzzle-picker';

interface CardSpec {
  key: string;
  labelKey: string;
  subtitleKey: string;
  disabled?: boolean;
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = 70;
const CARD_GAP = 12;
const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#cccccc';
const DISABLED_TEXT = '#666';
const SUBTITLE_TEXT = '#bbb';

const MAIN_CARDS: CardSpec[] = [
  { key: 'adventure', labelKey: 'modeselect.adventure.label', subtitleKey: 'modeselect.adventure.subtitle' },
  { key: 'endless', labelKey: 'modeselect.endless.label', subtitleKey: 'modeselect.endless.subtitle' },
  { key: 'vs-ai', labelKey: 'modeselect.vsai.label', subtitleKey: 'modeselect.vsai.subtitle' },
  { key: 'vs-local', labelKey: 'modeselect.vslocal.label', subtitleKey: 'modeselect.vslocal.subtitle' },
  { key: 'vs-online', labelKey: 'modeselect.vsonline.label', subtitleKey: 'modeselect.vsonline.subtitle' },
  { key: 'time-attack', labelKey: 'modeselect.timeattack.label', subtitleKey: 'modeselect.timeattack.subtitle' },
  { key: 'stage-clear', labelKey: 'modeselect.stageclear.label', subtitleKey: 'modeselect.stageclear.subtitle' },
  { key: 'puzzle', labelKey: 'modeselect.puzzle.label', subtitleKey: 'modeselect.puzzle.subtitle' },
];

const PUZZLE_CARDS: Array<CardSpec & { puzzleId: string }> = PUZZLES.map((p) => ({
  key: `puzzle-${p.id}`,
  puzzleId: p.id,
  labelKey: `puzzle.${p.id}.label`,
  subtitleKey: `puzzle.${p.id}.subtitle`,
}));

const DIFFICULTY_CARDS: Array<CardSpec & { difficulty: AIDifficulty }> = [
  { key: 'easy', difficulty: 'easy', labelKey: 'difficulty.easy.label', subtitleKey: 'difficulty.easy.subtitle' },
  { key: 'medium', difficulty: 'medium', labelKey: 'difficulty.medium.label', subtitleKey: 'difficulty.medium.subtitle' },
  { key: 'hard', difficulty: 'hard', labelKey: 'difficulty.hard.label', subtitleKey: 'difficulty.hard.subtitle' },
  { key: 'master', difficulty: 'master', labelKey: 'difficulty.master.label', subtitleKey: 'difficulty.master.subtitle' },
];

export class ModeSelectScene extends Phaser.Scene {
  private mode: MenuMode = 'main';
  private cursor = 0;
  private cardObjects: Phaser.GameObjects.Container[] = [];
  private titleText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private gearButton: Phaser.GameObjects.Container | null = null;
  private shakeTween: Phaser.Tweens.Tween | null = null;
  private keyListeners: Array<{ key: 'keydown' | 'keyup'; fn: (e: KeyboardEvent) => void }> = [];
  private lastGamepadDownAt = 0;
  private lastGamepadVertical = 0;
  private localeUnsub: (() => void) | null = null;

  constructor() {
    super('ModeSelectScene');
  }

  create(): void {
    // Title-music continues in the menus. Don't await unlock — TitleScene
    // already did that on first gesture.
    BGMPlayer.get().play('title');

    this.cameras.main.setBackgroundColor('#08030f');
    this.drawBackdrop();

    this.drawScreen();
    this.bindKeyboard();
    this.game.events.on('layout-changed', this.relayout, this);

    // Re-draw on language change so labels update in place.
    this.localeUnsub = i18n.onChange(() => this.drawScreen());

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private drawBackdrop(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const g = this.add.graphics();
    // Soft amethyst → plum gradient so the mode-pick screen reads as a
    // foyer to the game rather than a flat menu.
    const stops = [
      0x10061e, 0x150924, 0x1a0b2a, 0x1d0c30, 0x210d34, 0x250e38,
      0x290e3a, 0x2a0d3a, 0x290c36, 0x260b30, 0x21092a, 0x1b0824,
    ];
    const stripeH = Math.ceil(h / stops.length);
    for (let i = 0; i < stops.length; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, w, 24);
    g.fillRect(0, h - 24, w, 24);
    g.setDepth(-1000);
  }

  private drawScreen(): void {
    this.destroyCards();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    if (this.titleText) this.titleText.destroy();
    if (this.hintText) this.hintText.destroy();
    if (this.gearButton) {
      this.gearButton.destroy(true);
      this.gearButton = null;
    }

    const heading =
      this.mode === 'main'
        ? t('modeselect.heading.main')
        : this.mode === 'vs-difficulty'
          ? t('modeselect.heading.difficulty')
          : t('modeselect.heading.puzzle');

    const titleY = h < 420 ? 18 : 28;
    this.titleText = this.add
      .text(w / 2, titleY, heading, {
        fontFamily: 'monospace',
        fontSize: h < 420 ? '14px' : '18px',
        color: FOCUS_TEXT,
      })
      .setOrigin(0.5);

    // Gear icon — only on the main menu; the difficulty sub-screen hides it
    // so the top-right stays uncluttered.
    if (this.mode === 'main') {
      this.gearButton = this.buildGearButton(w - 18, titleY);
    }

    const cards: CardSpec[] =
      this.mode === 'main'
        ? MAIN_CARDS
        : this.mode === 'vs-difficulty'
          ? DIFFICULTY_CARDS
          : PUZZLE_CARDS;

    // Decide layout: vertical (1 col) in portrait, grid in landscape.
    const headerArea = titleY + 16;
    const footerArea = 22;
    const available = h - headerArea - footerArea;
    const gap = h < 420 ? 6 : CARD_GAP;
    const useGrid = h < 480 && cards.length > 3;
    const cols = useGrid ? 2 : 1;
    const rows = Math.ceil(cards.length / cols);

    // Compute card height to fit.
    const cardHeight = Math.min(
      CARD_HEIGHT,
      Math.max(40, Math.floor((available - (rows - 1) * gap) / rows)),
    );
    const cardWidth = useGrid ? Math.min(CARD_WIDTH, Math.floor((w - 60) / 2)) : CARD_WIDTH;

    const totalH = rows * cardHeight + (rows - 1) * gap;
    const startY = headerArea + Math.max(0, Math.floor((available - totalH) / 2));

    cards.forEach((spec, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const cy = startY + r * (cardHeight + gap) + cardHeight / 2;
      const cx = useGrid
        ? Math.floor(w / 2) + (c === 0 ? -1 : 1) * Math.floor((cardWidth + 16) / 2)
        : Math.floor(w / 2);
      const container = this.buildCard(spec, idx, cardWidth, cardHeight);
      container.setPosition(cx, cy);
      this.cardObjects.push(container);
    });

    const hint =
      this.mode === 'main'
        ? t('modeselect.hint.main')
        : this.mode === 'vs-difficulty'
          ? t('modeselect.hint.difficulty')
          : t('modeselect.hint.puzzle');

    this.hintText = this.add
      .text(w / 2, h - 12, hint, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: SUBTITLE_TEXT,
      })
      .setOrigin(0.5);

    this.refreshFocus();
  }

  private buildGearButton(cx: number, cy: number): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy);
    const bg = this.add
      .rectangle(0, 0, 28, 28, 0x251338, 0.95)
      .setStrokeStyle(2, UNFOCUS_COLOR, 1);
    const icon = this.add
      .text(0, 0, '⚙', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: FOCUS_TEXT,
      })
      .setOrigin(0.5);
    container.add([bg, icon]);
    container.setSize(28, 28);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, FOCUS_COLOR, 1);
      bg.setFillStyle(0x36204c, 0.95);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, UNFOCUS_COLOR, 1);
      bg.setFillStyle(0x251338, 0.95);
    });
    bg.on('pointerdown', () => this.openSettings());

    return container;
  }

  private buildCard(
    spec: CardSpec,
    idx: number,
    width: number = CARD_WIDTH,
    height: number = CARD_HEIGHT,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const compact = height < 56;

    const adventure = spec.key === 'adventure';
    const baseStroke = adventure ? 0xffcc55 : UNFOCUS_COLOR;
    const bg = this.add
      .rectangle(0, 0, width, height, adventure ? 0x3a2a18 : 0x251338, 0.95)
      .setStrokeStyle(adventure ? 3 : 2, baseStroke, 1);
    bg.setName('bg');
    bg.setData('isAdventure', adventure);

    const labelY = compact ? -height * 0.18 : -10;
    const subY = compact ? height * 0.22 : 14;
    const labelSize = compact ? '12px' : '14px';
    const subSize = compact ? '9px' : '10px';

    const label = this.add
      .text(0, labelY, t(spec.labelKey), {
        fontFamily: 'monospace',
        fontSize: labelSize,
        color: spec.disabled ? DISABLED_TEXT : UNFOCUS_TEXT,
      })
      .setOrigin(0.5);
    label.setName('label');

    const subtitle = this.add
      .text(0, subY, t(spec.subtitleKey), {
        fontFamily: 'monospace',
        fontSize: subSize,
        color: SUBTITLE_TEXT,
        align: 'center',
        wordWrap: { width: width - 12 },
      })
      .setOrigin(0.5);
    subtitle.setName('subtitle');

    container.add([bg, label, subtitle]);
    container.setSize(width, height);
    container.setData('spec', spec);
    container.setData('index', idx);

    // Touch / mouse: tap = focus + confirm.
    bg.setInteractive({ useHandCursor: !spec.disabled });
    bg.on('pointerover', () => {
      this.cursor = idx;
      this.refreshFocus();
    });
    bg.on('pointerdown', () => {
      this.cursor = idx;
      this.refreshFocus();
      this.confirm();
    });

    return container;
  }

  private refreshFocus(): void {
    this.cardObjects.forEach((c, idx) => {
      const spec = c.getData('spec') as CardSpec;
      const focused = idx === this.cursor;
      const bg = c.getByName('bg') as Phaser.GameObjects.Rectangle | null;
      const label = c.getByName('label') as Phaser.GameObjects.Text | null;
      if (bg !== null) {
        const adv = bg.getData('isAdventure') === true;
        const baseStroke = adv ? 0xffcc55 : UNFOCUS_COLOR;
        bg.setStrokeStyle(adv ? 3 : 2, focused ? FOCUS_COLOR : baseStroke, 1);
        bg.setFillStyle(
          focused ? (adv ? 0x4a3a22 : 0x36204c) : (adv ? 0x3a2a18 : 0x251338),
          0.95,
        );
      }
      if (label !== null) {
        label.setColor(
          spec.disabled ? DISABLED_TEXT : focused ? FOCUS_TEXT : UNFOCUS_TEXT,
        );
      }
      c.setScale(focused ? 1.04 : 1);
    });
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    const move = (delta: number): void => {
      const count = this.cardObjects.length;
      if (count === 0) return;
      this.cursor = (this.cursor + delta + count) % count;
      this.refreshFocus();
    };

    const onDown = (e: KeyboardEvent): void => {
      const grid = this.scale.gameSize.height < 480 && this.cardObjects.length > 3;
      const cols = grid ? 2 : 1;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          move(-cols);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          move(cols);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (grid) { e.preventDefault(); move(-1); }
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (grid) { e.preventDefault(); move(1); }
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

    // Light gamepad polling. We can't rely on the InputController here (this
    // scene shouldn't own one) — a tiny inline poll is fine for menu nav.
    this.events.on('update', this.pollGamepad, this);
  }

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const up = pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.5;
      const down = pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.5;
      const confirm =
        pad.buttons[0]?.pressed ||
        pad.buttons[9]?.pressed; // A or Start
      const cancel = pad.buttons[1]?.pressed || pad.buttons[8]?.pressed; // B or Select

      const now = performance.now();
      const vertical = up ? -1 : down ? 1 : 0;
      if (vertical !== 0 && vertical !== this.lastGamepadVertical) {
        if (now - this.lastGamepadDownAt > 120) {
          const count = this.cardObjects.length;
          this.cursor = (this.cursor + vertical + count) % count;
          this.refreshFocus();
          this.lastGamepadDownAt = now;
        }
      }
      this.lastGamepadVertical = vertical;

      if (confirm && now - this.lastGamepadDownAt > 200) {
        this.confirm();
        this.lastGamepadDownAt = now;
      }
      if (cancel && now - this.lastGamepadDownAt > 200) {
        this.back();
        this.lastGamepadDownAt = now;
      }
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private openSettings(): void {
    this.scene.start('SettingsScene', { returnTo: 'ModeSelectScene' });
  }

  private confirm(): void {
    if (this.mode === 'main') {
      const card = this.cardObjects[this.cursor];
      if (!card) return;
      const spec = card.getData('spec') as CardSpec;
      if (spec.disabled) {
        this.shakeCard(card);
        return;
      }
      // First-run players land in the tutorial overlay regardless of which
      // mode they picked. The Onboarding scene flips the SaveManager flag
      // and routes them into Endless when they finish or skip. Sub-pickers
      // (vs-difficulty, puzzle-picker) aren't real gameplay so we don't
      // gate them here.
      if (!SaveManager.get().getOnboardingSeen()) {
        switch (spec.key) {
          case 'adventure':
          case 'endless':
          case 'time-attack':
          case 'stage-clear':
          case 'vs-local':
          case 'vs-online':
            this.scene.start('OnboardingScene');
            return;
          default:
            break;
        }
      }
      switch (spec.key) {
        case 'adventure':
          this.scene.start('AdventureMapScene');
          break;
        case 'endless':
          this.scene.start('GameScene', { mode: 'endless' });
          break;
        case 'vs-ai':
          this.mode = 'vs-difficulty';
          this.cursor = 1; // Médio as the default focus.
          this.drawScreen();
          break;
        case 'vs-local':
          this.scene.start('VsLocalScene');
          break;
        case 'vs-online':
          this.scene.start('OnlineLobbyScene');
          break;
        case 'time-attack':
          this.scene.start('GameScene', { mode: 'time-attack' });
          break;
        case 'stage-clear':
          this.scene.start('GameScene', { mode: 'stage-clear' });
          break;
        case 'puzzle':
          this.mode = 'puzzle-picker';
          this.cursor = 0;
          this.drawScreen();
          break;
        default:
          this.shakeCard(card);
          break;
      }
      return;
    }

    if (this.mode === 'puzzle-picker') {
      const card = this.cardObjects[this.cursor];
      if (!card) return;
      const spec = card.getData('spec') as CardSpec & { puzzleId: string };
      this.scene.start('GameScene', { mode: 'puzzle', puzzleId: spec.puzzleId });
      return;
    }

    // vs-difficulty: launch VsScene with chosen difficulty.
    const card = this.cardObjects[this.cursor];
    if (!card) return;
    const spec = card.getData('spec') as CardSpec & { difficulty: AIDifficulty };
    this.scene.start('VsScene', { difficulty: spec.difficulty });
  }

  private back(): void {
    if (this.mode === 'vs-difficulty') {
      this.mode = 'main';
      this.cursor = 2;
      this.drawScreen();
      return;
    }
    if (this.mode === 'puzzle-picker') {
      this.mode = 'main';
      this.cursor = 7;
      this.drawScreen();
      return;
    }
    this.scene.start('TitleScene');
  }

  private shakeCard(card: Phaser.GameObjects.Container): void {
    if (this.shakeTween) {
      this.shakeTween.stop();
      this.shakeTween = null;
    }
    const baseX = card.x;
    this.shakeTween = this.tweens.add({
      targets: card,
      x: { from: baseX - 6, to: baseX + 6 },
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        card.x = baseX;
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    this.drawScreen();
  }

  private destroyCards(): void {
    this.cardObjects.forEach((c) => c.destroy(true));
    this.cardObjects = [];
  }

  private cleanup(): void {
    this.game.events.off('layout-changed', this.relayout, this);
    this.events.off('update', this.pollGamepad, this);
    this.keyListeners.forEach(({ key, fn }) => window.removeEventListener(key, fn));
    this.keyListeners = [];
    this.destroyCards();
    if (this.titleText) {
      this.titleText.destroy();
      this.titleText = null;
    }
    if (this.hintText) {
      this.hintText.destroy();
      this.hintText = null;
    }
    if (this.gearButton) {
      this.gearButton.destroy(true);
      this.gearButton = null;
    }
    if (this.shakeTween) {
      this.shakeTween.stop();
      this.shakeTween = null;
    }
    if (this.localeUnsub) {
      this.localeUnsub();
      this.localeUnsub = null;
    }
  }
}
