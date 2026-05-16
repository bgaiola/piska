/**
 * StageIntroScene — plays the intro DialogScript before a stage starts.
 *
 * Renders the speaker's portrait + a dialog box. Each line is typed out;
 * tap / Enter / Space advances. When the script ends, the scene transitions
 * to GameScene (or VsScene for vs-ai stages) with the stage's modeParams +
 * the adventureStageId so the result flow knows to return to the outro.
 *
 * Stages with no intro skip straight into the game.
 *
 * Visuals: cinematic vertical-gradient backdrop tinted by the stage
 * character's primaryColor (bottom stop), darkening toward the top. Big
 * portrait enters from off-screen with a smooth tween. Name banner with the
 * character name (bold) and species (smaller) sits beside/above the portrait.
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

// Local helper: returns a darker variant of a hex int. Duplicated here to keep
// the file self-contained per the task's "hard-code locally" guidance.
// Cross-file note: `src/config.ts` exports the same helper as `darken`.
function darkenHex(hex: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.floor(((hex >> 16) & 0xff) * f);
  const g = Math.floor(((hex >> 8) & 0xff) * f);
  const b = Math.floor((hex & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

export class StageIntroScene extends Phaser.Scene {
  private stageId = '';
  private stage: StageDef | undefined;
  private portrait: CharacterPortrait | null = null;
  private dialogBox: DialogBox | null = null;
  private skipButton: Phaser.GameObjects.Text | null = null;
  private nameBanner: Phaser.GameObjects.Container | null = null;
  private cancelled = false;
  private portraitTargetX = 0;
  private portraitY = 0;
  private portraitSize = 0;
  private isPortraitOrientation = false;
  private keyListeners: Array<{ key: 'keydown'; fn: (e: KeyboardEvent) => void }> = [];

  constructor() {
    super('StageIntroScene');
  }

  init(data: { stageId: string }): void {
    this.stageId = data?.stageId ?? '';
    this.stage = getStageById(this.stageId);
    this.cancelled = false;
  }

  create(): void {
    if (!this.stage) {
      this.scene.start('AdventureMapScene');
      return;
    }

    BGMPlayer.get().play(WORLDS[this.stage.worldId].trackId);
    this.cameras.main.setBackgroundColor('#0c0418');

    this.drawBackdrop();
    this.drawScreen();
    this.bindEscape();

    const script = this.stage.intro;
    if (!script || script.lines.length === 0) {
      this.launchGame();
      return;
    }

    void this.playScript(script).then(() => {
      if (this.cancelled) return;
      this.launchGame();
    });

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
  }

  // ---------------------------------------------------------------------------
  // Backdrop
  // ---------------------------------------------------------------------------

  /**
   * Paints a 12-stripe vertical gradient tinted toward the speaker's
   * primaryColor at the bottom, darkening to near-black at the top. A soft
   * top + bottom vignette mirrors VsScene.drawBackdrop. Drawn once.
   */
  private drawBackdrop(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const speakerId = this.stage.intro?.lines[0]?.speaker ?? this.stage.characterId;
    const base = CHARACTERS[speakerId].primaryColor;

    const stops: number[] = [];
    const N = 12;
    for (let i = 0; i < N; i++) {
      // i=0 = top (darkest), i=N-1 = bottom (full primaryColor blend).
      // Curve picks up from ~6% intensity at the top to ~70% at the bottom so
      // the dialog box and portrait still pop against it.
      const t = i / (N - 1);
      const factor = 0.06 + t * 0.64;
      stops.push(darkenHex(base, factor));
    }

    const g = this.add.graphics();
    const stripeH = Math.ceil(h / N);
    for (let i = 0; i < N; i++) {
      g.fillStyle(stops[i], 1);
      g.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    // Soft top + bottom vignette to focus the eye.
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
    const portrait = h > w; // portrait orientation
    this.isPortraitOrientation = portrait;

    // Stage banner up top.
    this.add
      .text(
        w / 2,
        20,
        `Mundo ${this.stage.worldId} — Fase ${this.stage.index}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffe',
        },
      )
      .setOrigin(0.5);

    const speakerId = this.stage.intro?.lines[0]?.speaker ?? this.stage.characterId;

    // Big portrait: ~160px desktop, ~120px portrait mobile.
    const portraitSize = portrait ? 120 : 160;
    this.portraitSize = portraitSize;

    // Position: left side in landscape, upper-center in portrait. We tween
    // from off-screen-left into place.
    const targetX = portrait
      ? Math.floor(w / 2)
      : Math.floor(w * 0.22) + Math.floor(portraitSize / 2);
    const portraitY = portrait
      ? Math.floor(h * 0.34)
      : Math.floor(h * 0.52);
    this.portraitTargetX = targetX;
    this.portraitY = portraitY;

    const startX = -portraitSize; // off-screen on the left
    this.portrait = new CharacterPortrait({
      scene: this,
      x: startX,
      y: portraitY,
      characterId: speakerId,
      size: portraitSize,
      showLabel: false, // we render our own bigger name banner
    });
    this.tweens.add({
      targets: this.portrait.container,
      x: targetX,
      duration: 320,
      ease: 'Cubic.easeOut',
    });

    // Name banner: name (24-32px bold) + species (12-14px) below.
    this.nameBanner = this.buildNameBanner(speakerId, portrait, w, h, portraitY, portraitSize);

    // Dialog box bottom-anchored 1/3 of screen.
    const dialogW = portrait ? w - 24 : Math.floor(w * 0.5);
    const dialogH = portrait ? Math.floor(h * 0.28) : Math.floor(h * 0.42);
    const dialogX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.7);
    const dialogY = portrait
      ? h - Math.floor(dialogH / 2) - 24
      : h - Math.floor(dialogH / 2) - 28;
    this.dialogBox = new DialogBox({
      scene: this,
      x: dialogX,
      y: dialogY,
      width: dialogW,
      height: dialogH,
    });

    // Skip hint in corner.
    this.skipButton = this.add
      .text(w - 8, h - 8, 'Esc para pular', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#bbb',
      })
      .setOrigin(1, 1);
  }

  private buildNameBanner(
    speakerId: CharacterId,
    portrait: boolean,
    w: number,
    _h: number,
    portraitY: number,
    portraitSize: number,
  ): Phaser.GameObjects.Container {
    const def = CHARACTERS[speakerId];

    // In landscape, banner sits to the right of the portrait. In portrait
    // orientation, it sits above the portrait.
    const cx = portrait
      ? Math.floor(w / 2)
      : Math.floor(w * 0.22) + portraitSize + 18;
    const cy = portrait
      ? portraitY - Math.floor(portraitSize / 2) - 30
      : portraitY - 14;

    const container = this.add.container(cx, cy);
    const nameSize = portrait ? 24 : 30;
    const speciesSize = portrait ? 12 : 14;

    const nameText = this.add
      .text(0, 0, def.name, {
        fontFamily: 'monospace',
        fontSize: `${nameSize}px`,
        color: '#ffe',
        fontStyle: 'bold',
        stroke: '#1a0a22',
        strokeThickness: 4,
      })
      .setOrigin(portrait ? 0.5 : 0, 0.5);

    const speciesText = this.add
      .text(0, nameSize, def.species, {
        fontFamily: 'monospace',
        fontSize: `${speciesSize}px`,
        color: '#ffd9a0',
        stroke: '#1a0a22',
        strokeThickness: 3,
      })
      .setOrigin(portrait ? 0.5 : 0, 0.5);

    container.add([nameText, speciesText]);
    // Fade in alongside the portrait slide so they feel coupled.
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 320,
      delay: 160,
      ease: 'Quad.easeOut',
    });
    return container;
  }

  // ---------------------------------------------------------------------------
  // Script playback
  // ---------------------------------------------------------------------------

  private async playScript(script: DialogScript): Promise<void> {
    for (const line of script.lines) {
      if (this.cancelled) return;
      await this.showLine(line);
    }
  }

  private async showLine(line: DialogLine): Promise<void> {
    if (!this.dialogBox || !this.portrait) return;
    this.setSpeaker(line.speaker);
    this.portrait.setMood(line.mood ?? 'neutral');
    const name = CHARACTERS[line.speaker].name;
    await this.dialogBox.show(name, line.mood, line.text);
  }

  private setSpeaker(id: CharacterId): void {
    if (!this.portrait) return;
    if (this.portrait.characterId === id) return;
    // Rebuild the portrait so the tint and features match the new speaker,
    // and refresh the banner with that speaker's name/species. We snap the
    // new portrait into the existing target position (no slide-in re-tween
    // mid-dialog — that'd be distracting).
    this.portrait.destroy();
    this.portrait = new CharacterPortrait({
      scene: this,
      x: this.portraitTargetX,
      y: this.portraitY,
      characterId: id,
      size: this.portraitSize,
      showLabel: false,
    });

    // Rebuild banner so name + species reflect the new speaker.
    this.nameBanner?.destroy(true);
    this.nameBanner = this.buildNameBanner(
      id,
      this.isPortraitOrientation,
      this.scale.gameSize.width,
      this.scale.gameSize.height,
      this.portraitY,
      this.portraitSize,
    );
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  private launchGame(): void {
    if (!this.stage) {
      this.scene.start('AdventureMapScene');
      return;
    }
    const s = this.stage;
    const targetKey = s.mode === 'vs-ai' ? 'VsScene' : 'GameScene';
    if (s.mode === 'vs-ai') {
      this.scene.start(targetKey, {
        difficulty: s.modeParams.vsAiDifficulty ?? 'medium',
        adventureStageId: s.id,
      });
    } else {
      this.scene.start(targetKey, {
        mode: s.mode,
        timeLimitMs: s.modeParams.timeLimitMs,
        movesAllowed: s.modeParams.movesAllowed,
        initialStackHeight:
          s.modeParams.initialStackHeight ?? s.difficulty.initialStackHeight,
        targetLine: s.modeParams.targetLine,
        numColors: s.difficulty.numColors,
        baseRiseSpeed: s.difficulty.baseRiseSpeed,
        rngSeed: s.difficulty.rngSeed,
        adventureStageId: s.id,
      });
    }
  }

  private bindEscape(): void {
    const onDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        this.cancelled = true;
        // Move on to gameplay immediately.
        this.launchGame();
      }
    };
    window.addEventListener('keydown', onDown);
    this.keyListeners.push({ key: 'keydown', fn: onDown });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private cleanup(): void {
    this.cancelled = true;
    this.keyListeners.forEach(({ key, fn }) => window.removeEventListener(key, fn));
    this.keyListeners = [];
    this.dialogBox?.destroy();
    this.dialogBox = null;
    this.portrait?.destroy();
    this.portrait = null;
    this.skipButton?.destroy();
    this.skipButton = null;
    this.nameBanner?.destroy(true);
    this.nameBanner = null;
  }
}
