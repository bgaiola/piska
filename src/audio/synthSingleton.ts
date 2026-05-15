/**
 * Shared ChiptuneSynth instance.
 *
 * BGMPlayer and SFXPlayer both call getSharedSynth() so they target the same
 * audio context and master gain. This keeps SFX/BGM mixed coherently and
 * avoids stacking multiple AudioContexts (which most browsers throttle).
 */

import { ChiptuneSynth } from './ChiptuneSynth';

let shared: ChiptuneSynth | null = null;

export function getSharedSynth(): ChiptuneSynth {
  if (!shared) {
    shared = new ChiptuneSynth();
  }
  return shared;
}

/** Mostly for tests — destroys the shared synth and clears the singleton. */
export function destroySharedSynth(): void {
  if (shared) {
    shared.destroy();
    shared = null;
  }
}
