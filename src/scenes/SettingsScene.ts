/**
 * SettingsScene — Player-facing settings menu.
 *
 * Accessible from ModeSelectScene via the gear icon. Provides:
 *   - Language (radio: pt-BR / es-ES / en)
 *   - BGM volume (slider 0..100)
 *   - SFX volume (slider 0..100)
 *   - Vibration toggle
 *   - Touch button layout (Destro/Canhoto)
 *   - Pixel perfect toggle (informational only — requires reload)
 *   - Reset progress (with confirmation prompt)
 *
 * Volume sliders read/write through BGMPlayer / SFXPlayer (the canonical
 * volume owners). SaveManager mirrors them for cross-session restore.
 *
 * Scene init data: `{ returnTo?: string }` — defaults to 'ModeSelectScene'.
 *
 * Layout: a vertical scrollable list of cards. Each card shows a label on
 * the left and its control on the right. The list scrolls when its content
 * exceeds the viewport.
 */

import Phaser from 'phaser';
import { i18n, t, SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { BGMPlayer, SFXPlayer } from '@/audio';
import { SaveManager } from '@/save/SaveManager';

interface SettingsInit {
  returnTo?: string;
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x555555;
const FOCUS_TEXT = '#ffe';
const UNFOCUS_TEXT = '#ccc';
const SUBTITLE_TEXT = '#bbb';
const CARD_FILL = 0x251338;
const CARD_FILL_FOCUS = 0x36204c;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 56;
const CARD_GAP = 8;

type ControlKind = 'language' | 'bgm' | 'sfx' | 'vibration' | 'touchSide' | 'pixelPerfect' | 'reset' | 'back';

interface SettingsRow {
  kind: ControlKind;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  // Optional inner controls (set depending on `kind`):
  valueText?: Phaser.GameObjects.Text;
  sliderTrack?: Phaser.GameObjects.Rectangle;
  sliderFill?: Phaser.GameObjects.Rectangle;
  sliderHandle?: Phaser.GameObjects.Rectangle;
}

export class SettingsScene extends Phaser.Scene {
  private returnTo = 'ModeSelectScene';
  private rows: SettingsRow[] = [];
  private cursor = 0;
  private titleText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private confirmGroup: Phaser.GameObjects.Container | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private scrollY = 0;
  private listContainer: Phaser.GameObjects.Container | null = null;
  private listMask: Phaser.Display.Masks.GeometryMask | null = null;
  private maskGfx: Phaser.GameObjects.Graphics | null = null;
  private listTopY = 0;
  private listBottomY = 0;
  private contentHeight = 0;

  constructor() {
    super('SettingsScene');
  }

  init(data?: SettingsInit): void {
    this.returnTo = data?.returnTo ?? 'ModeSelectScene';
    this.rows = [];
    this.cursor = 0;
  }

  private drawBackdrop(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const g = this.add.graphics();
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

  create(): void {
    this.cameras.main.setBackgroundColor('#08030f');
    this.drawBackdrop();

    this.drawScreen();
    this.bindInput();

    this.game.events.on('layout-changed', this.relayout, this);
    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private drawScreen(): void {
    this.destroyRows();
    this.titleText?.destroy();
    this.hintText?.destroy();
    this.listContainer?.destroy(true);
    this.maskGfx?.destroy();
    this.listMask?.destroy();

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;

    this.titleText = this.add
      .text(w / 2, 22, t('settings.title'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: FOCUS_TEXT,
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(w / 2, h - 14, t('settings.hint'), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: SUBTITLE_TEXT,
        align: 'center',
        wordWrap: { width: w - 16 },
      })
      .setOrigin(0.5);

    this.listTopY = 44;
    this.listBottomY = h - 28;
    const listHeight = this.listBottomY - this.listTopY;

    this.listContainer = this.add.container(0, this.listTopY);

    // Geometry mask so the list scrolls inside its viewport.
    this.maskGfx = this.add.graphics();
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.fillRect(0, this.listTopY, w, listHeight);
    this.maskGfx.setVisible(false);
    this.listMask = this.maskGfx.createGeometryMask();
    this.listContainer.setMask(this.listMask);

    const cardW = Math.min(CARD_WIDTH, w - 24);

    const definitions: ControlKind[] = [
      'language',
      'bgm',
      'sfx',
      'vibration',
      'touchSide',
      'pixelPerfect',
      'reset',
      'back',
    ];

    let y = 0;
    definitions.forEach((kind) => {
      const row = this.buildRow(kind, w / 2, y + CARD_HEIGHT / 2, cardW);
      this.rows.push(row);
      this.listContainer!.add(row.container);
      y += CARD_HEIGHT + CARD_GAP;
    });
    this.contentHeight = y;

    this.scrollY = 0;
    this.applyScroll();
    this.refreshFocus();
    this.refreshAllValues();
  }

  private buildRow(
    kind: ControlKind,
    cx: number,
    cy: number,
    width: number,
  ): SettingsRow {
    const container = this.add.container(cx, cy);

    const bg = this.add
      .rectangle(0, 0, width, CARD_HEIGHT, CARD_FILL, 0.95)
      .setStrokeStyle(2, UNFOCUS_COLOR, 1);

    const labelKey = this.labelKeyFor(kind);
    const label = this.add
      .text(-width / 2 + 12, 0, t(labelKey), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: UNFOCUS_TEXT,
      })
      .setOrigin(0, 0.5);

    container.add([bg, label]);
    container.setSize(width, CARD_HEIGHT);

    const row: SettingsRow = { kind, container, bg, label };

    // Right-side control(s) per kind.
    const rightX = width / 2 - 12;
    switch (kind) {
      case 'language': {
        const val = this.add
          .text(rightX, 0, '', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: FOCUS_TEXT,
          })
          .setOrigin(1, 0.5);
        container.add(val);
        row.valueText = val;
        break;
      }
      case 'bgm':
      case 'sfx': {
        const trackW = 110;
        const trackH = 6;
        const trackX = rightX - trackW;
        const track = this.add
          .rectangle(trackX, 0, trackW, trackH, 0x1a0f24, 1)
          .setOrigin(0, 0.5)
          .setStrokeStyle(1, 0x553377, 1);
        const fill = this.add
          .rectangle(trackX, 0, 0, trackH, 0xffaa55, 1)
          .setOrigin(0, 0.5);
        const handle = this.add
          .rectangle(trackX, 0, 8, 16, 0xffeecc, 1)
          .setStrokeStyle(1, 0x000000, 0.4);
        const valueText = this.add
          .text(rightX, -CARD_HEIGHT / 2 + 8, '0%', {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: SUBTITLE_TEXT,
          })
          .setOrigin(1, 0.5);
        container.add([track, fill, handle, valueText]);
        row.sliderTrack = track;
        row.sliderFill = fill;
        row.sliderHandle = handle;
        row.valueText = valueText;
        this.bindSliderDrag(row);
        break;
      }
      case 'vibration':
      case 'touchSide':
      case 'pixelPerfect': {
        const val = this.add
          .text(rightX, 0, '', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: FOCUS_TEXT,
          })
          .setOrigin(1, 0.5);
        container.add(val);
        row.valueText = val;
        break;
      }
      case 'reset': {
        const val = this.add
          .text(rightX, 0, '⚠', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#f88',
          })
          .setOrigin(1, 0.5);
        container.add(val);
        row.valueText = val;
        bg.setStrokeStyle(2, 0x884444, 1);
        break;
      }
      case 'back': {
        label.setText(t('settings.back'));
        label.setOrigin(0.5, 0.5).setX(0);
        break;
      }
      default:
        break;
    }

    // Interactive — focus + activate.
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      const idx = this.rows.findIndex((r) => r === row);
      if (idx >= 0) {
        this.cursor = idx;
        this.refreshFocus();
        this.ensureCursorVisible();
      }
    });
    bg.on('pointerdown', () => {
      const idx = this.rows.findIndex((r) => r === row);
      if (idx >= 0) {
        this.cursor = idx;
        this.refreshFocus();
        this.ensureCursorVisible();
        this.activate();
      }
    });

    return row;
  }

  private labelKeyFor(kind: ControlKind): string {
    switch (kind) {
      case 'language':
        return 'settings.language';
      case 'bgm':
        return 'settings.bgm';
      case 'sfx':
        return 'settings.sfx';
      case 'vibration':
        return 'settings.vibration';
      case 'touchSide':
        return 'settings.touchSide';
      case 'pixelPerfect':
        return 'settings.pixelPerfect';
      case 'reset':
        return 'settings.reset';
      case 'back':
        return 'settings.back';
      default:
        return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Slider drag wiring
  // ---------------------------------------------------------------------------

  private bindSliderDrag(row: SettingsRow): void {
    const { sliderTrack, sliderHandle } = row;
    if (!sliderTrack || !sliderHandle) return;
    const updateFromPointer = (pointer: Phaser.Input.Pointer): void => {
      // pointer.x is scene-space already.
      const trackWorld = sliderTrack.getWorldTransformMatrix();
      const startX = trackWorld.tx;
      const trackW = sliderTrack.width;
      const ratio = Math.max(0, Math.min(1, (pointer.x - startX) / trackW));
      this.applySliderValue(row, ratio);
    };
    sliderTrack.setInteractive({ useHandCursor: true });
    sliderHandle.setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(sliderHandle);
    sliderTrack.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const idx = this.rows.findIndex((r) => r === row);
      if (idx >= 0) {
        this.cursor = idx;
        this.refreshFocus();
      }
      updateFromPointer(p);
    });
    sliderHandle.on('drag', (p: Phaser.Input.Pointer) => {
      updateFromPointer(p);
    });
  }

  private applySliderValue(row: SettingsRow, ratio: number): void {
    const v = Math.max(0, Math.min(1, ratio));
    if (row.kind === 'bgm') {
      BGMPlayer.get().setVolume(v);
      SaveManager.get().setSetting('bgmVolume', v);
    } else if (row.kind === 'sfx') {
      SFXPlayer.get().setVolume(v);
      SaveManager.get().setSetting('sfxVolume', v);
    }
    this.refreshSlider(row);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  private refreshFocus(): void {
    this.rows.forEach((row, idx) => {
      const focused = idx === this.cursor;
      row.bg.setStrokeStyle(2, focused ? FOCUS_COLOR : UNFOCUS_COLOR, 1);
      row.bg.setFillStyle(focused ? CARD_FILL_FOCUS : CARD_FILL, 0.95);
      row.label.setColor(focused ? FOCUS_TEXT : UNFOCUS_TEXT);
      row.container.setScale(focused ? 1.02 : 1);
    });
  }

  private refreshAllValues(): void {
    for (const row of this.rows) this.refreshRowValue(row);
  }

  private refreshRowValue(row: SettingsRow): void {
    switch (row.kind) {
      case 'language':
        if (row.valueText) row.valueText.setText(t(`settings.lang.${i18n.getLocale()}`));
        break;
      case 'bgm':
      case 'sfx':
        this.refreshSlider(row);
        break;
      case 'vibration': {
        if (row.valueText) {
          row.valueText.setText(
            SaveManager.get().getVibration() ? t('settings.on') : t('settings.off'),
          );
        }
        break;
      }
      case 'touchSide': {
        if (row.valueText) {
          const side = SaveManager.get().getTouchSide();
          row.valueText.setText(
            side === 'right' ? t('settings.touchSide.right') : t('settings.touchSide.left'),
          );
        }
        break;
      }
      case 'pixelPerfect': {
        if (row.valueText) row.valueText.setText(t('settings.pixelPerfect.note'));
        break;
      }
      case 'reset':
      case 'back':
        break;
      default:
        break;
    }
  }

  private refreshSlider(row: SettingsRow): void {
    if (!row.sliderTrack || !row.sliderFill || !row.sliderHandle) return;
    const volume =
      row.kind === 'bgm' ? BGMPlayer.get().getVolume() : SFXPlayer.get().getVolume();
    const trackW = row.sliderTrack.width;
    const trackLeft = row.sliderTrack.x; // origin 0 means x is the left edge
    row.sliderFill.width = trackW * volume;
    row.sliderHandle.x = trackLeft + trackW * volume;
    if (row.valueText) row.valueText.setText(`${Math.round(volume * 100)}%`);
  }

  // ---------------------------------------------------------------------------
  // Scrolling
  // ---------------------------------------------------------------------------

  private applyScroll(): void {
    if (!this.listContainer) return;
    const viewport = this.listBottomY - this.listTopY;
    const max = Math.max(0, this.contentHeight - viewport);
    this.scrollY = Math.max(0, Math.min(max, this.scrollY));
    this.listContainer.y = this.listTopY - this.scrollY;
  }

  private ensureCursorVisible(): void {
    if (!this.listContainer) return;
    const row = this.rows[this.cursor];
    if (!row) return;
    const viewport = this.listBottomY - this.listTopY;
    const rowTop = row.container.y - CARD_HEIGHT / 2;
    const rowBottom = row.container.y + CARD_HEIGHT / 2;
    if (rowTop < this.scrollY) {
      this.scrollY = rowTop - 4;
    } else if (rowBottom > this.scrollY + viewport) {
      this.scrollY = rowBottom - viewport + 4;
    }
    this.applyScroll();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindInput(): void {
    const onDown = (e: KeyboardEvent): void => {
      if (this.confirmGroup) {
        // Reset-confirmation prompt is open — capture nav keys.
        switch (e.key) {
          case 'Enter':
          case ' ':
            e.preventDefault();
            this.performReset();
            this.dismissConfirm();
            break;
          case 'Escape':
          case 'Backspace':
            e.preventDefault();
            this.dismissConfirm();
            break;
          default:
            break;
        }
        return;
      }
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.moveCursor(-1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.moveCursor(1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.adjust(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.adjust(1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.activate();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          this.goBack();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyHandler = onDown;
  }

  private moveCursor(delta: number): void {
    const count = this.rows.length;
    if (count === 0) return;
    this.cursor = (this.cursor + delta + count) % count;
    this.refreshFocus();
    this.ensureCursorVisible();
  }

  /** Left/Right adjustment depending on the current row's control kind. */
  private adjust(dir: -1 | 1): void {
    const row = this.rows[this.cursor];
    if (!row) return;
    switch (row.kind) {
      case 'language': {
        const order: Locale[] = SUPPORTED_LOCALES;
        const i = order.indexOf(i18n.getLocale());
        const next = order[(i + dir + order.length) % order.length];
        this.setLanguage(next);
        break;
      }
      case 'bgm': {
        const v = BGMPlayer.get().getVolume();
        this.applySliderValue(row, v + dir * 0.05);
        break;
      }
      case 'sfx': {
        const v = SFXPlayer.get().getVolume();
        this.applySliderValue(row, v + dir * 0.05);
        break;
      }
      case 'vibration': {
        this.toggleVibration();
        break;
      }
      case 'touchSide': {
        this.toggleTouchSide();
        break;
      }
      case 'pixelPerfect':
      case 'reset':
      case 'back':
        break;
      default:
        break;
    }
  }

  /** Enter / Space behavior depending on the current row. */
  private activate(): void {
    const row = this.rows[this.cursor];
    if (!row) return;
    switch (row.kind) {
      case 'language': {
        const order: Locale[] = SUPPORTED_LOCALES;
        const i = order.indexOf(i18n.getLocale());
        const next = order[(i + 1) % order.length];
        this.setLanguage(next);
        break;
      }
      case 'vibration':
        this.toggleVibration();
        break;
      case 'touchSide':
        this.toggleTouchSide();
        break;
      case 'pixelPerfect':
        // No-op; informational only.
        break;
      case 'reset':
        this.showConfirm();
        break;
      case 'back':
        this.goBack();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  private setLanguage(loc: Locale): void {
    i18n.setLocale(loc);
    SaveManager.get().setLocale(loc);
    // Redraw the whole scene because every label depends on the locale.
    this.cursor = Math.max(0, Math.min(this.cursor, this.rows.length - 1));
    const restoreCursor = this.cursor;
    const restoreScroll = this.scrollY;
    this.drawScreen();
    this.cursor = restoreCursor;
    this.scrollY = restoreScroll;
    this.applyScroll();
    this.refreshFocus();
  }

  private toggleVibration(): void {
    const next = !SaveManager.get().getVibration();
    SaveManager.get().setVibration(next);
    // iOS Safari defines the property but it's not a function — must check
    // the type, not just presence, otherwise the test buzz throws.
    if (next && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(15);
      } catch {
        // Vibration may be blocked.
      }
    }
    const row = this.rows[this.cursor];
    if (row) this.refreshRowValue(row);
  }

  private toggleTouchSide(): void {
    const next = SaveManager.get().getTouchSide() === 'right' ? 'left' : 'right';
    SaveManager.get().setTouchSide(next);
    const row = this.rows[this.cursor];
    if (row) this.refreshRowValue(row);
  }

  // ---------------------------------------------------------------------------
  // Reset confirmation prompt
  // ---------------------------------------------------------------------------

  private showConfirm(): void {
    if (this.confirmGroup) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const group = this.add.container(0, 0);

    const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.78).setOrigin(0, 0);

    const panelW = Math.min(280, w - 32);
    const panelH = 130;
    const panel = this.add
      .rectangle(w / 2, h / 2, panelW, panelH, 0x2a1438, 1)
      .setStrokeStyle(2, 0xff8888, 1);

    const message = this.add
      .text(w / 2, h / 2 - 32, t('settings.reset.confirm'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: FOCUS_TEXT,
        align: 'center',
        wordWrap: { width: panelW - 24 },
      })
      .setOrigin(0.5);

    const yes = this.add
      .text(w / 2 - 60, h / 2 + 24, t('common.yes'), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f88',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    yes.on('pointerdown', () => {
      this.performReset();
      this.dismissConfirm();
    });

    const no = this.add
      .text(w / 2 + 60, h / 2 + 24, t('common.no'), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: FOCUS_TEXT,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    no.on('pointerdown', () => {
      this.dismissConfirm();
    });

    group.add([dim, panel, message, yes, no]);
    this.confirmGroup = group;
  }

  private dismissConfirm(): void {
    if (!this.confirmGroup) return;
    this.confirmGroup.destroy(true);
    this.confirmGroup = null;
  }

  private performReset(): void {
    SaveManager.get().reset();
    // Re-apply the now-default settings into the audio + i18n owners.
    const s = SaveManager.get().getSettings();
    BGMPlayer.get().setVolume(s.bgmVolume);
    SFXPlayer.get().setVolume(s.sfxVolume);
    i18n.setLocale(s.locale);
    const restoreCursor = this.cursor;
    const restoreScroll = this.scrollY;
    this.drawScreen();
    this.cursor = restoreCursor;
    this.scrollY = restoreScroll;
    this.applyScroll();
    this.refreshFocus();
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  private goBack(): void {
    this.scene.start(this.returnTo);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private relayout(): void {
    const cur = this.cursor;
    this.drawScreen();
    this.cursor = Math.max(0, Math.min(cur, this.rows.length - 1));
    this.refreshFocus();
    this.ensureCursorVisible();
  }

  private destroyRows(): void {
    this.rows.forEach((r) => r.container.destroy(true));
    this.rows = [];
  }

  private cleanup(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.game.events.off('layout-changed', this.relayout, this);
    this.destroyRows();
    this.titleText?.destroy();
    this.hintText?.destroy();
    this.titleText = null;
    this.hintText = null;
    this.confirmGroup?.destroy(true);
    this.confirmGroup = null;
    this.listContainer?.destroy(true);
    this.listContainer = null;
    this.maskGfx?.destroy();
    this.maskGfx = null;
    this.listMask?.destroy();
    this.listMask = null;
  }
}
