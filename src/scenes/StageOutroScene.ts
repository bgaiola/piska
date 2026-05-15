/**
 * StageOutroScene — plays the post-stage dialog and records progress.
 *
 * Input payload:
 *   - stageId: string
 *   - result: 'won' | 'lost'
 *   - stars: 0..3
 *   - score: number
 *   - timeMs: number
 *
 * Flow:
 *   1. Persist the result via SaveManager.recordAdventureResult.
 *   2. Play the matching DialogScript (onWin or onLose). If none defined, use
 *      the character's default victory/defeat voice line.
 *   3. Show a star tally that animates the earned stars in (win only).
 *   4. Offer "Tentar de novo" / "Voltar ao mapa" buttons on loss, or just a
 *      "Continuar" on win.
 */

import Phaser from 'phaser';
import { BGMPlayer } from '@/audio';
import { WORLDS } from '@/data/worlds';
import {
  getStageById,
  type StageDef,
  type DialogScript,
  type DialogLine,
} from '@/data/stages';
import { CHARACTERS, type CharacterId } from '@/data/characters';
import { CharacterPortrait } from '@/ui/CharacterPortrait';
import { DialogBox } from '@/ui/DialogBox';
import { SaveManager } from '@/save/SaveManager';

interface OutroInit {
  stageId: string;
  result: 'won' | 'lost';
  stars: 0 | 1 | 2 | 3;
  score: number;
  timeMs: number;
}

interface OutroButton {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  action: 'retry' | 'map' | 'stages' | 'next';
}

const FOCUS_COLOR = 0xffeecc;
const UNFOCUS_COLOR = 0x777777;

export class StageOutroScene extends Phaser.Scene {
  private payload: OutroInit = {
    stageId: '',
    result: 'lost',
    stars: 0,
    score: 0,
    timeMs: 0,
  };
  private stage: StageDef | undefined;
  private portrait: CharacterPortrait | null = null;
  private dialogBox: DialogBox | null = null;
  private starsContainer: Phaser.GameObjects.Container | null = null;
  private summaryText: Phaser.GameObjects.Text | null = null;
  private buttons: OutroButton[] = [];
  private cursor = 0;
  private dialogDone = false;
  private keyListeners: Array<{ key: 'keydown'; fn: (e: KeyboardEvent) => void }> = [];
  private cancelled = false;

  constructor() {
    super('StageOutroScene');
  }

  init(d: OutroInit): void {
    this.payload = {
      stageId: d?.stageId ?? '',
      result: d?.result ?? 'lost',
      stars: (d?.stars ?? 0) as 0 | 1 | 2 | 3,
      score: d?.score ?? 0,
      timeMs: d?.timeMs ?? 0,
    };
    this.stage = getStageById(this.payload.stageId);
    this.dialogDone = false;
    this.cancelled = false;
    this.cursor = 0;
    this.buttons = [];
  }

  create(): void {
    if (!this.stage) {
      this.scene.start('AdventureMapScene');
      return;
    }

    // Persist progress immediately so even if the player force-closes the tab
    // mid-dialog we keep the result.
    SaveManager.get().recordAdventureResult(
      this.payload.stageId,
      this.payload.result,
      this.payload.stars,
      this.payload.score,
      this.payload.timeMs,
    );

    BGMPlayer.get().play(WORLDS[this.stage.worldId].trackId);
    this.cameras.main.setBackgroundColor('#0c0418');

    this.drawScreen();
    this.bindKeyboard();

    void this.playOutro();

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private drawScreen(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const portrait = h > w;
    const wdef = WORLDS[this.stage.worldId];

    this.add.rectangle(0, 0, w, h, wdef.themeColor, 0.08).setOrigin(0, 0);

    // Banner
    const banner = this.payload.result === 'won' ? 'Vitória!' : 'Quase!';
    this.add
      .text(w / 2, 18, banner, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: this.payload.result === 'won' ? '#ffe' : '#fbb',
      })
      .setOrigin(0.5);

    // Summary line
    this.summaryText = this.add
      .text(
        w / 2,
        38,
        `Score ${this.payload.score}  •  ${this.fmt(this.payload.timeMs)}`,
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#bbf',
        },
      )
      .setOrigin(0.5);

    const speakerId = this.firstSpeaker() ?? this.stage.characterId;
    const portraitSize = portrait ? 100 : 120;
    const portraitX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.28);
    const portraitY = portrait ? Math.floor(h * 0.30) : Math.floor(h / 2);

    this.portrait = new CharacterPortrait({
      scene: this,
      x: portraitX,
      y: portraitY,
      characterId: speakerId,
      size: portraitSize,
    });

    // Stars row (always drawn — empty if 0).
    this.starsContainer = this.add.container(w / 2, portraitY - portraitSize / 2 - 18);
    const starSpacing = 22;
    for (let i = 0; i < 3; i++) {
      const filled = i < this.payload.stars;
      const star = this.add
        .text((i - 1) * starSpacing, 0, filled ? '★' : '☆', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: filled ? '#ff8' : '#666',
        })
        .setOrigin(0.5);
      // Pop in with a small tween for filled stars.
      if (filled) {
        star.setScale(0.2);
        this.tweens.add({
          targets: star,
          scale: 1,
          duration: 220,
          ease: 'Back.easeOut',
          delay: 200 + i * 160,
        });
      }
      this.starsContainer.add(star);
    }

    // Dialog box
    const dialogW = portrait ? w - 24 : Math.floor(w * 0.5);
    const dialogH = portrait ? Math.floor(h * 0.24) : Math.floor(h * 0.45);
    const dialogX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.7);
    const dialogY = portrait
      ? h - Math.floor(dialogH / 2) - 80
      : Math.floor(h * 0.4);
    this.dialogBox = new DialogBox({
      scene: this,
      x: dialogX,
      y: dialogY,
      width: dialogW,
      height: dialogH,
    });
  }

  private drawButtons(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const btnY = h - 30;
    const specs: Array<{ label: string; action: OutroButton['action'] }> = [];

    if (this.payload.result === 'won') {
      const nextStage = this.findNextStage();
      if (nextStage) {
        specs.push({ label: 'Próxima fase', action: 'next' });
      }
      specs.push({ label: 'Voltar às fases', action: 'stages' });
    } else {
      specs.push({ label: 'Tentar de novo', action: 'retry' });
      specs.push({ label: 'Voltar ao mapa', action: 'stages' });
    }

    const btnW = 120;
    const btnH = 28;
    const gap = 10;
    const totalW = specs.length * btnW + (specs.length - 1) * gap;
    const startX = Math.floor((w - totalW) / 2) + btnW / 2;

    specs.forEach((spec, idx) => {
      const cx = startX + idx * (btnW + gap);
      const container = this.add.container(cx, btnY);
      const bg = this.add
        .rectangle(0, 0, btnW, btnH, 0x36204c, 0.95)
        .setStrokeStyle(2, UNFOCUS_COLOR);
      const label = this.add
        .text(0, 0, spec.label, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffe',
        })
        .setOrigin(0.5);
      container.add([bg, label]);
      container.setSize(btnW, btnH);

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        this.cursor = idx;
        this.refreshButtonFocus();
      });
      bg.on('pointerdown', () => {
        this.cursor = idx;
        this.refreshButtonFocus();
        this.activateButton();
      });

      this.buttons.push({ container, bg, label, action: spec.action });
    });

    this.refreshButtonFocus();
  }

  private refreshButtonFocus(): void {
    this.buttons.forEach((b, idx) => {
      const focused = idx === this.cursor;
      b.bg.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_COLOR : UNFOCUS_COLOR, 1);
      b.bg.setFillStyle(focused ? 0x4d2c66 : 0x36204c, 0.95);
      b.container.setScale(focused ? 1.04 : 1);
    });
  }

  // ---------------------------------------------------------------------------
  // Script playback
  // ---------------------------------------------------------------------------

  private async playOutro(): Promise<void> {
    const script = this.pickScript();
    if (!script || script.lines.length === 0) {
      this.dialogDone = true;
      this.drawButtons();
      return;
    }
    for (const line of script.lines) {
      if (this.cancelled) return;
      await this.showLine(line);
    }
    if (this.cancelled) return;
    this.dialogDone = true;
    this.drawButtons();
  }

  private pickScript(): DialogScript | undefined {
    if (!this.stage) return undefined;
    if (this.payload.result === 'won') {
      if (this.stage.outro?.onWin) return this.stage.outro.onWin;
      return {
        lines: [
          {
            speaker: this.stage.characterId,
            mood: 'happy',
            text: CHARACTERS[this.stage.characterId].pt.victory,
          },
        ],
      };
    }
    if (this.stage.outro?.onLose) return this.stage.outro.onLose;
    return {
      lines: [
        {
          speaker: this.stage.characterId,
          mood: 'sad',
          text: CHARACTERS[this.stage.characterId].pt.defeat,
        },
      ],
    };
  }

  private async showLine(line: DialogLine): Promise<void> {
    if (!this.dialogBox || !this.portrait) return;
    this.setSpeaker(line.speaker);
    this.portrait.setMood(line.mood ?? 'neutral');
    await this.dialogBox.show(CHARACTERS[line.speaker].name, line.mood, line.text);
  }

  private setSpeaker(id: CharacterId): void {
    if (!this.portrait) return;
    if (this.portrait.characterId === id) return;
    const pos = { x: this.portrait.container.x, y: this.portrait.container.y };
    const size = this.portrait.size;
    this.portrait.destroy();
    this.portrait = new CharacterPortrait({
      scene: this,
      x: pos.x,
      y: pos.y,
      characterId: id,
      size,
    });
  }

  private firstSpeaker(): CharacterId | undefined {
    if (!this.stage) return undefined;
    const script = this.pickScriptStatic();
    return script?.lines[0]?.speaker ?? this.stage.characterId;
  }

  /**
   * Same as pickScript but safe to call before any state changes. Kept
   * separate so we can compute the initial portrait before playOutro runs.
   */
  private pickScriptStatic(): DialogScript | undefined {
    if (!this.stage) return undefined;
    if (this.payload.result === 'won') return this.stage.outro?.onWin;
    return this.stage.outro?.onLose;
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  private activateButton(): void {
    const b = this.buttons[this.cursor];
    if (!b || !this.stage) return;
    switch (b.action) {
      case 'retry':
        this.scene.start('StageIntroScene', { stageId: this.stage.id });
        break;
      case 'next': {
        const next = this.findNextStage();
        if (next) {
          this.scene.start('StageIntroScene', { stageId: next.id });
        } else {
          this.scene.start('AdventureStageSelectScene', { worldId: this.stage.worldId });
        }
        break;
      }
      case 'stages':
      case 'map':
      default:
        this.scene.start('AdventureStageSelectScene', { worldId: this.stage.worldId });
        break;
    }
  }

  private findNextStage(): StageDef | undefined {
    if (!this.stage) return undefined;
    // Look for the next stage in the same world. Cross-world chaining is
    // intentionally NOT auto-done — the player should see the world map.
    return getStageById(`w${this.stage.worldId}-s${this.stage.index + 1}`);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindKeyboard(): void {
    const move = (delta: number): void => {
      if (!this.dialogDone || this.buttons.length === 0) return;
      const count = this.buttons.length;
      this.cursor = (this.cursor + delta + count) % count;
      this.refreshButtonFocus();
    };
    const onDown = (e: KeyboardEvent): void => {
      // While dialog is playing, let DialogBox handle Enter/Space.
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (this.dialogDone) {
            e.preventDefault();
            move(-1);
          }
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (this.dialogDone) {
            e.preventDefault();
            move(1);
          }
          break;
        case 'Enter':
        case ' ':
          if (this.dialogDone) {
            e.preventDefault();
            this.activateButton();
          }
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          if (!this.stage) return;
          this.scene.start('AdventureStageSelectScene', {
            worldId: this.stage.worldId,
          });
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyListeners.push({ key: 'keydown', fn: onDown });
  }

  // ---------------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------------

  private fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private cleanup(): void {
    this.cancelled = true;
    this.keyListeners.forEach(({ key, fn }) => window.removeEventListener(key, fn));
    this.keyListeners = [];
    this.dialogBox?.destroy();
    this.dialogBox = null;
    this.portrait?.destroy();
    this.portrait = null;
    this.starsContainer?.destroy(true);
    this.starsContainer = null;
    this.summaryText?.destroy();
    this.summaryText = null;
    this.buttons.forEach((b) => b.container.destroy(true));
    this.buttons = [];
  }
}
