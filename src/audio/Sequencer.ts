/**
 * Sequencer — interprets a Track and schedules notes against a ChiptuneSynth.
 *
 * Uses a look-ahead scheduler: every ~25ms we check each part's cursor and
 * queue any events that fall within the next ~200ms. This keeps timing tight
 * even when JS execution gets jittery (GC, frame drops, etc).
 *
 * Each part has its own beat cursor because parts can have wildly different
 * rhythmic densities (a noise pattern is 16 steps; a melody is N notes of
 * varying length). When a part's cursor reaches the loop length, it wraps
 * and increments a per-part loop counter so absolute time keeps advancing.
 */

import type { ChiptuneSynth, PulseDuty } from './ChiptuneSynth';

export type Pitch = string | 'rest';

export interface PulseNote {
  pitch: Pitch;
  /** Note length in beats. 1 = quarter note, 0.5 = eighth, 0.25 = sixteenth. */
  lengthBeats: number;
  /** Optional per-note velocity override (0..1). */
  velocity?: number;
}

export interface PulsePart {
  channel: 0 | 1;
  duty: PulseDuty;
  notes: PulseNote[];
}

export interface TriPart {
  notes: PulseNote[];
}

export interface NoisePart {
  /**
   * Pattern as a string. Each character is one step. '-' = rest,
   * 'k' = kick, 's' = snare, 'h' = hat. Example: 'k-h-s-h-k-h-s-h'.
   */
  pattern: string;
  /** Steps per beat. 4 = sixteenths, 2 = eighths. */
  stepsPerBeat: number;
}

export interface Track {
  id: string;
  name: string;
  bpm: number;
  /** Total length of the loop in beats. */
  beatsPerLoop: number;
  pulse1: PulsePart;
  pulse2?: PulsePart;
  triangle?: TriPart;
  noise?: NoisePart;
}

// --- Pitch -> Hz conversion ---------------------------------------------------

const SEMITONES: Record<string, number> = {
  C: -9,
  D: -7,
  E: -5,
  F: -4,
  G: -2,
  A: 0,
  B: 2,
};

/**
 * Convert a pitch name (e.g. 'C4', 'D#3', 'Bb5') to frequency in Hz.
 * Returns NaN for 'rest'.
 */
export function noteFreq(pitch: Pitch): number {
  if (pitch === 'rest') return Number.NaN;
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(pitch);
  if (!m) {
    throw new Error(`Invalid pitch: ${pitch}`);
  }
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = parseInt(m[3], 10);

  const base = SEMITONES[letter];
  if (base === undefined) throw new Error(`Invalid pitch letter: ${pitch}`);

  let semis = base + (octave - 4) * 12;
  if (accidental === '#') semis += 1;
  else if (accidental === 'b') semis -= 1;

  return 440 * Math.pow(2, semis / 12);
}

// --- Scheduler ---------------------------------------------------------------

interface PartCursor {
  /** Position within the current loop iteration, in beats. */
  beatPos: number;
  /** Index into the notes array (used by melodic parts). */
  noteIdx: number;
  /** Index into the noise pattern (used by noise part). */
  stepIdx: number;
  /** How many full loops this part has scheduled so far. */
  loopCount: number;
}

const LOOK_AHEAD_SECONDS = 0.2;
const SCHEDULER_INTERVAL_MS = 25;

export class Sequencer {
  private synth: ChiptuneSynth;
  private currentTrack: Track | null = null;
  private playing = false;

  /**
   * Absolute AudioContext time at which the first loop iteration began.
   * An event's absolute time is:
   *     loopStartTime + (loopCount * beatsPerLoop + beatPos) * secondsPerBeat
   */
  private loopStartTime = 0;

  private pulse1Cursor: PartCursor = newCursor();
  private pulse2Cursor: PartCursor = newCursor();
  private triCursor: PartCursor = newCursor();
  private noiseCursor: PartCursor = newCursor();

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(synth: ChiptuneSynth) {
    this.synth = synth;
  }

  play(track: Track): void {
    if (this.playing && this.currentTrack?.id === track.id) return;
    this.stop();
    this.currentTrack = track;
    this.playing = true;
    this.resetCursors();
    // Anchor the loop slightly in the future to give the look-ahead some room.
    this.loopStartTime = this.synth.now() + 0.05;
    this.startScheduler();
  }

  stop(): void {
    this.playing = false;
    this.currentTrack = null;
    this.stopScheduler();
    this.resetCursors();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.stopScheduler();
  }

  resume(): void {
    if (this.playing || !this.currentTrack) return;
    this.playing = true;
    // Re-anchor so the cursors keep playing from where they paused.
    const secondsPerBeat = 60 / this.currentTrack.bpm;
    // Use pulse1 as the canonical clock since it always exists.
    const elapsedBeats =
      this.pulse1Cursor.loopCount * this.currentTrack.beatsPerLoop +
      this.pulse1Cursor.beatPos;
    this.loopStartTime = this.synth.now() + 0.05 - elapsedBeats * secondsPerBeat;
    // Rebase all cursors so their loopCount starts at 0 again, otherwise
    // future events would be scheduled in the past relative to the new anchor.
    this.rebaseCursor(this.pulse1Cursor);
    this.rebaseCursor(this.pulse2Cursor);
    this.rebaseCursor(this.triCursor);
    this.rebaseCursor(this.noiseCursor);
    this.startScheduler();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  currentId(): string | null {
    return this.currentTrack?.id ?? null;
  }

  setVolume(v: number): void {
    this.synth.setMasterVolume(v);
  }

  // --- internals -----------------------------------------------------------

  private resetCursors(): void {
    this.pulse1Cursor = newCursor();
    this.pulse2Cursor = newCursor();
    this.triCursor = newCursor();
    this.noiseCursor = newCursor();
  }

  private rebaseCursor(c: PartCursor): void {
    c.loopCount = 0;
  }

  private startScheduler(): void {
    if (this.intervalId !== null) return;
    // Run one tick immediately to prime the queue, then on an interval.
    this.tick();
    this.intervalId = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
  }

  private stopScheduler(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    if (!this.playing || !this.currentTrack) return;

    const track = this.currentTrack;
    const horizon = this.synth.now() + LOOK_AHEAD_SECONDS;
    const secondsPerBeat = 60 / track.bpm;

    this.scheduleMelodicPart(
      track,
      track.pulse1,
      this.pulse1Cursor,
      horizon,
      secondsPerBeat,
      'pulse'
    );
    if (track.pulse2) {
      this.scheduleMelodicPart(
        track,
        track.pulse2,
        this.pulse2Cursor,
        horizon,
        secondsPerBeat,
        'pulse'
      );
    }
    if (track.triangle) {
      // Re-use the melodic helper; channel/duty are ignored for triangle.
      const pseudoPart: PulsePart = { channel: 0, duty: 0.5, notes: track.triangle.notes };
      this.scheduleMelodicPart(
        track,
        pseudoPart,
        this.triCursor,
        horizon,
        secondsPerBeat,
        'triangle'
      );
    }
    if (track.noise) {
      this.scheduleNoisePart(track, track.noise, this.noiseCursor, horizon, secondsPerBeat);
    }
  }

  private absoluteTime(
    cursor: PartCursor,
    beatsPerLoop: number,
    secondsPerBeat: number
  ): number {
    const beats = cursor.loopCount * beatsPerLoop + cursor.beatPos;
    return this.loopStartTime + beats * secondsPerBeat;
  }

  private scheduleMelodicPart(
    track: Track,
    part: PulsePart,
    cursor: PartCursor,
    horizonTime: number,
    secondsPerBeat: number,
    kind: 'pulse' | 'triangle'
  ): void {
    if (part.notes.length === 0) return;
    let safety = 2048;
    while (safety-- > 0) {
      const time = this.absoluteTime(cursor, track.beatsPerLoop, secondsPerBeat);
      if (time > horizonTime) break;

      const note = part.notes[cursor.noteIdx];
      if (!note) break;

      const lengthSec = note.lengthBeats * secondsPerBeat;
      // Trim slightly so consecutive notes don't bleed into each other.
      const sustainMs = Math.max(20, lengthSec * 1000 * 0.92);

      if (note.pitch !== 'rest') {
        const freq = noteFreq(note.pitch);
        if (kind === 'pulse') {
          this.synth.playPulse(
            part.channel,
            { freq, durationMs: sustainMs, velocity: note.velocity ?? 0.9 },
            part.duty,
            time
          );
        } else {
          this.synth.playTriangle(
            { freq, durationMs: sustainMs, velocity: note.velocity ?? 0.9 },
            time
          );
        }
      }

      cursor.beatPos += note.lengthBeats;
      cursor.noteIdx = (cursor.noteIdx + 1) % part.notes.length;
      if (cursor.beatPos >= track.beatsPerLoop - 1e-6) {
        cursor.beatPos -= track.beatsPerLoop;
        cursor.noteIdx = 0;
        cursor.loopCount += 1;
      }
    }
  }

  private scheduleNoisePart(
    track: Track,
    part: NoisePart,
    cursor: PartCursor,
    horizonTime: number,
    secondsPerBeat: number
  ): void {
    if (part.pattern.length === 0) return;
    const stepBeats = 1 / part.stepsPerBeat;
    let safety = 2048;
    while (safety-- > 0) {
      const time = this.absoluteTime(cursor, track.beatsPerLoop, secondsPerBeat);
      if (time > horizonTime) break;

      const ch = part.pattern.charAt(cursor.stepIdx % part.pattern.length);
      if (ch === 'k') this.synth.playNoise('kick', 80, time);
      else if (ch === 's') this.synth.playNoise('snare', 110, time);
      else if (ch === 'h') this.synth.playNoise('hat', 40, time);

      cursor.beatPos += stepBeats;
      cursor.stepIdx = (cursor.stepIdx + 1) % part.pattern.length;
      if (cursor.beatPos >= track.beatsPerLoop - 1e-6) {
        cursor.beatPos -= track.beatsPerLoop;
        cursor.stepIdx = 0;
        cursor.loopCount += 1;
      }
    }
  }
}

function newCursor(): PartCursor {
  return { beatPos: 0, noteIdx: 0, stepIdx: 0, loopCount: 0 };
}
