/**
 * Centralised haptic feedback helper.
 *
 * Wraps `navigator.vibrate` with two guards:
 *   1. Feature detection — `vibrate` is missing on desktop browsers and
 *      iOS Safari (which never exposes the Vibration API).
 *   2. User preference — respects `SaveManager.getVibration()` so the
 *      Settings toggle takes effect everywhere.
 *
 * Callers don't need to think about either. `haptic(...)` is a no-op when
 * vibration isn't possible or isn't wanted.
 */

import { SaveManager } from '@/save/SaveManager';

type Pattern = number | readonly number[];

export function haptic(pattern: Pattern): void {
  if (typeof navigator === 'undefined') return;
  // iOS Safari exposes `navigator.vibrate` as `undefined` (the property
  // exists but isn't a function), so `'vibrate' in navigator` is true and
  // calling it throws "vibrate is not a function". Check the type instead.
  if (typeof navigator.vibrate !== 'function') return;
  if (!SaveManager.get().getVibration()) return;
  try {
    navigator.vibrate(pattern as number | number[]);
  } catch {
    /* swallow — haptics are cosmetic */
  }
}

/** Convenience presets so call sites read intent, not magnitudes. */
export const HAPTIC = {
  swap: 12,
  match: 20,
  chain: (chain: number): number[] => {
    const steps = Math.max(2, Math.min(5, chain));
    const out: number[] = [];
    for (let i = 0; i < steps; i++) out.push(0, 30 + i * 8);
    return out;
  },
  garbage: 45,
  gameOver: [0, 80, 40, 120] as const,
  buttonTap: 8,
} as const;
