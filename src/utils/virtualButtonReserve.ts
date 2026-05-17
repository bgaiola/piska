/**
 * virtualButtonReserve — viewport reservations to keep the playfield clear
 * of the on-screen virtual buttons on touch devices.
 *
 * The buttons (defined in `engine/input/VirtualButtons.ts`) live as absolutely
 * positioned DOM nodes over the canvas. Scenes that lay out their boards must
 * keep board cells out from under those nodes, otherwise taps near the bottom
 * corners hit the playfield instead of the button.
 *
 * The numbers below mirror the sizes set in `VirtualButtons.applyLayout`. If
 * those sizes change, update this file too.
 */

export interface ButtonReserve {
  /** Extra pixels to keep clear at the top of the playfield. */
  top: number;
  /** Extra pixels to keep clear at the bottom of the playfield. */
  bottom: number;
  /** Extra pixels to keep clear at the left of the playfield. */
  left: number;
  /** Extra pixels to keep clear at the right of the playfield. */
  right: number;
}

const ZERO: ButtonReserve = { top: 0, bottom: 0, left: 0, right: 0 };

// Mirrors VirtualButtons.applyLayout: dpad cluster is 180px tall with a 24px
// bottom margin; swap (80) + 16 gap + raise (64) + 24 bottom margin = 184px.
const BOTTOM_CLEARANCE = 180 + 24 + 8;
// Pause is 44px tall with a 16px top margin.
const TOP_CLEARANCE = 44 + 16 + 8;
// Horizontal width of each cluster (dpad on one side, swap on the other).
const DPAD_WIDTH = 180 + 24;
const ACTIONS_WIDTH = 80 + 24;

function hasTouchInput(): boolean {
  if (typeof window === 'undefined') return false;
  if ('ontouchstart' in window) return true;
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
  return false;
}

/**
 * Returns the extra HUD reservations needed to keep the virtual buttons from
 * overlapping the playfield. Returns zeroes on non-touch devices.
 *
 * On portrait, the dpad + action cluster both sit at the bottom, so we reserve
 * a single bottom band tall enough for whichever cluster is bigger. On
 * landscape we keep a smaller bottom reservation and reserve horizontal space
 * on each side instead — the boards are wider than tall, so squeezing them
 * horizontally hurts less than chopping their bottom rows off.
 */
export function virtualButtonReserve(opts: { portrait: boolean }): ButtonReserve {
  if (!hasTouchInput()) return ZERO;
  if (opts.portrait) {
    return {
      top: TOP_CLEARANCE,
      bottom: BOTTOM_CLEARANCE,
      left: 0,
      right: 0,
    };
  }
  return {
    top: TOP_CLEARANCE,
    bottom: 24,
    left: DPAD_WIDTH,
    right: ACTIONS_WIDTH,
  };
}
