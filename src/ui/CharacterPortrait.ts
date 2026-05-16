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
import {
  CHARACTERS,
  type CharacterDef,
  type CharacterId,
  type Mood,
} from '@/data/characters';
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

    // Species-distinguishing features (ears, horns, tentacles…) drawn once
    // beneath the face layer so they're not redrawn on mood change.
    const features = scene.add.graphics();
    container.add(features);
    this.drawFeatures(features, def);

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

  // -------------------------------------------------------------------------
  // Internal: per-character species features
  // -------------------------------------------------------------------------

  private drawFeatures(g: Phaser.GameObjects.Graphics, def: CharacterDef): void {
    const s = this.size;
    const half = s / 2;
    const primary = def.primaryColor;
    const accent = def.accentColor;
    const ink = 0x1a0f1f;

    switch (this.characterId) {
      case 'pim': {
        // Two pointed fox ears on top, accent-coloured inner triangles.
        const earY = -half + 2;
        const earSpan = s * 0.18;
        const earH = s * 0.28;
        g.fillStyle(primary, 1);
        g.fillTriangle(-earSpan - 8, earY + earH, -earSpan + 8, earY + earH, -earSpan, earY);
        g.fillTriangle(earSpan - 8, earY + earH, earSpan + 8, earY + earH, earSpan, earY);
        g.fillStyle(accent, 1);
        g.fillTriangle(-earSpan - 4, earY + earH - 2, -earSpan + 4, earY + earH - 2, -earSpan, earY + 6);
        g.fillTriangle(earSpan - 4, earY + earH - 2, earSpan + 4, earY + earH - 2, earSpan, earY + 6);
        // Snout patch under the mouth.
        g.fillStyle(0xfff0e2, 1);
        g.fillRoundedRect(-s * 0.18, s * 0.1, s * 0.36, s * 0.22, 4);
        break;
      }
      case 'salla': {
        // Saw-tooth crest along the top, three peaks. Snout patch on the right.
        const crestY = -half - 2;
        g.fillStyle(accent, 1);
        g.fillTriangle(-s * 0.22, -half + 4, -s * 0.06, -half + 4, -s * 0.14, crestY - 4);
        g.fillTriangle(-s * 0.04, -half + 4, s * 0.12, -half + 4, s * 0.04, crestY - 6);
        g.fillTriangle(s * 0.14, -half + 4, s * 0.3, -half + 4, s * 0.22, crestY - 4);
        // Snout patch.
        g.fillStyle(0xffe9a8, 1);
        g.fillRoundedRect(-s * 0.2, s * 0.08, s * 0.4, s * 0.2, 5);
        // Forked tongue tip.
        g.fillStyle(0xff5577, 1);
        g.fillRect(s * 0.18, s * 0.22, s * 0.1, 2);
        break;
      }
      case 'boreal': {
        // Curved goat horns + thin chin beard.
        g.lineStyle(3, accent, 1);
        g.beginPath();
        g.arc(-s * 0.22, -half + 8, s * 0.18, Math.PI * 0.1, Math.PI * 0.9, true);
        g.strokePath();
        g.beginPath();
        g.arc(s * 0.22, -half + 8, s * 0.18, Math.PI * 0.1, Math.PI * 0.9, true);
        g.strokePath();
        // Snowy beard.
        g.fillStyle(0xe8f4ff, 1);
        g.fillTriangle(-s * 0.06, s * 0.22, s * 0.06, s * 0.22, 0, s * 0.42);
        break;
      }
      case 'murena': {
        // Five tentacles dangling below the head area.
        g.fillStyle(primary, 1);
        const baseY = s * 0.28;
        const tx = [-s * 0.32, -s * 0.16, 0, s * 0.16, s * 0.32];
        for (const x of tx) {
          g.fillRoundedRect(x - 4, baseY, 8, s * 0.22, { tl: 0, tr: 0, bl: 4, br: 4 });
        }
        // Round glasses on top of the eyes layer (drawn here as colored rings;
        // the eye dots in drawFace render inside them).
        g.lineStyle(2, ink, 1);
        const eyeY = -s * 0.08;
        g.strokeCircle(-s * 0.18, eyeY, 9);
        g.strokeCircle(s * 0.18, eyeY, 9);
        g.lineBetween(-s * 0.09, eyeY, s * 0.09, eyeY);
        break;
      }
      case 'brasa': {
        // Two small dragon horns on top, scaled belly patch, and a tiny flame
        // licking out of the side of the mouth.
        g.fillStyle(accent, 1);
        g.fillTriangle(-s * 0.2, -half + 2, -s * 0.1, -half + 2, -s * 0.15, -half - 10);
        g.fillTriangle(s * 0.1, -half + 2, s * 0.2, -half + 2, s * 0.15, -half - 10);
        // Belly scale band — three darker stripes.
        g.fillStyle(darken(primary, 0.25), 1);
        for (let i = 0; i < 3; i++) {
          g.fillRect(-s * 0.24, s * 0.25 + i * 5, s * 0.48, 2);
        }
        // Flame.
        g.fillStyle(0xffaa33, 1);
        g.fillTriangle(s * 0.28, s * 0.06, s * 0.4, s * 0.16, s * 0.3, s * 0.2);
        g.fillStyle(0xffe85c, 1);
        g.fillTriangle(s * 0.3, s * 0.1, s * 0.36, s * 0.16, s * 0.32, s * 0.18);
        break;
      }
      case 'aura': {
        // Pointy fairy ears, two antenna-tips, four little sparkles.
        g.fillStyle(primary, 1);
        g.fillTriangle(-half + 4, -s * 0.1, -half + 4, s * 0.05, -half - 6, -s * 0.02);
        g.fillTriangle(half - 4, -s * 0.1, half - 4, s * 0.05, half + 6, -s * 0.02);
        // Antennae with bulbs.
        g.lineStyle(2, accent, 1);
        g.lineBetween(-s * 0.08, -half + 6, -s * 0.12, -half - 8);
        g.lineBetween(s * 0.08, -half + 6, s * 0.12, -half - 8);
        g.fillStyle(0xffe9a8, 1);
        g.fillCircle(-s * 0.12, -half - 10, 3);
        g.fillCircle(s * 0.12, -half - 10, 3);
        // Sparkles around the head.
        g.fillStyle(0xffffff, 1);
        const sparkles: Array<[number, number]> = [
          [-half - 8, -s * 0.25],
          [half + 8, -s * 0.18],
          [-half - 4, s * 0.12],
          [half + 4, s * 0.06],
        ];
        for (const [x, y] of sparkles) {
          g.fillRect(x - 1, y, 3, 1);
          g.fillRect(x, y - 1, 1, 3);
        }
        break;
      }
    }
  }
}
