/**
 * PISKA chiptune tracks. One per world plus the title screen.
 *
 * Each track is an 8-bar loop (32 beats at 4/4) so we can develop a melodic
 * idea across an A-section (bars 1-4) and a B-section (bars 5-8) before it
 * loops. At the chosen BPMs every loop fits comfortably under 25 seconds.
 *
 * Conventions:
 *   - pulse1 carries the lead melody (usually duty 0.5 or 0.25)
 *   - pulse2 carries a counter-melody / arpeggio that converses with pulse1
 *   - triangle plays a moving bass with passing tones and octave drops
 *   - noise is a per-world drum pattern; see `NoisePart` in Sequencer for the
 *     character grammar ('k','s','h','o','t','c','-')
 *
 * Note lengths: 1 = quarter, 0.5 = eighth, 0.25 = sixteenth, 2 = half, 4 = whole.
 *
 * The seven tracks (title + 6 worlds) are deliberately different in key,
 * tempo, drum kit, and rhythmic feel so each context has its own atmosphere.
 *
 *   title    -> C major, 132 BPM, warm/hopeful (the Carina dedication)
 *   world-1  -> F major, 124 BPM, pastoral folk (Vale do Carvalho)
 *   world-2  -> D harmonic minor, 104 BPM, desert sway (Dunas de Âmbar)
 *   world-3  -> A minor, 96 BPM, sparse glass bells (Pico Geada)
 *   world-4  -> F lydian, 116 BPM, bubbly/curious (Recife Coral)
 *   world-5  -> E minor, 156 BPM, driving fight music (Forja Vulcânica)
 *   world-6  -> B minor -> D major, 140 BPM, anthemic climb (Castelo das Nuvens)
 */

import type { Track, PulseNote, PulsePart, TriPart, NoisePart } from '@/audio/Sequencer';

// -----------------------------------------------------------------------------
// Small builders so the data below stays terse and readable.
// -----------------------------------------------------------------------------

/** Note builder. Defaults to a quarter note at default velocity. */
function n(pitch: string, len = 1, velocity?: number): PulseNote {
  return velocity === undefined ? { pitch, lengthBeats: len } : { pitch, lengthBeats: len, velocity };
}
function r(len = 1): PulseNote {
  return { pitch: 'rest', lengthBeats: len };
}
/** Note with a pitch slide from `from` over `slideMs` ms. */
function slide(pitch: string, from: string, len: number, slideMs: number, velocity?: number): PulseNote {
  const base: PulseNote = { pitch, lengthBeats: len, slideFrom: from, slideMs };
  if (velocity !== undefined) base.velocity = velocity;
  return base;
}
/** Note with vibrato. Depth in cents, rate in Hz. */
function vib(pitch: string, len: number, cents = 25, rateHz = 5.5, velocity?: number): PulseNote {
  const base: PulseNote = { pitch, lengthBeats: len, vibratoCents: cents, vibratoRateHz: rateHz };
  if (velocity !== undefined) base.velocity = velocity;
  return base;
}

// -----------------------------------------------------------------------------
// 1) TITLE — C major, 132 BPM, 8 bars. Warm, hopeful, anthemic.
//    "Para Carina" moment: a lyrical opening phrase that answers itself.
// -----------------------------------------------------------------------------

const titleMelody: PulseNote[] = [
  // Bar 1: lyrical opening — G4 up to E5, then a gentle settle.
  n('G4', 1), n('C5', 0.5), n('E5', 0.5), n('G5', 1), n('E5', 0.5), n('D5', 0.5),
  // Bar 2: answer phrase landing on the third.
  n('C5', 0.5), n('D5', 0.5), n('E5', 1), n('D5', 1), n('C5', 1),
  // Bar 3: lift to A (relative minor color), step up.
  n('A4', 0.5), n('C5', 0.5), n('E5', 0.5), n('A5', 0.5), n('G5', 1), n('E5', 1),
  // Bar 4: half cadence on G (V).
  n('F5', 0.5), n('E5', 0.5), n('D5', 1), vib('G4', 2, 22, 5.2),
  // Bar 5: chorus lift — a brighter rephrasing of bar 1.
  n('E5', 0.5), n('G5', 0.5), n('C6', 1), n('B5', 0.5), n('A5', 0.5), n('G5', 1),
  // Bar 6: descend through the warmer middle register.
  n('A5', 0.5), n('G5', 0.5), n('F5', 0.5), n('E5', 0.5), n('D5', 1), n('E5', 1),
  // Bar 7: subdominant pull (F) -> dominant (G).
  n('F5', 1), n('A5', 0.5), n('G5', 0.5), n('E5', 1), n('D5', 1),
  // Bar 8: full cadence to C, leaving a G4 pickup for the loop.
  n('E5', 0.5), n('D5', 0.5), n('C5', 1), vib('C5', 1, 18, 4.8), n('G4', 1),
];

const titleHarmony: PulseNote[] = [
  // Bar 1-2: gentle arpeggios outlining C and G7.
  n('E4', 0.5), n('G4', 0.5), n('C5', 0.5), n('G4', 0.5),
  n('E4', 0.5), n('G4', 0.5), n('C5', 0.5), n('G4', 0.5),
  n('D4', 0.5), n('G4', 0.5), n('B4', 0.5), n('G4', 0.5),
  n('D4', 0.5), n('F4', 0.5), n('B4', 0.5), n('F4', 0.5),
  // Bar 3-4: A minor / D minor / G7 motion under the lift.
  n('C4', 0.5), n('E4', 0.5), n('A4', 0.5), n('E4', 0.5),
  n('C4', 0.5), n('E4', 0.5), n('A4', 0.5), n('E4', 0.5),
  n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('F4', 0.5),
  n('D4', 0.5), n('G4', 0.5), n('B4', 0.5), n('G4', 0.5),
  // Bar 5-6: chorus — bigger intervals (sixths) over C and F.
  n('E4', 0.5), n('G4', 0.5), n('C5', 0.5), n('E5', 0.5),
  n('E4', 0.5), n('G4', 0.5), n('C5', 0.5), n('G4', 0.5),
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  n('E4', 0.5), n('G4', 0.5), n('C5', 0.5), n('G4', 0.5),
  // Bar 7-8: F -> G7 -> C cadence.
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  n('D4', 0.5), n('G4', 0.5), n('B4', 0.5), n('G4', 0.5),
  n('E4', 0.5), n('G4', 0.5), n('C5', 0.5), n('G4', 0.5),
  n('E4', 0.5), n('C4', 0.5), n('E4', 1),
];

const titleBass: PulseNote[] = [
  // Bar 1: C - C/B - Am - Am/G   (descending root motion)
  n('C3', 1), n('G2', 1), n('A2', 1), n('E2', 1),
  // Bar 2: F - C/E - Dm - G
  n('F2', 1), n('E2', 1), n('D2', 1), n('G2', 1),
  // Bar 3: Am - F - Dm - G
  n('A2', 1), n('F2', 1), n('D2', 1), n('G2', 1),
  // Bar 4: C - E - F - G (passing motion to set up chorus)
  n('C3', 1), n('E2', 1), n('F2', 1), n('G2', 1),
  // Bar 5: C - G - C - E
  n('C3', 1), n('G2', 1), n('C3', 1), n('E3', 1),
  // Bar 6: F - C - Dm - Am
  n('F2', 1), n('C3', 1), n('D2', 1), n('A2', 1),
  // Bar 7: F - G - Em - Am
  n('F2', 1), n('G2', 1), n('E2', 1), n('A2', 1),
  // Bar 8: Dm - G - C - G (perfect cadence with pickup back to top)
  n('D3', 1), n('G2', 1), n('C3', 1), n('G2', 1),
];

const titleDrums: NoisePart = {
  // Soft heartbeat — kick on 1+3, snare on 2+4, hats on the &-of-each.
  // 32 sixteenths = 8 beats = 2 bars; pattern repeats four times across the loop.
  pattern: 'k-h-s-h-k-h-s-h-k-h-s-h-k-hcs-hh',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 2) WORLD 1 — Vale do Carvalho, Pim. F major, 124 BPM. Pastoral skipping folk.
// -----------------------------------------------------------------------------

const w1Melody: PulseNote[] = [
  // Bar 1: skipping F-A-C-F arpeggio, classic pastoral hook.
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('F5', 0.5), n('E5', 0.5), n('C5', 0.5), n('D5', 1),
  // Bar 2: gentle answer down to G4.
  n('C5', 0.5), n('Bb4', 0.5), n('A4', 0.5), n('G4', 0.5), n('A4', 1), n('F4', 1),
  // Bar 3: lift to the IV (Bb) — folk dance feel.
  n('Bb4', 0.5), n('D5', 0.5), n('F5', 0.5), n('D5', 0.5), n('C5', 0.5), n('Bb4', 0.5), n('A4', 1),
  // Bar 4: cadence V (C7) -> I (F).
  n('G4', 0.5), n('A4', 0.5), n('Bb4', 0.5), n('C5', 0.5), n('A4', 1), n('F4', 1),
  // Bar 5: variation — start a fourth higher.
  n('A4', 0.5), n('C5', 0.5), n('F5', 0.5), n('A5', 0.5), n('G5', 0.5), n('F5', 0.5), n('E5', 1),
  // Bar 6: rolling descent.
  n('F5', 0.5), n('D5', 0.5), n('C5', 0.5), n('A4', 0.5), n('Bb4', 1), n('A4', 1),
  // Bar 7: Bb -> G7 motion, sets up the cadence.
  n('Bb4', 0.5), n('A4', 0.5), n('G4', 0.5), n('Bb4', 0.5), n('A4', 0.5), n('G4', 0.5), n('F4', 1),
  // Bar 8: cadence with a little turn — pickup C5 back to bar 1.
  n('A4', 0.5), n('G4', 0.5), n('F4', 0.5), n('G4', 0.5), n('F4', 1), n('C5', 1),
];

const w1Harmony: PulseNote[] = [
  // Pulse2 plays a sprightly broken-chord pattern (eighth notes).
  // Bar 1: F - F
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  // Bar 2: C7 - F
  n('E4', 0.5), n('G4', 0.5), n('Bb4', 0.5), n('G4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  // Bar 3: Bb - Bb
  n('Bb3', 0.5), n('D4', 0.5), n('F4', 0.5), n('D4', 0.5), n('Bb3', 0.5), n('D4', 0.5), n('F4', 0.5), n('D4', 0.5),
  // Bar 4: C7 - F
  n('E4', 0.5), n('G4', 0.5), n('Bb4', 0.5), n('G4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  // Bar 5: Dm - Dm  (relative minor color, like a cloud passing the sun)
  n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('F4', 0.5), n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('F4', 0.5),
  // Bar 6: Bb - F
  n('Bb3', 0.5), n('D4', 0.5), n('F4', 0.5), n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  // Bar 7: Gm - C7
  n('G3', 0.5), n('Bb3', 0.5), n('D4', 0.5), n('Bb3', 0.5), n('E4', 0.5), n('G4', 0.5), n('Bb4', 0.5), n('G4', 0.5),
  // Bar 8: F - C7  (turnaround)
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5), n('E4', 0.5), n('G4', 0.5), n('Bb4', 0.5), n('G4', 0.5),
];

const w1Bass: PulseNote[] = [
  // Bouncy 2-feel: root-fifth on every beat, with octave jumps for movement.
  n('F2', 1), n('C3', 1), n('F2', 1), n('A2', 1),                 // F
  n('C3', 1), n('G3', 1), n('C3', 1), n('E3', 1),                 // C7
  n('Bb2', 1), n('F3', 1), n('Bb2', 1), n('D3', 1),               // Bb
  n('C3', 1), n('G3', 1), n('C3', 1), n('E3', 1),                 // C7
  n('D3', 1), n('A3', 1), n('D3', 1), n('F3', 1),                 // Dm
  n('Bb2', 1), n('F3', 1), n('F2', 1), n('A2', 1),                // Bb -> F
  n('G2', 1), n('D3', 1), n('C3', 1), n('G3', 1),                 // Gm -> C7
  n('F2', 1), n('A2', 1), n('C3', 1), n('G2', 1),                 // F -> C7 turnaround
];

const w1Drums: NoisePart = {
  // 8-beat country shuffle: kick on 1+3, snare backbeat on 2+4, hats triplet feel.
  pattern: 'k-h-s-hhk-h-s-hh-k-hcs-h-k-h-s-hh-',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 3) WORLD 2 — Dunas de Âmbar, Salla. D harmonic minor, 104 BPM. Slow desert sway.
//    Scale: D E F G A Bb C# D. The Bb-C# augmented second gives the Arabic flavor.
// -----------------------------------------------------------------------------

const w2Melody: PulseNote[] = [
  // Bar 1: slithering motif with a pitch slide into the held A — like wind over dunes.
  slide('A5', 'D5', 1.5, 200, 0.85), vib('A5', 0.5, 35, 6),
  n('Bb5', 0.5), n('A5', 0.5), n('G5', 0.5), n('F5', 0.5),
  // Bar 2: highlight the augmented 2nd (Bb -> C#).
  n('E5', 0.5), n('F5', 0.5), n('Bb5', 0.5), n('C#6', 0.5), vib('D6', 2, 30, 5.5),
  // Bar 3: descending phrase, exposing the C# leading tone.
  n('A5', 0.5), n('G5', 0.5), n('F5', 0.5), n('E5', 0.5), n('D5', 0.5), n('C#5', 0.5), n('D5', 1),
  // Bar 4: caravan pause.
  r(0.5), n('A4', 0.5), n('Bb4', 0.5), n('C#5', 0.5), vib('D5', 2, 35, 5.8),
  // Bar 5: leap up — higher register answer.
  n('F5', 0.5), n('G5', 0.5), n('A5', 0.5), n('Bb5', 0.5), slide('A5', 'C6', 1, 80), n('G5', 1),
  // Bar 6: snake back, augmented step Bb -> C# again.
  n('F5', 0.5), n('Bb5', 0.5), n('C#6', 0.5), n('Bb5', 0.5), n('A5', 0.5), n('G5', 0.5), n('F5', 1),
  // Bar 7: leading-tone dance C# -> D, then up an octave.
  n('E5', 0.5), n('F5', 0.5), n('G5', 0.5), n('A5', 0.5), n('Bb5', 0.5), n('C#6', 0.5), n('D6', 1),
  // Bar 8: drop to the tonic with a sigh.
  n('C#6', 0.5), n('Bb5', 0.5), n('A5', 1), slide('D5', 'F5', 1, 250, 0.7), r(1),
];

const w2Harmony: PulseNote[] = [
  // Drone-like 5ths and 4ths — Middle-Eastern staple — answered by call-response figures.
  n('A4', 4), n('A4', 4),                                          // Bars 1-2
  n('A4', 2), n('F4', 2),                                          // Bar 3
  n('Bb4', 2), n('A4', 2),                                         // Bar 4
  n('F4', 0.5), n('A4', 0.5), n('Bb4', 0.5), n('A4', 0.5),          // Bar 5
  n('F4', 0.5), n('A4', 0.5), n('Bb4', 0.5), n('A4', 0.5),
  n('A4', 0.5), n('Bb4', 0.5), n('C#5', 0.5), n('Bb4', 0.5),        // Bar 6
  n('A4', 0.5), n('G4', 0.5), n('F4', 0.5), n('E4', 0.5),
  n('A4', 0.5), n('Bb4', 0.5), n('C#5', 0.5), n('D5', 0.5),         // Bar 7
  n('C#5', 0.5), n('Bb4', 0.5), n('A4', 0.5), n('F4', 0.5),
  n('A4', 2), n('A4', 2),                                          // Bar 8 — drone resolution
];

const w2Bass: PulseNote[] = [
  // Open-fifth ostinato D-A swaying like camel steps.
  n('D3', 1), n('A2', 1), n('D3', 1), n('A2', 1),                  // Bar 1
  n('D3', 1), n('A2', 1), n('D3', 1), n('A2', 1),                  // Bar 2
  n('F3', 1), n('C3', 1), n('F3', 1), n('C3', 1),                  // Bar 3 (relative major taste)
  n('Bb2', 1), n('F3', 1), n('A2', 1), n('E3', 1),                 // Bar 4 (descending bass)
  n('D3', 1), n('A2', 1), n('D3', 1), n('F3', 1),                  // Bar 5
  n('Bb2', 1), n('F3', 1), n('Bb2', 1), n('D3', 1),                // Bar 6
  n('A2', 1), n('E3', 1), n('A2', 1), n('C#3', 1),                 // Bar 7 (V color)
  n('D3', 1), n('A2', 1), n('D3', 1), n('A2', 1),                  // Bar 8
];

const w2Drums: NoisePart = {
  // Slow tribal hand-drum feel: tom + soft kick + occasional clap.
  // 32 sixteenths over 2 bars; repeats 4x.
  pattern: 'k--t--h-k-h--t--k--t-c-h-k--t--h-',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 4) WORLD 3 — Pico Geada, Boreal. A natural minor, 96 BPM. Cold, sparse, glass.
// -----------------------------------------------------------------------------

const w3Melody: PulseNote[] = [
  // Bar 1: glassy bell-tone with a slow vibrato, held.
  vib('E5', 2, 18, 4), n('A5', 0.5), n('G5', 0.5), n('E5', 1),
  // Bar 2: tinkling descent (sixteenths) like icicles.
  n('C6', 0.25), n('B5', 0.25), n('A5', 0.25), n('G5', 0.25),
  n('E5', 0.5), n('A5', 0.5),
  vib('E5', 2, 15, 4),
  // Bar 3: rise to a held high A.
  n('C6', 0.5), n('D6', 0.5), n('E6', 1), vib('A5', 2, 20, 4.2),
  // Bar 4: minor color — F natural -> E descent.
  n('F5', 0.5), n('E5', 0.5), n('D5', 0.5), n('C5', 0.5), vib('E5', 2, 18, 4),
  // Bar 5: same bell motif, higher.
  vib('A5', 2, 18, 4), n('C6', 0.5), n('B5', 0.5), n('A5', 1),
  // Bar 6: cascading sixteenths.
  n('E6', 0.25), n('D6', 0.25), n('C6', 0.25), n('B5', 0.25),
  n('A5', 0.25), n('G5', 0.25), n('F5', 0.25), n('E5', 0.25),
  vib('A5', 2, 15, 4),
  // Bar 7: cold lift — D minor flavor.
  n('D6', 0.5), n('C6', 0.5), n('B5', 0.5), n('A5', 0.5), n('G5', 1), n('E5', 1),
  // Bar 8: final bell, sustained.
  vib('A5', 4, 22, 3.8),
];

const w3Harmony: PulseNote[] = [
  // Sparse arpeggios — long sustains, like wind chimes.
  n('A4', 2), n('C5', 2),                                          // Bar 1
  n('E5', 2), n('A4', 2),                                          // Bar 2
  n('F4', 2), n('A4', 2),                                          // Bar 3
  n('D5', 2), n('C5', 2),                                          // Bar 4
  n('E5', 2), n('A4', 2),                                          // Bar 5
  n('C5', 2), n('E5', 2),                                          // Bar 6
  n('B4', 2), n('D5', 2),                                          // Bar 7
  n('C5', 2), n('E5', 2),                                          // Bar 8
];

const w3Bass: PulseNote[] = [
  // Half-note bass — leaves lots of air. Bass walks Am -> F -> Dm -> E.
  n('A2', 2), n('E3', 2),
  n('A2', 2), n('E3', 2),
  n('F2', 2), n('C3', 2),
  n('D2', 2), n('A2', 2),
  n('A2', 2), n('E3', 2),
  n('F2', 2), n('A2', 2),
  n('G2', 2), n('D3', 2),
  n('A2', 2), n('E2', 2),
];

const w3Drums: NoisePart = {
  // Very sparse — just an open hat shimmer and an occasional snare.
  // 32 sixteenths across the loop = 8 beats; pattern repeats 4x.
  pattern: '----o-------s---',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 5) WORLD 4 — Recife Coral, Murena. F lydian (B natural), 116 BPM. Bubbly.
//    Lots of pitch slides — like bubbles rising and popping.
// -----------------------------------------------------------------------------

const w4Melody: PulseNote[] = [
  // Bar 1: F lydian motif highlighting the B natural.
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('B4', 0.5), n('D5', 1), n('C5', 1),
  // Bar 2: bubble-up slide.
  slide('A4', 'F4', 0.5, 60), n('B4', 0.5), n('C5', 0.5), n('E5', 0.5), n('D5', 1), n('A4', 1),
  // Bar 3: playful sixteenths — pop-pop-pop bubbles.
  n('F5', 0.25), n('E5', 0.25), n('D5', 0.25), n('C5', 0.25),
  n('B4', 0.25), n('C5', 0.25), n('D5', 0.25), n('E5', 0.25),
  n('F5', 1), n('A4', 1),
  // Bar 4: descend with a sigh slide.
  n('E5', 0.5), n('D5', 0.5), n('C5', 0.5), n('B4', 0.5), slide('F4', 'C5', 2, 200),
  // Bar 5: lift an octave — bigger bubble.
  n('F5', 0.5), n('A5', 0.5), n('C6', 0.5), n('B5', 0.5), n('D6', 1), n('C6', 1),
  // Bar 6: arpeggio descent.
  n('B5', 0.25), n('A5', 0.25), n('G5', 0.25), n('F5', 0.25),
  n('E5', 0.25), n('D5', 0.25), n('C5', 0.25), n('B4', 0.25),
  n('C5', 1), n('A4', 1),
  // Bar 7: lydian sweep up.
  n('F4', 0.5), n('G4', 0.5), n('A4', 0.5), n('B4', 0.5), n('C5', 0.5), n('D5', 0.5), n('E5', 1),
  // Bar 8: settle on F — bubble pop on the last note.
  n('D5', 0.5), n('C5', 0.5), n('B4', 0.5), n('A4', 0.5), n('F4', 1), slide('F4', 'A4', 1, 100, 0.7),
];

const w4Harmony: PulseNote[] = [
  // Counter-melody: bouncing thirds that imply F lydian -> C maj -> Dm -> Bbmaj7.
  // Bar 1: Fmaj7
  n('C4', 0.5), n('E4', 0.5), n('F4', 0.5), n('E4', 0.5), n('C4', 0.5), n('E4', 0.5), n('A4', 0.5), n('E4', 0.5),
  // Bar 2: C
  n('C4', 0.5), n('E4', 0.5), n('G4', 0.5), n('E4', 0.5), n('C4', 0.5), n('E4', 0.5), n('G4', 0.5), n('E4', 0.5),
  // Bar 3: Dm
  n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('F4', 0.5), n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('F4', 0.5),
  // Bar 4: Bbmaj7 -> C
  n('Bb3', 0.5), n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C4', 0.5), n('E4', 0.5), n('G4', 0.5), n('E4', 0.5),
  // Bar 5: F again (higher voicing)
  n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
  // Bar 6: G7 (V/IV) -> C
  n('G4', 0.5), n('B4', 0.5), n('D5', 0.5), n('B4', 0.5), n('C4', 0.5), n('E4', 0.5), n('G4', 0.5), n('E4', 0.5),
  // Bar 7: Dm -> C
  n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('F4', 0.5), n('C4', 0.5), n('E4', 0.5), n('G4', 0.5), n('E4', 0.5),
  // Bar 8: Bbmaj7 -> F
  n('Bb3', 0.5), n('D4', 0.5), n('F4', 0.5), n('D4', 0.5), n('F4', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5),
];

const w4Bass: PulseNote[] = [
  // Walking-ish bass with octave jumps for that aquatic bounce.
  n('F2', 1), n('A2', 1), n('C3', 1), n('A2', 1),                  // F
  n('C2', 1), n('G2', 1), n('C3', 1), n('G2', 1),                  // C
  n('D2', 1), n('A2', 1), n('D3', 1), n('A2', 1),                  // Dm
  n('Bb2', 1), n('F3', 1), n('C3', 1), n('G3', 1),                 // Bb -> C
  n('F2', 1), n('A2', 1), n('C3', 1), n('F3', 1),                  // F
  n('G2', 1), n('D3', 1), n('C3', 1), n('G2', 1),                  // G7 -> C
  n('D2', 1), n('A2', 1), n('C3', 1), n('G2', 1),                  // Dm -> C
  n('Bb2', 1), n('F3', 1), n('F2', 1), n('C3', 1),                 // Bb -> F (turnaround)
];

const w4Drums: NoisePart = {
  // Light kit with claps — playful, like coral creatures clicking.
  pattern: 'k-h-c-h-k-hhc-h-k-h-c-h-k-h-cohh',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 6) WORLD 5 — Forja Vulcânica, Brasa. E minor, 156 BPM. Driving fight music.
//    This also plays in Vs Online — it needs sustained energy.
// -----------------------------------------------------------------------------

const w5Melody: PulseNote[] = [
  // Bar 1: chromatic spike to E5 then hammer.
  n('E5', 0.25), n('F5', 0.25), n('F#5', 0.25), n('G5', 0.25),
  n('E5', 0.5), n('B4', 0.5),
  n('E5', 0.5), n('G5', 0.5), n('F#5', 0.5), n('D5', 0.5),
  // Bar 2: gallop on E with a stab to high B.
  n('E5', 0.25), n('E5', 0.25), n('G5', 0.5), n('E5', 0.25), n('E5', 0.25), n('B5', 0.5),
  n('A5', 0.5), n('G5', 0.5), n('F#5', 0.5), n('E5', 0.5),
  // Bar 3: shift up to chromatic tension.
  n('G5', 0.5), n('A5', 0.5), n('Bb5', 0.5), n('B5', 0.5),
  n('A5', 0.5), n('G5', 0.5), n('F#5', 1),
  // Bar 4: hammer back to E.
  n('E5', 0.25), n('F#5', 0.25), n('G5', 0.5),
  n('A5', 0.25), n('G5', 0.25), n('F#5', 0.5),
  n('E5', 0.5), n('D5', 0.5), n('E5', 1),
  // Bar 5-6: counter-attack section — leap to high G and tumble down.
  n('B5', 0.5), n('G5', 0.25), n('A5', 0.25), n('B5', 1),
  n('D6', 0.5), n('C6', 0.5), n('B5', 0.5), n('A5', 0.5),
  n('G5', 0.5), n('F#5', 0.5), n('E5', 0.5), n('D5', 0.5),
  n('E5', 0.25), n('D5', 0.25), n('B4', 0.5), n('E5', 1),
  // Bar 7: chromatic climb (the boss reveal).
  n('E5', 0.25), n('F5', 0.25), n('F#5', 0.25), n('G5', 0.25),
  n('G#5', 0.25), n('A5', 0.25), n('Bb5', 0.25), n('B5', 0.25),
  n('C6', 0.5), n('B5', 0.5), n('A5', 0.5), n('G5', 0.5),
  // Bar 8: final stab.
  n('F#5', 0.5), n('E5', 0.5), n('D5', 0.5), n('E5', 0.5),
  n('B4', 0.5), n('D5', 0.5), n('E5', 1),
];

const w5Harmony: PulseNote[] = [
  // Driving offbeat stabs — minor power chords sketched out.
  // Bar 1: Em
  n('B4', 0.5), n('E5', 0.5), n('B4', 0.5), n('G4', 0.5), n('B4', 0.5), n('E5', 0.5), n('B4', 0.5), n('G4', 0.5),
  // Bar 2: Em
  n('B4', 0.5), n('D5', 0.5), n('B4', 0.5), n('G4', 0.5), n('B4', 0.5), n('D5', 0.5), n('B4', 0.5), n('G4', 0.5),
  // Bar 3: D
  n('A4', 0.5), n('D5', 0.5), n('F#5', 0.5), n('D5', 0.5), n('A4', 0.5), n('D5', 0.5), n('F#5', 0.5), n('D5', 0.5),
  // Bar 4: Em
  n('B4', 0.5), n('E5', 0.5), n('B4', 0.5), n('G4', 0.5), n('B4', 0.5), n('E5', 0.5), n('B4', 0.5), n('E5', 0.5),
  // Bar 5: G
  n('B4', 0.5), n('G4', 0.5), n('D5', 0.5), n('G4', 0.5), n('B4', 0.5), n('G4', 0.5), n('D5', 0.5), n('G4', 0.5),
  // Bar 6: Am
  n('C5', 0.5), n('A4', 0.5), n('E5', 0.5), n('A4', 0.5), n('C5', 0.5), n('A4', 0.5), n('E5', 0.5), n('A4', 0.5),
  // Bar 7: D -> B7 (chromatic rise mirroring the lead)
  n('A4', 0.5), n('D5', 0.5), n('F#5', 0.5), n('A5', 0.5), n('B4', 0.5), n('D#5', 0.5), n('F#5', 0.5), n('A5', 0.5),
  // Bar 8: Em
  n('B4', 0.5), n('E5', 0.5), n('B4', 0.5), n('G4', 0.5), n('B4', 0.5), n('E5', 0.5), n('B4', 0.5), n('E5', 0.5),
];

const w5Bass: PulseNote[] = [
  // Driving eighth-note bass — keeps the fight engine running.
  n('E2', 0.5), n('E2', 0.5), n('E3', 0.5), n('E2', 0.5), n('B2', 0.5), n('B2', 0.5), n('B3', 0.5), n('B2', 0.5),
  n('E2', 0.5), n('E2', 0.5), n('G2', 0.5), n('G2', 0.5), n('B2', 0.5), n('B2', 0.5), n('A2', 0.5), n('A2', 0.5),
  n('D3', 0.5), n('D3', 0.5), n('D2', 0.5), n('D3', 0.5), n('A2', 0.5), n('A2', 0.5), n('A3', 0.5), n('A2', 0.5),
  n('E2', 0.5), n('E2', 0.5), n('E3', 0.5), n('E2', 0.5), n('B2', 0.5), n('B2', 0.5), n('E3', 0.5), n('E2', 0.5),
  n('G2', 0.5), n('G2', 0.5), n('G3', 0.5), n('G2', 0.5), n('D3', 0.5), n('D3', 0.5), n('B2', 0.5), n('D3', 0.5),
  n('A2', 0.5), n('A2', 0.5), n('A3', 0.5), n('A2', 0.5), n('E3', 0.5), n('E3', 0.5), n('C3', 0.5), n('E3', 0.5),
  n('D3', 0.5), n('D3', 0.5), n('D2', 0.5), n('D3', 0.5), n('B2', 0.5), n('B2', 0.5), n('D#3', 0.5), n('D#3', 0.5),
  n('E2', 0.5), n('E2', 0.5), n('E3', 0.5), n('E2', 0.5), n('B2', 0.5), n('B2', 0.5), n('E3', 0.5), n('B2', 0.5),
];

const w5Drums: NoisePart = {
  // Heavy double-kick metal beat with snare backbeat.
  // 16 steps = 4 beats = 1 bar; repeats 8x across loop.
  pattern: 'k-khs-h-k-khs-hkh',
  stepsPerBeat: 4,
};

// -----------------------------------------------------------------------------
// 7) WORLD 6 — Castelo das Nuvens, Aura. B minor -> D major, 140 BPM. Anthemic.
//    Climbing, heroic — the finale.
// -----------------------------------------------------------------------------

const w6Melody: PulseNote[] = [
  // Bar 1: stately rising motif in B minor.
  n('B4', 1), n('D5', 0.5), n('F#5', 0.5), n('B5', 1), n('A5', 0.5), n('F#5', 0.5),
  // Bar 2: dramatic descent then held tone with vibrato (heroic shimmer).
  n('G5', 0.5), n('F#5', 0.5), n('E5', 0.5), n('D5', 0.5), n('C#5', 0.5), n('B4', 0.5), vib('F#5', 1, 18, 5),
  // Bar 3: shift toward D major — the clouds part.
  n('A4', 0.5), n('D5', 0.5), n('F#5', 0.5), n('A5', 0.5), n('D6', 1), n('C#6', 1),
  // Bar 4: V7 (F#7) -> i (Bm) cadence.
  n('B5', 0.5), n('A5', 0.5), n('G5', 0.5), n('F#5', 0.5), n('E5', 0.5), n('D5', 0.5), vib('B4', 1, 20, 4.8),
  // Bar 5: chorus — modulate to D major, brighter.
  n('D5', 0.5), n('F#5', 0.5), n('A5', 1), n('D6', 1), n('A5', 1),
  // Bar 6: triumphant climb.
  n('F#5', 0.5), n('A5', 0.5), n('D6', 0.5), n('F#6', 0.5), n('E6', 1), n('D6', 1),
  // Bar 7: descending sweep with passing chromatic.
  n('C#6', 0.5), n('B5', 0.5), n('A5', 0.5), n('G5', 0.5), n('F#5', 0.5), n('G5', 0.5), n('A5', 1),
  // Bar 8: full cadence — V7 -> i back to B minor for the loop.
  n('F#5', 0.5), n('E5', 0.5), n('D5', 0.5), n('C#5', 0.5), n('B4', 1), n('F#4', 1),
];

const w6Harmony: PulseNote[] = [
  // Counter-melody with stacked thirds — heroic horn-section feel.
  // Bar 1: Bm
  n('F#4', 1), n('A4', 1), n('D5', 1), n('F#5', 1),
  // Bar 2: Bm -> F#7
  n('D5', 1), n('B4', 1), n('A4', 1), n('C#5', 1),
  // Bar 3: D
  n('D4', 1), n('F#4', 1), n('A4', 1), n('F#4', 1),
  // Bar 4: F#7 -> Bm
  n('A4', 1), n('C#5', 1), n('F#4', 1), n('B4', 1),
  // Bar 5: D
  n('A4', 1), n('F#4', 1), n('A4', 1), n('D5', 1),
  // Bar 6: D -> A
  n('A4', 1), n('C#5', 1), n('A4', 1), n('E5', 1),
  // Bar 7: Bm -> G
  n('A4', 1), n('F#4', 1), n('D4', 1), n('G4', 1),
  // Bar 8: F#7 -> Bm
  n('A4', 1), n('C#5', 1), n('F#4', 1), n('B4', 1),
];

const w6Bass: PulseNote[] = [
  // Anthemic bass — root jumps + octave pulls for forward motion.
  n('B2', 1), n('F#3', 1), n('B2', 1), n('D3', 1),                 // Bm
  n('B2', 1), n('D3', 1), n('F#2', 1), n('A2', 1),                 // Bm -> F#
  n('D3', 1), n('A2', 1), n('D3', 1), n('F#3', 1),                 // D
  n('F#2', 1), n('C#3', 1), n('B2', 1), n('F#2', 1),               // F# -> Bm
  n('D3', 1), n('A2', 1), n('D3', 1), n('F#3', 1),                 // D
  n('A2', 1), n('E3', 1), n('A2', 1), n('C#3', 1),                 // A
  n('B2', 1), n('D3', 1), n('G2', 1), n('B2', 1),                  // Bm -> G
  n('F#2', 1), n('A2', 1), n('B2', 1), n('F#2', 1),                // F# -> Bm
];

const w6Drums: NoisePart = {
  // Epic ride with big snare backbeat and double-kicks at the close.
  // 16 steps = 4 beats = 1 bar; repeats 8x.
  pattern: 'k-o-s-o-k-k-s-okk',
  stepsPerBeat: 4,
};

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
    name: 'Title — Para Carina',
    bpm: 132,
    beatsPerLoop: 32,
    pulse1: pulse1Part(titleMelody, 0.5),
    pulse2: pulse2Part(titleHarmony, 0.25),
    triangle: triPart(titleBass),
    noise: titleDrums,
  },
  'world-1': {
    id: 'world-1',
    name: 'Vale do Carvalho',
    bpm: 124,
    beatsPerLoop: 32,
    pulse1: pulse1Part(w1Melody, 0.5),
    pulse2: pulse2Part(w1Harmony, 0.25),
    triangle: triPart(w1Bass),
    noise: w1Drums,
  },
  'world-2': {
    id: 'world-2',
    name: 'Dunas de Âmbar',
    bpm: 104,
    beatsPerLoop: 32,
    pulse1: pulse1Part(w2Melody, 0.25),
    pulse2: pulse2Part(w2Harmony, 0.125),
    triangle: triPart(w2Bass),
    noise: w2Drums,
  },
  'world-3': {
    id: 'world-3',
    name: 'Pico Geada',
    bpm: 96,
    beatsPerLoop: 32,
    pulse1: pulse1Part(w3Melody, 0.125),
    pulse2: pulse2Part(w3Harmony, 0.5),
    triangle: triPart(w3Bass),
    noise: w3Drums,
  },
  'world-4': {
    id: 'world-4',
    name: 'Recife Coral',
    bpm: 116,
    beatsPerLoop: 32,
    pulse1: pulse1Part(w4Melody, 0.5),
    pulse2: pulse2Part(w4Harmony, 0.25),
    triangle: triPart(w4Bass),
    noise: w4Drums,
  },
  'world-5': {
    id: 'world-5',
    name: 'Forja Vulcânica',
    bpm: 156,
    beatsPerLoop: 32,
    pulse1: pulse1Part(w5Melody, 0.25),
    pulse2: pulse2Part(w5Harmony, 0.5),
    triangle: triPart(w5Bass),
    noise: w5Drums,
  },
  'world-6': {
    id: 'world-6',
    name: 'Castelo das Nuvens',
    bpm: 140,
    beatsPerLoop: 32,
    pulse1: pulse1Part(w6Melody, 0.5),
    pulse2: pulse2Part(w6Harmony, 0.25),
    triangle: triPart(w6Bass),
    noise: w6Drums,
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
