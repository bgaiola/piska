/**
 * SFXPlayer — short chiptune sound effects, consistent with the BGM.
 *
 * Shares the same ChiptuneSynth as BGMPlayer (via getSharedSynth), so the
 * master volume covers both. The SFXPlayer maintains its own *relative*
 * SFX volume scaling, persisted in localStorage('piska.sfxVolume').
 *
 * Because we share the master, the SFX volume is applied per-note via the
 * 'velocity' field of the NoteOn struct. That way music keeps playing at
 * its own master level while SFX can be independently turned down.
 */

import { getSharedSynth } from './synthSingleton';
import type { ChiptuneSynth } from './ChiptuneSynth';

const STORAGE_KEY = 'piska.sfxVolume';
const DEFAULT_VOLUME = 0.8;

function readStoredVolume(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeStoredVolume(v: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    // Ignore (private mode, etc).
  }
}

/** Convert MIDI note number to frequency. Handy for arpeggio SFX. */
function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class SFXPlayer {
  private static instance: SFXPlayer | null = null;

  static get(): SFXPlayer {
    if (!SFXPlayer.instance) {
      SFXPlayer.instance = new SFXPlayer();
    }
    return SFXPlayer.instance;
  }

  private synth: ChiptuneSynth;
  private volume: number;

  private constructor() {
    this.synth = getSharedSynth();
    this.volume = readStoredVolume();
  }

  /** Quick blip when the player swaps two blocks. A clean, very short tick. */
  swap(): void {
    if (this.volume <= 0) return;
    // Single ultra-short pulse around C5 with a narrow duty for a "tick"
    // character. Total audible time stays well under 80 ms (duration + the
    // synth's ~35 ms release tail).
    this.synth.playPulse(
      1,
      { freq: 523.25, durationMs: 18, velocity: 0.55 * this.volume },
      0.125
    );
  }

  /**
   * Rising arpeggio when blocks clear. Both the number of notes and the
   * semitone step between notes scale with comboSize:
   *
   *   combo 3 → 2 notes, +3 semitone step (quick flick)
   *   combo 4 → 3 notes, +4 semitone step
   *   combo 5 → 4 notes, +5 semitone step
   *   combo 6 → 5 notes, +6 semitone step
   *   combo 7+ → 6 notes (capped), +7 semitone step (capped)
   *
   * The base pitch creeps up slightly with combo size too so larger combos
   * feel both denser and higher overall.
   */
  clear(comboSize: number): void {
    if (this.volume <= 0) return;
    const safeCombo = Math.max(3, comboSize);
    // Note count: combo 3 = 2, combo 4 = 3, ... capped at 6 notes.
    const noteCount = Math.min(6, safeCombo - 1);
    // Step size in semitones grows with the combo, capped at 7.
    const step = Math.min(7, safeCombo);
    // Base pitch nudges up a little for big combos, capped so we don't get
    // ear-piercing harmonics.
    const base = 60 + Math.min(12, (safeCombo - 3) * 2); // MIDI 60..72
    const t0 = this.synth.now();
    const interval = 0.032;
    for (let i = 0; i < noteCount; i++) {
      const m = base + i * step;
      // Velocity tapers down slightly across the climb so the first note
      // anchors the rhythm without the top of the run feeling shouty.
      const v = (0.6 - i * 0.04) * this.volume;
      this.synth.playPulse(
        0,
        { freq: midiToFreq(m), durationMs: 50, velocity: Math.max(0.15, v) },
        0.5,
        t0 + i * interval
      );
    }
  }

  /**
   * Triangle "bell" with vibrato + pitch slide for chains.
   *
   * The chain spans `min(n, 6)` notes climbing a total of `n * 3` semitones.
   * Each note slides up from a perfect-fourth below into its target pitch
   * and carries a soft vibrato, which makes longer chains feel like an
   * accelerating siren bell.
   */
  chain(n: number): void {
    if (this.volume <= 0) return;
    const safeN = Math.max(1, n);
    const noteCount = Math.min(6, safeN);
    const totalSemitones = safeN * 3;
    // Span the climb across (noteCount - 1) intervals; single-note chains
    // just play the root.
    const stepSemitones = noteCount > 1 ? totalSemitones / (noteCount - 1) : 0;
    const root = 67; // G4 — warm starting point for the triangle voice.
    const t0 = this.synth.now();
    const interval = 0.085;
    for (let i = 0; i < noteCount; i++) {
      const targetMidi = root + i * stepSemitones;
      const targetFreq = midiToFreq(targetMidi);
      // Slide into each note from a perfect fourth below (5 semitones).
      const slideFromFreq = midiToFreq(targetMidi - 5);
      this.synth.playTriangle(
        {
          freq: targetFreq,
          slideFromFreq,
          slideMs: 55,
          durationMs: 180,
          velocity: 0.7 * this.volume,
          vibratoCents: 22,
          vibratoRateHz: 6.5,
        },
        t0 + i * interval
      );
      // A faint pulse octave-up adds sparkle on each bell strike.
      this.synth.playPulse(
        1,
        {
          freq: midiToFreq(targetMidi + 12),
          durationMs: 60,
          velocity: 0.28 * this.volume,
        },
        0.125,
        t0 + i * interval + 0.012
      );
    }
  }

  /**
   * Descending three-note tail on game over — a small minor cadence so
   * failing has a recognizable sad shape (B4 → A4 → F#4).
   */
  gameOver(): void {
    if (this.volume <= 0) return;
    const t0 = this.synth.now();
    // MIDI: 71 = B4, 69 = A4, 66 = F#4.
    const pitches = [71, 69, 66];
    const interval = 0.18;
    for (let i = 0; i < pitches.length; i++) {
      // Slight velocity droop so the final note feels resigned.
      const v = (0.65 - i * 0.08) * this.volume;
      this.synth.playTriangle(
        {
          freq: midiToFreq(pitches[i]),
          durationMs: 220,
          velocity: Math.max(0.2, v),
        },
        t0 + i * interval
      );
      // Pulse doubles the melody softly underneath for body.
      this.synth.playPulse(
        0,
        {
          freq: midiToFreq(pitches[i]),
          durationMs: 200,
          velocity: Math.max(0.15, v * 0.55),
        },
        0.5,
        t0 + i * interval
      );
    }
  }

  /** Tiny click when the cursor moves. */
  cursorMove(): void {
    if (this.volume <= 0) return;
    this.synth.playPulse(1, { freq: 880, durationMs: 18, velocity: 0.25 * this.volume }, 0.125);
  }

  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.volume = clamped;
    writeStoredVolume(clamped);
  }

  getVolume(): number {
    return this.volume;
  }
}
