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
 *   3. Show a big star tally that animates the earned stars in one at a time
 *      (300ms apart) so the player feels the reveal.
 *   4. Offer "Tentar de novo" / "Voltar ao mapa" buttons on loss, or
 *      "Próxima fase" / "Voltar às fases" on win.
 *
 * Visuals: vertical-gradient backdrop tinted by the speaker's primaryColor,
 * portrait set to 'happy' on win or 'sad' on loss, and filled-rectangle
 * action buttons with strokes.
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

// Local hex helper, see StageIntroScene for the same note. The repo also
// exports `darken` from `src/config.ts`.
function darkenHex(hex: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.floor(((hex >> 16) & 0xff) * f);
  const g = Math.floor(((hex >> 8) & 0xff) * f);
  const b = Math.floor((hex & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

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

const FOCUS_STROKE = 0xffeecc;
const UNFOCUS_STROKE = 0x886a4c;
const FOCUS_FILL = 0x4d2c66;
const UNFOCUS_FILL = 0x2a1738;

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
  private bannerText: Phaser.GameObjects.Text | null = null;
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

    this.drawBackdrop();
    this.drawScreen();
    this.bindKeyboard();

    void this.playOutro();

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Backdrop
  // ---------------------------------------------------------------------------

  /**
   * Cinematic gradient backdrop tinted by the speaker's primaryColor at the
   * bottom, darkening to near-black at the top. Drawn once at depth -1000.
   */
  private drawBackdrop(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const speakerId = this.firstSpeaker() ?? this.stage.characterId;
    const base = CHARACTERS[speakerId].primaryColor;

    // Loss skews darker (palette feels somber); win lets the primary color
    // breathe more at the bottom.
    const topF = this.payload.result === 'won' ? 0.07 : 0.05;
    const botF = this.payload.result === 'won' ? 0.72 : 0.42;

    const stops: number[] = [];
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const factor = topF + t * (botF - topF);
      stops.push(darkenHex(base, factor));
    }

    const g = this.add.graphics();
    const stripeH = Math.ceil(h / N);
    for (let i = 0; i < N; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    g.fillStyle(0x000000, 0.4);
    g.fillRect(0, 0, w, 28);
    g.fillRect(0, h - 28, w, 28);
    g.setDepth(-1000);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private drawScreen(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const portrait = h > w;

    // Banner.
    const won = this.payload.result === 'won';
    const banner = won ? 'Vitória!' : 'Quase!';
    this.bannerText = this.add
      .text(w / 2, 22, banner, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: won ? '#ffe' : '#fbb',
        fontStyle: 'bold',
        stroke: '#1a0a22',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Summary line.
    this.summaryText = this.add
      .text(
        w / 2,
        48,
        `Score ${this.payload.score}  •  ${this.fmt(this.payload.timeMs)}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#dde',
        },
      )
      .setOrigin(0.5);

    const speakerId = this.firstSpeaker() ?? this.stage.characterId;
    const portraitSize = portrait ? 120 : 160;
    const portraitX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.22) + Math.floor(portraitSize / 2);
    const portraitY = portrait ? Math.floor(h * 0.34) : Math.floor(h * 0.55);

    this.portrait = new CharacterPortrait({
      scene: this,
      x: -portraitSize,
      y: portraitY,
      characterId: speakerId,
      size: portraitSize,
      showLabel: false,
    });
    // Mood follows result.
    this.portrait.setMood(won ? 'happy' : 'sad');
    this.tweens.add({
      targets: this.portrait.container,
      x: portraitX,
      duration: 320,
      ease: 'Cubic.easeOut',
    });

    // Big stars row above the portrait. Reveal them staggered, 300ms apart.
    this.drawStars(w, portrait, portraitY, portraitSize);

    // Dialog box at the bottom 1/3.
    const dialogW = portrait ? w - 24 : Math.floor(w * 0.5);
    const dialogH = portrait ? Math.floor(h * 0.24) : Math.floor(h * 0.4);
    const dialogX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.7);
    const dialogY = portrait
      ? h - Math.floor(dialogH / 2) - 80
      : h - Math.floor(dialogH / 2) - 80;
    this.dialogBox = new DialogBox({
      scene: this,
      x: dialogX,
      y: dialogY,
      width: dialogW,
      height: dialogH,
    });
  }

  private drawStars(
    w: number,
    isPortraitOrient: boolean,
    portraitY: number,
    portraitSize: number,
  ): void {
    // Large stars (~36px) above the portrait, centered on screen so they read
    // as a reveal moment.
    const starSize = 38;
    const starSpacing = isPortraitOrient ? 50 : 60;
    const cy = isPortraitOrient
      ? Math.max(86, portraitY - Math.floor(portraitSize / 2) - 32)
      : 92;
    const cx = w / 2;
    this.starsContainer = this.add.container(cx, cy);

    for (let i = 0; i < 3; i++) {
      const filled = i < this.payload.stars;
      const star = this.add
        .text((i - 1) * starSpacing, 0, filled ? '★' : '☆', {
          fontFamily: 'monospace',
          fontSize: `${starSize}px`,
          color: filled ? '#ffe35a' : '#555',
          stroke: '#1a0a22',
          strokeThickness: 4,
        })
        .setOrigin(0.5);

      if (filled) {
        // Start invisible+small, then pop in 300ms apart. Cubic.easeOut feels
        // satisfying for the reveal.
        star.setAlpha(0).setScale(0.2);
        this.tweens.add({
          targets: star,
          alpha: 1,
          scale: 1,
          duration: 280,
          delay: 400 + i * 300,
          ease: 'Back.easeOut',
        });
      } else {
        // Grey, still drawn but at full alpha and no pop.
        star.setAlpha(0.7);
      }
      this.starsContainer.add(star);
    }
  }

  private drawButtons(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const btnY = h - 34;
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

    const btnW = 140;
    const btnH = 32;
    const gap = 12;
    const totalW = specs.length * btnW + (specs.length - 1) * gap;
    const startX = Math.floor((w - totalW) / 2) + btnW / 2;

    specs.forEach((spec, idx) => {
      const cx = startX + idx * (btnW + gap);
      const container = this.add.container(cx, btnY);
      const bg = this.add
        .rectangle(0, 0, btnW, btnH, UNFOCUS_FILL, 0.96)
        .setStrokeStyle(2, UNFOCUS_STROKE);
      const label = this.add
        .text(0, 0, spec.label, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffe',
          fontStyle: 'bold',
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

      // Fade in so the buttons appear after dialog finishes.
      container.setAlpha(0);
      this.tweens.add({
        targets: container,
        alpha: 1,
        duration: 240,
        delay: idx * 80,
        ease: 'Quad.easeOut',
      });

      this.buttons.push({ container, bg, label, action: spec.action });
    });

    this.refreshButtonFocus();
  }

  private refreshButtonFocus(): void {
    this.buttons.forEach((b, idx) => {
      const focused = idx === this.cursor;
      b.bg.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_STROKE : UNFOCUS_STROKE, 1);
      b.bg.setFillStyle(focused ? FOCUS_FILL : UNFOCUS_FILL, 0.96);
      b.container.setScale(focused ? 1.05 : 1);
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
    // The line's explicit mood overrides the result-mood for narrative beats.
    const fallback = this.payload.result === 'won' ? 'happy' : 'sad';
    this.portrait.setMood(line.mood ?? fallback);
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
      showLabel: false,
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
    this.bannerText?.destroy();
    this.bannerText = null;
    this.buttons.forEach((b) => b.container.destroy(true));
    this.buttons = [];
  }
}
