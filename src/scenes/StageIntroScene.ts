/**
 * StageIntroScene — plays the intro DialogScript before a stage starts.
 *
 * Renders the speaker's portrait + a dialog box. Each line is typed out;
 * tap / Enter / Space advances. When the script ends, the scene transitions
 * to GameScene (or VsScene for vs-ai stages) with the stage's modeParams +
 * the adventureStageId so the result flow knows to return to the outro.
 *
 * Stages with no intro skip straight into the game.
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

export class StageIntroScene extends Phaser.Scene {
  private stageId = '';
  private stage: StageDef | undefined;
  private portrait: CharacterPortrait | null = null;
  private dialogBox: DialogBox | null = null;
  private skipButton: Phaser.GameObjects.Text | null = null;
  private cancelled = false;
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
  // Drawing
  // ---------------------------------------------------------------------------

  private drawScreen(): void {
    if (!this.stage) return;
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    const portrait = h > w; // portrait orientation

    // Background tint shifts toward the world's theme color.
    const wdef = WORLDS[this.stage.worldId];
    this.add
      .rectangle(0, 0, w, h, wdef.themeColor, 0.08)
      .setOrigin(0, 0);

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
    const portraitSize = portrait ? 110 : 130;
    const portraitX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.28);
    const portraitY = portrait
      ? Math.floor(h * 0.32)
      : Math.floor(h / 2);

    this.portrait = new CharacterPortrait({
      scene: this,
      x: portraitX,
      y: portraitY,
      characterId: speakerId,
      size: portraitSize,
    });

    // Dialog box bottom-anchored in portrait, right-half in landscape.
    const dialogW = portrait ? w - 24 : Math.floor(w * 0.5);
    const dialogH = portrait ? Math.floor(h * 0.28) : Math.floor(h * 0.5);
    const dialogX = portrait ? Math.floor(w / 2) : Math.floor(w * 0.7);
    const dialogY = portrait
      ? h - Math.floor(dialogH / 2) - 32
      : Math.floor(h / 2);
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
    // Rebuild the portrait so the tint and name match the new speaker.
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
  }
}
