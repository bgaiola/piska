export type BlockColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'cyan';
export const ALL_COLORS: readonly BlockColor[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'cyan',
];

export type BlockState = 'idle' | 'swapping' | 'falling' | 'clearing' | 'landed';

/**
 * Whether a block is a normal colored panel or a Vs Mode garbage block.
 * Garbage blocks behave differently: they don't match by color, they unlock
 * when a colored match clears adjacent to them, and they cover one or more
 * grid cells (tracked via `garbageGroupId`).
 */
export type BlockKind = 'color' | 'garbage';

export interface Block {
  id: number;
  // For garbage blocks, this is a placeholder color used as the eventual
  // transform target when the garbage unlocks. The engine still uses the
  // ALL_COLORS palette.
  color: BlockColor;
  // Distinguishes plain colored panels from Vs Mode garbage. Defaults to
  // 'color' for blocks created by the engine; garbage blocks get 'garbage'.
  kind: BlockKind;
  state: BlockState;
  // Animation timers (ms). Engine advances them via tick(dt). Renderer reads them for interpolation.
  swapTimer: number; // ms remaining of swap animation
  clearTimer: number; // ms remaining before fully removed
  fallTimer: number; // ms accumulated of falling (engine moves blocks down when this hits FALL_STEP)
  // Direction it is swapping toward, if state==='swapping'. +1 = moved right, -1 = moved left, 0 = none.
  swapDir: -1 | 0 | 1;
  // ── Garbage-specific (only populated when kind === 'garbage') ────────────
  /** Shared id across all cells of the same garbage block, so the renderer
   *  can group them visually and the engine can unlock them together. */
  garbageGroupId?: number;
  /** Logical width in cells (1..cols). */
  garbageWidth?: number;
  /** Logical height in rows. */
  garbageHeight?: number;
  /** True while the garbage block is mid-transform into colored panels. */
  unlocking?: boolean;
  /** ms remaining of the unlock animation (per cell). */
  unlockTimer?: number;
}

export type Cell = Block | null;

export interface CellRef {
  row: number;
  col: number;
}

export type ScoreReason =
  | 'combo' // base points for blocks cleared in one match group
  | 'chain' // bonus for chain multiplier
  | 'combo_bonus'; // bonus for combo size >= 4

/** Total cells covered by a garbage piece (width * height). */
export type GarbageSize = number;

export interface GarbagePiece {
  id: number;
  width: number; // 1..cols
  height: number; // 1..cols (square or 1x wide)
}

export type EngineEvent =
  | { type: 'block.swapped'; row: number; colLeft: number; colRight: number }
  | { type: 'match.found'; cells: CellRef[]; comboSize: number; chain: number }
  | { type: 'chain.broken'; finalChain: number }
  | { type: 'rise.row'; colors: BlockColor[] }
  | { type: 'rise.tick'; offset: number } // offset in [0,1) showing how far the stack has risen toward next row
  | { type: 'game.over'; reason: 'topout' | 'cleared' }
  | { type: 'score.delta'; amount: number; reason: ScoreReason }
  | { type: 'garbage.queued'; piece: GarbagePiece }
  | { type: 'garbage.dropped'; piece: GarbagePiece; topRow: number; leftCol: number }
  | { type: 'garbage.unlocking'; groupId: number }
  | { type: 'garbage.cleared'; groupId: number }
  | { type: 'garbage.outgoing'; pieces: GarbagePiece[] };

export interface EngineConfig {
  rows: number; // logical grid rows (visible). default 12
  cols: number; // default 6
  numColors: 4 | 5 | 6;
  initialStackHeight: number; // rows pre-filled at bottom. default 5
  baseRiseSpeed: number; // fraction of one row per second. default 0.10
  swapDurationMs: number; // default 80
  clearDurationMs: number; // default 320 (allows pop animation)
  fallStepMs: number; // ms per row of falling. default 60
  rngSeed: number; // for deterministic block generation
  /** ms a garbage cell spends in the 'unlocking' phase before becoming colored. */
  garbageUnlockDurationMs: number; // default 600
  /** ms between an incoming garbage piece being queued and dropping onto the stack. */
  garbageDropDelayMs: number; // default 800
  /** Safety cap on queued garbage pieces. */
  maxQueuedGarbage: number; // default 8
}

export const DEFAULT_CONFIG: EngineConfig = {
  rows: 12,
  cols: 6,
  numColors: 5,
  initialStackHeight: 5,
  baseRiseSpeed: 0.1,
  swapDurationMs: 80,
  clearDurationMs: 320,
  fallStepMs: 60,
  rngSeed: 12345,
  garbageUnlockDurationMs: 600,
  // 1500ms is long enough that the player can see the telegraph appear above
  // their board (in Vs Mode) and plan a defensive match before the piece lands.
  garbageDropDelayMs: 1500,
  maxQueuedGarbage: 8,
};
