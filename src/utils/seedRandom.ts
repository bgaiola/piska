/**
 * Mulberry32 PRNG. Given a 32-bit integer seed, returns a function that produces
 * deterministic floats in [0, 1).
 *
 * Reference: https://en.wikipedia.org/wiki/Linear_congruential_generator and
 * the well-known Mulberry32 implementation by Tommy Ettinger.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
