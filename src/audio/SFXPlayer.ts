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

  /** Quick blip when the player swaps two blocks. */
  swap(): void {
    if (this.volume <= 0) return;
    // A short, slightly bright pulse around C5.
    this.synth.playPulse(1, { freq: 523.25, durationMs: 35, velocity: 0.6 * this.volume }, 0.25);
  }

  /** Rising arpeggio when blocks clear. Pitch rises with combo size. */
  clear(comboSize: number): void {
    if (this.volume <= 0) return;
    const base = 60 + Math.min(24, Math.max(0, (comboSize - 3) * 2)); // MIDI 60..84
    const t0 = this.synth.now();
    const interval = 0.035;
    const steps = Math.min(6, Math.max(3, comboSize));
    for (let i = 0; i < steps; i++) {
      const m = base + i * 4; // major third stack
      this.synth.playPulse(
        0,
        { freq: midiToFreq(m), durationMs: 55, velocity: 0.55 * this.volume },
        0.5,
        t0 + i * interval
      );
    }
  }

  /** Triangle bell ping for chains; pitch climbs with chain count. */
  chain(n: number): void {
    if (this.volume <= 0) return;
    const m = 72 + Math.min(20, Math.max(0, (n - 1) * 3));
    const t0 = this.synth.now();
    this.synth.playTriangle(
      { freq: midiToFreq(m), durationMs: 220, velocity: 0.7 * this.volume },
      t0
    );
    // A higher partial right after for sparkle.
    this.synth.playPulse(
      1,
      { freq: midiToFreq(m + 12), durationMs: 90, velocity: 0.4 * this.volume },
      0.125,
      t0 + 0.01
    );
  }

  /** Descending pulse fall on game over. */
  gameOver(): void {
    if (this.volume <= 0) return;
    const t0 = this.synth.now();
    const pitches = [72, 70, 67, 65, 62, 60, 58, 55];
    for (let i = 0; i < pitches.length; i++) {
      this.synth.playPulse(
        0,
        { freq: midiToFreq(pitches[i]), durationMs: 90, velocity: 0.55 * this.volume },
        0.5,
        t0 + i * 0.08
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
