/**
 * PISKA chiptune tracks. One per world plus the title screen.
 *
 * Each track is built by hand in a few helpers below to keep the data terse
 * but the music musical. Conventions:
 *   - pulse1 carries the melody (usually duty 0.5 = full square or 0.25)
 *   - pulse2 carries harmony (third/fifth/octave above the bass)
 *   - triangle plays a walking bass: root - fifth - octave - fifth
 *   - noise is a kick/snare/hat drum kit on sixteenths
 *
 * Note lengths: 1 = quarter, 0.5 = eighth, 0.25 = sixteenth, 2 = half, 4 = whole.
 *
 * All tracks are designed to loop seamlessly: the final note resolves so
 * the pickup back to the top of the loop feels natural.
 */

import type { Track, PulseNote, PulsePart, TriPart, NoisePart } from '@/audio/Sequencer';

// -----------------------------------------------------------------------------
// Small builders so the data below stays terse and readable.
// -----------------------------------------------------------------------------

/** Quick note builder. Defaults to a quarter note. */
function n(pitch: string, len = 1, velocity?: number): PulseNote {
  return velocity === undefined ? { pitch, lengthBeats: len } : { pitch, lengthBeats: len, velocity };
}
function r(len = 1): PulseNote {
  return { pitch: 'rest', lengthBeats: len };
}

/** Build a walking bass line from a list of [root_pitch, beats] chord stays. */
function walkingBass(stays: Array<[string, string, number]>): PulseNote[] {
  // For each [root, octave, beats] we emit root, fifth, octave, fifth pattern
  // distributed across the beats. For 4-beat stays this is a textbook NES bass.
  const out: PulseNote[] = [];
  for (const [root, octave, beats] of stays) {
    const rootPitch = `${root}${octave}`;
    const fifthPitch = `${fifthOf(root)}${octave}`;
    const octPitch = `${root}${parseInt(octave, 10) + 1}`;
    if (beats === 4) {
      out.push(n(rootPitch, 1, 0.95));
      out.push(n(fifthPitch, 1, 0.85));
      out.push(n(octPitch, 1, 0.9));
      out.push(n(fifthPitch, 1, 0.85));
    } else if (beats === 2) {
      out.push(n(rootPitch, 1, 0.95));
      out.push(n(fifthPitch, 1, 0.85));
    } else if (beats === 1) {
      out.push(n(rootPitch, 1, 0.95));
    } else {
      // Fallback — repeat root.
      for (let i = 0; i < beats; i++) out.push(n(rootPitch, 1, 0.9));
    }
  }
  return out;
}

/** Perfect-fifth root letter (diatonic-ish; close enough for bass). */
function fifthOf(letter: string): string {
  switch (letter.toUpperCase()) {
    case 'C': return 'G';
    case 'D': return 'A';
    case 'E': return 'B';
    case 'F': return 'C';
    case 'G': return 'D';
    case 'A': return 'E';
    case 'B': return 'F#';
    default: return letter;
  }
}

// -----------------------------------------------------------------------------
// Common drum patterns. Each character is one sixteenth (stepsPerBeat = 4).
// 16 chars covers 4 beats; we repeat as needed within the loop.
// -----------------------------------------------------------------------------

const DRUMS_BASIC_4BAR: NoisePart = {
  // beat: 1   .   .   .   2   .   .   .   3   .   .   .   4   .   .   .
  pattern: 'k-h-s-h-k-h-s-h-k-h-s-h-k-h-s-h',
  stepsPerBeat: 4,
};

const DRUMS_DRIVING: NoisePart = {
  // Heavier kick on the offbeat too — for the volcanic forge.
  pattern: 'k-hhs-hkk-hhs-hh',
  stepsPerBeat: 4,
};

const DRUMS_LIGHT: NoisePart = {
  // Just a hat shuffle with a kick on 1 and snare on 3 — sparse and tasteful.
  pattern: 'k-h-h-h-s-h-h-h-',
  stepsPerBeat: 4,
};

const DRUMS_EPIC: NoisePart = {
  // Big snare backbeat with a kick-double on the and-of-4.
  pattern: 'k---s---k-k-s---k---s---k---skss',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 1) TITLE — bright C major, ~140 BPM, two-bar hook with variation.
//    Vibe: Kirby's Adventure title cheer. 16-beat loop (4 bars).
// -----------------------------------------------------------------------------

const titleMelody: PulseNote[] = [
  // Bar 1: G4 C5 E5 G5 — arpeggio rise, ending on a held G5.
  n('G4', 0.5), n('C5', 0.5), n('E5', 0.5), n('G5', 0.5),
  n('F5', 0.5), n('E5', 0.5), n('D5', 1.0),
  // Bar 2: stepwise descent + grace.
  n('E5', 0.5), n('C5', 0.5), n('D5', 0.5), n('E5', 0.5),
  n('G4', 1.0), r(1.0),
  // Bar 3: lift to the relative — A minor flavor briefly.
  n('A4', 0.5), n('C5', 0.5), n('E5', 0.5), n('A5', 0.5),
  n('G5', 0.5), n('E5', 0.5), n('C5', 1.0),
  // Bar 4: resolve back to C, leaving G4 as pickup.
  n('D5', 0.5), n('E5', 0.5), n('F5', 0.5), n('E5', 0.5),
  n('D5', 0.5), n('C5', 0.5), n('G4', 1.0),
];

const titleHarmony: PulseNote[] = [
  n('E4', 2), n('D4', 2),
  n('C4', 2), n('B3', 2),
  n('C4', 2), n('E4', 2),
  n('D4', 2), n('B3', 2),
];

const titleBass: PulseNote[] = walkingBass([
  ['C', '3', 4],
  ['G', '2', 4],
  ['A', '2', 4],
  ['F', '2', 2], ['G', '2', 2],
]);

// -----------------------------------------------------------------------------
// 2) WORLD 1 — Vale do Carvalho. F major folk, ~120 BPM. Bouncy.
// -----------------------------------------------------------------------------

const w1Melody: PulseNote[] = [
  // Bar 1: F A C F — happy major arpeggio with skipping rhythm.
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('F5', 0.5),
  n('E5', 0.5), n('C5', 0.5), n('D5', 0.5), n('C5', 0.5),
  // Bar 2: stepwise down to F4, leaving room.
  n('B4', 0.5), n('A4', 0.5), n('G4', 0.5), n('A4', 0.5),
  n('F4', 1.0), r(1.0),
  // Bar 3: lift to Bb (IV) — folk flavor.
  n('A4', 0.5), n('B4', 0.5), n('C5', 0.5), n('D5', 0.5),
  n('C5', 0.5), n('A4', 0.5), n('Bb4', 1.0),
  // Bar 4: V (C) -> I (F) cadence.
  n('G4', 0.5), n('A4', 0.5), n('Bb4', 0.5), n('G4', 0.5),
  n('F4', 1.0), n('C5', 1.0),
];

const w1Harmony: PulseNote[] = [
  // Thirds under the melody; bounces between F major and C major.
  n('A3', 1), n('C4', 1), n('A3', 1), n('F3', 1),
  n('G3', 1), n('Bb3', 1), n('A3', 1), n('F3', 1),
  n('F3', 1), n('A3', 1), n('Bb3', 1), n('D4', 1),
  n('Bb3', 1), n('C4', 1), n('A3', 1), n('C4', 1),
];

const w1Bass: PulseNote[] = walkingBass([
  ['F', '2', 4],
  ['C', '2', 4],
  ['Bb', '2', 4],
  ['C', '2', 2], ['F', '2', 2],
]);

// -----------------------------------------------------------------------------
// 3) WORLD 2 — Dunas de Âmbar. D harmonic minor, ~110 BPM. Arabic flavor.
//    Harmonic minor scale: D E F G A Bb C# D — note the augmented 2nd Bb-C#.
// -----------------------------------------------------------------------------

const w2Melody: PulseNote[] = [
  // Bar 1: slithering D harmonic minor motif.
  n('D5', 0.5), n('E5', 0.5), n('F5', 0.5), n('E5', 0.5),
  n('D5', 0.5), n('C#5', 0.5), n('D5', 1.0),
  // Bar 2: leap up to highlight the augmented 2nd.
  n('A4', 0.5), n('Bb4', 0.5), n('C#5', 0.5), n('Bb4', 0.5),
  n('A4', 1.0), r(1.0),
  // Bar 3: climb higher.
  n('F5', 0.5), n('E5', 0.5), n('F5', 0.5), n('G5', 0.5),
  n('A5', 0.5), n('G5', 0.5), n('F5', 1.0),
  // Bar 4: snake back down with the C# pull to D.
  n('E5', 0.5), n('F5', 0.5), n('E5', 0.5), n('D5', 0.5),
  n('C#5', 0.5), n('D5', 0.5), n('A4', 1.0),
];

const w2Harmony: PulseNote[] = [
  // Drone-like 5ths (a Middle-Eastern staple).
  n('A4', 2), n('A4', 2),
  n('F4', 2), n('A4', 2),
  n('A4', 2), n('C#5', 2),
  n('A4', 2), n('F4', 2),
];

const w2Bass: PulseNote[] = [
  // Open-fifth ostinato on D — that hypnotic desert pulse.
  n('D3', 1), n('A3', 1), n('D3', 1), n('A3', 1),
  n('D3', 1), n('A3', 1), n('D3', 1), n('A3', 1),
  n('Bb2', 1), n('F3', 1), n('Bb2', 1), n('F3', 1),
  n('A2', 1), n('E3', 1), n('A2', 1), n('E3', 1),
];

const w2Drums: NoisePart = {
  // Lighter, more atmospheric — kick on 1 and 3, soft hats, snare on 4.
  pattern: 'k-h-h-h-k-h-h-h-h-h-h-h-k-h-s-h',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 4) WORLD 3 — Pico Geada. A minor, ~130 BPM. Sparkly high pulse melody.
// -----------------------------------------------------------------------------

const w3Melody: PulseNote[] = [
  // Bar 1: a glittering descending cascade.
  n('A5', 0.25), n('G5', 0.25), n('E5', 0.5),
  n('A5', 0.25), n('G5', 0.25), n('E5', 0.5),
  n('B5', 0.25), n('A5', 0.25), n('G5', 0.5),
  n('E5', 0.5), n('A5', 0.5),
  // Bar 2: held bell tone, then twinkle.
  n('C6', 2),
  n('B5', 0.25), n('A5', 0.25), n('G5', 0.25), n('E5', 0.25),
  n('A5', 1),
  // Bar 3: lift to D minor flavor.
  n('D6', 0.5), n('C6', 0.5), n('B5', 0.5), n('A5', 0.5),
  n('G5', 0.5), n('A5', 0.5), n('B5', 1),
  // Bar 4: cadence with grace ornaments.
  n('C6', 0.25), n('B5', 0.25), n('A5', 0.5),
  n('G5', 0.5), n('E5', 0.5), n('A5', 2),
];

const w3Harmony: PulseNote[] = [
  // Sparse 3rds & 6ths an octave below the melody — gives the crystalline air.
  n('C5', 2), n('E5', 2),
  n('E5', 2), n('A4', 2),
  n('F5', 2), n('E5', 2),
  n('E5', 2), n('A4', 2),
];

const w3Bass: PulseNote[] = walkingBass([
  ['A', '2', 4],
  ['F', '2', 4],
  ['D', '3', 4],
  ['E', '2', 2], ['A', '2', 2],
]);

// -----------------------------------------------------------------------------
// 5) WORLD 4 — Recife Coral. F lydian (F G A B C D E F), ~118 BPM. Floaty.
//    The raised 4th (B natural) gives it that liquid Yoshi's Island-esque feel.
// -----------------------------------------------------------------------------

const w4Melody: PulseNote[] = [
  // Bar 1: lydian sweep with the B natural making it sparkle.
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('B4', 0.5),
  n('C5', 0.5), n('A4', 0.5), n('G4', 1),
  // Bar 2: bubble up then float down.
  n('A4', 0.5), n('C5', 0.5), n('E5', 0.5), n('D5', 0.5),
  n('C5', 0.5), n('B4', 0.5), n('A4', 1),
  // Bar 3: ascend through F lydian.
  n('F4', 0.5), n('G4', 0.5), n('A4', 0.5), n('B4', 0.5),
  n('C5', 0.5), n('D5', 0.5), n('E5', 1),
  // Bar 4: descend gracefully to a held F.
  n('D5', 0.5), n('C5', 0.5), n('B4', 0.5), n('A4', 0.5),
  n('G4', 0.5), n('A4', 0.5), n('F4', 1),
];

const w4Harmony: PulseNote[] = [
  // Suspended-feel 4ths/5ths.
  n('C4', 2), n('E4', 2),
  n('F4', 2), n('A4', 2),
  n('C4', 2), n('E4', 2),
  n('D4', 2), n('C4', 2),
];

const w4Bass: PulseNote[] = walkingBass([
  ['F', '2', 4],
  ['A', '2', 4],
  ['C', '3', 4],
  ['G', '2', 2], ['F', '2', 2],
]);

// -----------------------------------------------------------------------------
// 6) WORLD 5 — Forja Vulcânica. E minor, ~150 BPM. Chromatic, driving.
//    Heavy drum kit. Think Mega Man boss-stage urgency.
// -----------------------------------------------------------------------------

const w5Melody: PulseNote[] = [
  // Bar 1: chromatic spike up to E5, then hammer it.
  n('E5', 0.25), n('F5', 0.25), n('F#5', 0.25), n('G5', 0.25),
  n('E5', 0.5), n('B4', 0.5),
  n('E5', 0.5), n('G5', 0.5), n('F#5', 0.5), n('D5', 0.5),
  // Bar 2: gallop on E.
  n('E5', 0.25), n('E5', 0.25), n('G5', 0.5),
  n('E5', 0.25), n('E5', 0.25), n('B5', 0.5),
  n('A5', 0.5), n('G5', 0.5), n('F#5', 0.5), n('E5', 0.5),
  // Bar 3: shift up — feel the chromatic tension.
  n('G5', 0.5), n('A5', 0.5), n('Bb5', 0.5), n('B5', 0.5),
  n('A5', 0.5), n('G5', 0.5), n('F#5', 1),
  // Bar 4: hammer back to E.
  n('E5', 0.25), n('F#5', 0.25), n('G5', 0.5),
  n('A5', 0.25), n('G5', 0.25), n('F#5', 0.5),
  n('E5', 0.5), n('D5', 0.5), n('E5', 1),
];

const w5Harmony: PulseNote[] = [
  n('B4', 1), n('E5', 1), n('B4', 1), n('G4', 1),
  n('B4', 1), n('D5', 1), n('B4', 1), n('G4', 1),
  n('D5', 1), n('F#5', 1), n('A5', 1), n('F#5', 1),
  n('B4', 1), n('E5', 1), n('B4', 1), n('E5', 1),
];

const w5Bass: PulseNote[] = [
  // Driving eighth-note bass on E (root) with the V (B) on the offbeats.
  n('E2', 0.5), n('E2', 0.5), n('E3', 0.5), n('E2', 0.5),
  n('B2', 0.5), n('B2', 0.5), n('B3', 0.5), n('B2', 0.5),
  n('E2', 0.5), n('E2', 0.5), n('G2', 0.5), n('G2', 0.5),
  n('B2', 0.5), n('B2', 0.5), n('A2', 0.5), n('A2', 0.5),
  n('D3', 0.5), n('D3', 0.5), n('D2', 0.5), n('D3', 0.5),
  n('A2', 0.5), n('A2', 0.5), n('A3', 0.5), n('A2', 0.5),
  n('E2', 0.5), n('E2', 0.5), n('E3', 0.5), n('E2', 0.5),
  n('B2', 0.5), n('B2', 0.5), n('E3', 0.5), n('E2', 0.5),
];

// -----------------------------------------------------------------------------
// 7) WORLD 6 — Castelo das Nuvens. B minor -> D major, ~135 BPM. Epic.
// -----------------------------------------------------------------------------

const w6Melody: PulseNote[] = [
  // Bar 1: a stately rising motif in B minor.
  n('B4', 1), n('D5', 0.5), n('F#5', 0.5),
  n('B5', 1), n('A5', 0.5), n('F#5', 0.5),
  // Bar 2: dramatic descent then a held tone.
  n('G5', 0.5), n('F#5', 0.5), n('E5', 0.5), n('D5', 0.5),
  n('C#5', 0.5), n('B4', 0.5), n('F#5', 1),
  // Bar 3: shift toward D major — opens up the sky.
  n('A4', 0.5), n('D5', 0.5), n('F#5', 0.5), n('A5', 0.5),
  n('D6', 1), n('C#6', 1),
  // Bar 4: cadence back to B minor — the V7 (F#) -> i (B).
  n('B5', 0.5), n('A5', 0.5), n('G5', 0.5), n('F#5', 0.5),
  n('E5', 0.5), n('D5', 0.5), n('B4', 1),
];

const w6Harmony: PulseNote[] = [
  // Stacked thirds — heroic.
  n('F#4', 1), n('A4', 1), n('D5', 1), n('A4', 1),
  n('B4', 1), n('A4', 1), n('B4', 1), n('A4', 1),
  n('D4', 1), n('F#4', 1), n('A4', 1), n('F#4', 1),
  n('G4', 1), n('F#4', 1), n('A4', 1), n('F#4', 1),
];

const w6Bass: PulseNote[] = walkingBass([
  ['B', '2', 4],
  ['F#', '2', 4],
  ['D', '3', 4],
  ['F#', '2', 2], ['B', '2', 2],
]);

// -----------------------------------------------------------------------------
// Assemble Track records.
// -----------------------------------------------------------------------------

function pulse1Part(notes: PulseNote[], duty: 0.125 | 0.25 | 0.5 | 0.75 = 0.5): PulsePart {
  return { channel: 0, duty, notes };
}
function pulse2Part(notes: PulseNote[], duty: 0.125 | 0.25 | 0.5 | 0.75 = 0.25): PulsePart {
  return { channel: 1, duty, notes };
}
function triPart(notes: PulseNote[]): TriPart {
  return { notes };
}

export const TRACKS: Record<string, Track> = {
  title: {
    id: 'title',
    name: 'Title — Welcome to PISKA',
    bpm: 140,
    beatsPerLoop: 16,
    pulse1: pulse1Part(titleMelody, 0.5),
    pulse2: pulse2Part(titleHarmony, 0.25),
    triangle: triPart(titleBass),
    noise: DRUMS_BASIC_4BAR,
  },
  'world-1': {
    id: 'world-1',
    name: 'Vale do Carvalho',
    bpm: 120,
    beatsPerLoop: 16,
    pulse1: pulse1Part(w1Melody, 0.5),
    pulse2: pulse2Part(w1Harmony, 0.25),
    triangle: triPart(w1Bass),
    noise: DRUMS_BASIC_4BAR,
  },
  'world-2': {
    id: 'world-2',
    name: 'Dunas de Âmbar',
    bpm: 110,
    beatsPerLoop: 16,
    pulse1: pulse1Part(w2Melody, 0.25),
    pulse2: pulse2Part(w2Harmony, 0.125),
    triangle: triPart(w2Bass),
    noise: w2Drums,
  },
  'world-3': {
    id: 'world-3',
    name: 'Pico Geada',
    bpm: 130,
    beatsPerLoop: 16,
    pulse1: pulse1Part(w3Melody, 0.125),
    pulse2: pulse2Part(w3Harmony, 0.5),
    triangle: triPart(w3Bass),
    noise: DRUMS_LIGHT,
  },
  'world-4': {
    id: 'world-4',
    name: 'Recife Coral',
    bpm: 118,
    beatsPerLoop: 16,
    pulse1: pulse1Part(w4Melody, 0.5),
    pulse2: pulse2Part(w4Harmony, 0.25),
    triangle: triPart(w4Bass),
    noise: DRUMS_LIGHT,
  },
  'world-5': {
    id: 'world-5',
    name: 'Forja Vulcânica',
    bpm: 150,
    beatsPerLoop: 16,
    pulse1: pulse1Part(w5Melody, 0.25),
    pulse2: pulse2Part(w5Harmony, 0.5),
    triangle: triPart(w5Bass),
    noise: DRUMS_DRIVING,
  },
  'world-6': {
    id: 'world-6',
    name: 'Castelo das Nuvens',
    bpm: 135,
    beatsPerLoop: 16,
    pulse1: pulse1Part(w6Melody, 0.5),
    pulse2: pulse2Part(w6Harmony, 0.25),
    triangle: triPart(w6Bass),
    noise: DRUMS_EPIC,
  },
};

export const TRACK_ID_BY_WORLD: Record<number, string> = {
  1: 'world-1',
  2: 'world-2',
  3: 'world-3',
  4: 'world-4',
  5: 'world-5',
  6: 'world-6',
};
