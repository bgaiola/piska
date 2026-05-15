/**
 * CharacterPortrait — procedural placeholder portrait used until real
 * sprite art is shipped. Draws a tinted rounded square with a simplified
 * pixel-art face (eyes + mouth) and the character's name above.
 *
 * Moods animate the face cheaply:
 *   - neutral: dot eyes, flat mouth.
 *   - happy: dot eyes, arc-up mouth.
 *   - surprised: round wide eyes, small "O" mouth.
 *   - sad: dot eyes, arc-down mouth.
 *
 * All drawing uses Phaser primitives (graphics + text) so we don't need any
 * asset preload. The portrait owns a single Container, so callers just call
 * `destroy()` on cleanup.
 */

import Phaser from 'phaser';
import { CHARACTERS, type CharacterId, type Mood } from '@/data/characters';
import { darken } from '@/config';

export interface CharacterPortraitOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  characterId: CharacterId;
  size?: number;
  /** When true (default), draws the character name label above the box. */
  showLabel?: boolean;
}

export class CharacterPortrait {
  readonly container: Phaser.GameObjects.Container;
  readonly size: number;
  readonly characterId: CharacterId;
  private readonly faceGfx: Phaser.GameObjects.Graphics;
  private readonly nameLabel: Phaser.GameObjects.Text | null;
  private mood: Mood = 'neutral';

  constructor(opts: CharacterPortraitOptions) {
    const { scene, x, y, characterId, size = 96, showLabel = true } = opts;
    this.size = size;
    this.characterId = characterId;

    const def = CHARACTERS[characterId];
    const container = scene.add.container(x, y);
    this.container = container;

    // Outline + fill rectangle for the portrait body.
    const outline = scene.add
      .rectangle(0, 0, size + 4, size + 4, darken(def.primaryColor, 0.4))
      .setStrokeStyle(2, 0x1a0f1f);
    const fill = scene.add
      .rectangle(0, 0, size, size, def.primaryColor)
      .setStrokeStyle(2, darken(def.primaryColor, 0.55));
    container.add([outline, fill]);

    // A soft cheek dab so the face reads as alive even when neutral.
    const cheekY = Math.floor(size * 0.15);
    const cheekR = Math.max(3, Math.floor(size * 0.06));
    const cheekL = scene.add
      .circle(-Math.floor(size * 0.22), cheekY, cheekR, def.accentColor, 0.55);
    const cheekR2 = scene.add
      .circle(Math.floor(size * 0.22), cheekY, cheekR, def.accentColor, 0.55);
    container.add([cheekL, cheekR2]);

    // Face graphics (eyes + mouth) — redrawn whenever mood changes.
    this.faceGfx = scene.add.graphics();
    container.add(this.faceGfx);
    this.drawFace();

    if (showLabel) {
      this.nameLabel = scene.add
        .text(0, -Math.floor(size / 2) - 14, def.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffe',
        })
        .setOrigin(0.5);
      container.add(this.nameLabel);
    } else {
      this.nameLabel = null;
    }
  }

  setMood(mood: Mood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    this.drawFace();
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  // -------------------------------------------------------------------------
  // Internal: face rendering
  // -------------------------------------------------------------------------

  private drawFace(): void {
    const g = this.faceGfx;
    g.clear();
    const def = CHARACTERS[this.characterId];
    const inkDark = 0x1a0f1f;
    const ink = inkDark;
    const eyeY = -Math.floor(this.size * 0.08);
    const eyeOffset = Math.floor(this.size * 0.18);
    const mouthY = Math.floor(this.size * 0.18);
    const mouthW = Math.floor(this.size * 0.32);

    // Eyes
    if (this.mood === 'surprised') {
      g.lineStyle(2, ink, 1);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-eyeOffset, eyeY, 6);
      g.fillCircle(eyeOffset, eyeY, 6);
      g.strokeCircle(-eyeOffset, eyeY, 6);
      g.strokeCircle(eyeOffset, eyeY, 6);
      g.fillStyle(ink, 1);
      g.fillCircle(-eyeOffset, eyeY, 2);
      g.fillCircle(eyeOffset, eyeY, 2);
    } else {
      g.fillStyle(ink, 1);
      g.fillCircle(-eyeOffset, eyeY, 3);
      g.fillCircle(eyeOffset, eyeY, 3);
    }

    // Mouth
    g.lineStyle(2, ink, 1);
    switch (this.mood) {
      case 'happy': {
        // Arc up (smile). Phaser's arc draws from startAngle to endAngle.
        g.beginPath();
        g.arc(0, mouthY - 2, mouthW / 2, 0, Math.PI, false);
        g.strokePath();
        break;
      }
      case 'sad': {
        // Arc down (frown).
        g.beginPath();
        g.arc(0, mouthY + 4, mouthW / 2, Math.PI, 2 * Math.PI, false);
        g.strokePath();
        break;
      }
      case 'surprised': {
        // Small "O".
        g.fillStyle(ink, 1);
        g.fillCircle(0, mouthY, 4);
        break;
      }
      case 'neutral':
      default: {
        // Flat line.
        g.lineStyle(2, ink, 1);
        g.lineBetween(-mouthW / 2, mouthY, mouthW / 2, mouthY);
        break;
      }
    }

    // Tiny accent: a colored notch on the side to hint character identity.
    g.fillStyle(def.accentColor, 1);
    g.fillRect(
      -Math.floor(this.size / 2) + 4,
      Math.floor(this.size / 2) - 10,
      6,
      6,
    );
  }
}
