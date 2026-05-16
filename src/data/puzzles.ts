/**
 * Hand-authored puzzles for PISKA's Puzzle mode.
 *
 * Each puzzle is a fixed 8 × 6 grid (top rows empty, blocks anchored at the
 * bottom) plus a `movesAllowed` swap budget. Solving it means clearing every
 * block before running out of swaps. Stars are awarded by PuzzleMode:
 *
 *   3 stars: solved using ≤ movesAllowed - 2 swaps (optimal or close to it)
 *   2 stars: solved using movesAllowed - 1 swaps
 *   1 star : solved using movesAllowed swaps
 *
 * Layouts are written in `rows`, top-to-bottom, so the visual matches the
 * comment in each definition. `null` = empty cell; otherwise a BlockColor.
 */

import type { BlockColor } from '@/engine';

export type PuzzleCell = BlockColor | null;

export interface PuzzleDef {
  id: string;
  name: string;
  /** Suggested colour budget for the picker UI. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** 8 rows × 6 cols, top-to-bottom. Trailing empty rows can be omitted. */
  rows: PuzzleCell[][];
  movesAllowed: number;
}

const PUZZLE_ROWS = 8;
const PUZZLE_COLS = 6;

function padRows(rows: PuzzleCell[][]): PuzzleCell[][] {
  const empty: PuzzleCell[] = Array<PuzzleCell>(PUZZLE_COLS).fill(null);
  const out: PuzzleCell[][] = [];
  for (let r = 0; r < PUZZLE_ROWS; r++) {
    const src = rows[r];
    if (!src) {
      out.push(empty.slice());
      continue;
    }
    const padded = src.slice();
    while (padded.length < PUZZLE_COLS) padded.push(null);
    out.push(padded);
  }
  return out;
}

// Shorthand to keep puzzle bodies compact and visually obvious.
const R: PuzzleCell = 'red';
const B: PuzzleCell = 'blue';
const G: PuzzleCell = 'green';
const Y: PuzzleCell = 'yellow';
const P: PuzzleCell = 'purple';
const C: PuzzleCell = 'cyan';
const _: PuzzleCell = null;

const RAW: PuzzleDef[] = [
  {
    id: 'p1-the-line',
    name: 'A Linha',
    difficulty: 1,
    movesAllowed: 3,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, R, _, _, _, _],
      [_, R, _, _, G, G],
      [B, R, B, G, B, G],
    ],
  },
  {
    id: 'p2-two-pairs',
    name: 'Dois Pares',
    difficulty: 1,
    movesAllowed: 3,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, R, _, _, _],
      [_, B, R, _, _, _],
      [_, B, B, R, _, _],
      [Y, Y, Y, R, _, _],
    ],
  },
  {
    id: 'p3-stairs',
    name: 'Escadas',
    difficulty: 2,
    movesAllowed: 4,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, G],
      [_, _, _, _, R, G],
      [_, _, _, B, R, G],
      [_, _, Y, B, R, _],
      [_, Y, Y, B, _, _],
    ],
  },
  {
    id: 'p4-sandwich',
    name: 'Sanduíche',
    difficulty: 2,
    movesAllowed: 4,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, R, R, _, _],
      [_, B, R, B, B, _],
      [_, B, Y, B, Y, _],
      [Y, Y, Y, B, R, R],
    ],
  },
  {
    id: 'p5-bridge',
    name: 'Ponte',
    difficulty: 3,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, P, _, _, _],
      [_, _, P, _, R, _],
      [_, G, P, B, R, _],
      [G, G, B, B, R, Y],
      [P, P, B, Y, Y, Y],
    ],
  },
  {
    id: 'p6-cross',
    name: 'Cruz',
    difficulty: 3,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, R, _, _],
      [_, _, _, R, _, _],
      [_, B, _, R, _, _],
      [G, B, _, B, _, _],
      [G, B, R, B, G, _],
      [G, Y, Y, Y, G, G],
    ],
  },
  {
    id: 'p7-spiral',
    name: 'Espiral',
    difficulty: 4,
    movesAllowed: 6,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, C, _, _, _, _],
      [_, C, P, P, _, _],
      [_, B, C, P, _, _],
      [_, B, R, R, P, _],
      [G, B, Y, R, C, _],
      [G, G, Y, Y, C, C],
    ],
  },
  {
    id: 'p8-pyramid',
    name: 'Pirâmide',
    difficulty: 5,
    movesAllowed: 7,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, P, _, _],
      [_, _, C, P, P, _],
      [_, B, C, R, P, _],
      [Y, B, C, R, G, _],
      [Y, B, R, R, G, _],
      [Y, Y, B, G, G, P],
    ],
  },
  // ──────────────────────────────────────────────────────────────────────
  // Easy (3-4 moves, 4 colors). 1-2 swaps. The pattern is "pre-stacked
  // vertical 3-runs auto-clear, then one or two horizontal slides finish
  // the rest" — beginner-friendly intros to swap timing.
  // ──────────────────────────────────────────────────────────────────────
  // Solution: col 2 R-R-R auto-clears on tick 1. Player swap (7,2)↔(7,3)
  // brings B into the row-7 gap so B-B-B at cols 1,2,3 clears. 1 swap.
  {
    id: 'p9-beijo',
    name: 'Beijo',
    difficulty: 1,
    movesAllowed: 3,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, R, _, _, _],
      [_, _, R, _, _, _],
      [B, B, R, B, _, _],
    ],
  },
  // Solution: col 5 R-R-R auto-clears on tick 1. Player swap (7,2)↔(7,3)
  // closes the G gap so G-G-G at cols 0,1,2 clears. 1 swap.
  {
    id: 'p10-trio',
    name: 'Trio',
    difficulty: 1,
    movesAllowed: 3,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, R],
      [_, _, _, _, _, R],
      [G, G, _, G, _, R],
    ],
  },
  // Solution: two dual-vertical-match swaps. Swap (7,0)↔(7,1) makes
  // col 0 R-R-R and col 1 B-B-B clear at once. Swap (7,4)↔(7,5) makes
  // col 4 G-G-G and col 5 Y-Y-Y clear. 2 swaps.
  {
    id: 'p11-quarteto',
    name: 'Quarteto',
    difficulty: 1,
    movesAllowed: 4,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [R, B, _, _, G, Y],
      [R, B, _, _, G, Y],
      [B, R, _, _, Y, G],
    ],
  },
  // Solution: same dual-vertical-match pattern shifted one column right.
  // Swap (7,1)↔(7,2) and swap (7,4)↔(7,5). 2 swaps.
  {
    id: 'p12-pingo',
    name: 'Pingo',
    difficulty: 1,
    movesAllowed: 4,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, R, B, _, G, Y],
      [_, R, B, _, G, Y],
      [_, B, R, _, Y, G],
    ],
  },
  // ──────────────────────────────────────────────────────────────────────
  // Medium (4-5 moves, 5 colors). 2-3 dual-vertical-match swaps. One
  // optional auto-clearing column for visual flair.
  // ──────────────────────────────────────────────────────────────────────
  // Solution: col 5 Y-Y-Y auto-clears on tick 1. Then swap (7,0)↔(7,1)
  // (R col 0 + B col 1) and swap (7,3)↔(7,4) (G col 3 + P col 4). 2 swaps.
  {
    id: 'p13-cantos',
    name: 'Cantos',
    difficulty: 2,
    movesAllowed: 4,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [R, B, _, G, P, Y],
      [R, B, _, G, P, Y],
      [B, R, _, P, G, Y],
    ],
  },
  // Solution: three dual-vertical-match swaps. (7,0)↔(7,1) clears
  // R+B cols. (7,2)↔(7,3) clears G+P. (7,4)↔(7,5) clears Y+C. 3 swaps,
  // six colors.
  {
    id: 'p14-vidraca',
    name: 'Vidraça',
    difficulty: 2,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [R, B, G, P, Y, C],
      [R, B, G, P, Y, C],
      [B, R, P, G, C, Y],
    ],
  },
  // Solution: three dual-vertical-match swaps with rotated color palette.
  // (7,0)↔(7,1) clears C+P, (7,2)↔(7,3) clears R+B, (7,4)↔(7,5) clears
  // Y+G. 3 swaps.
  {
    id: 'p15-travesseiro',
    name: 'Travesseiro',
    difficulty: 2,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [C, P, R, B, Y, G],
      [C, P, R, B, Y, G],
      [P, C, B, R, G, Y],
    ],
  },
  // Solution: three dual-vertical-match swaps, palette rotated again so
  // the picker reads as a fresh puzzle. 3 swaps.
  {
    id: 'p16-prisma',
    name: 'Prisma',
    difficulty: 2,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [B, R, P, G, C, Y],
      [B, R, P, G, C, Y],
      [R, B, G, P, Y, C],
    ],
  },
  // ──────────────────────────────────────────────────────────────────────
  // Hard (5-6 moves, 5-6 colors). 3 dual-vertical swaps; one variant
  // (p20) includes an extra pre-clear column that auto-collapses for a
  // cascade-y opening.
  // ──────────────────────────────────────────────────────────────────────
  // Solution: three dual-vertical-match swaps, alternative palette
  // (Y/G/R/B/P/C). 3 swaps.
  {
    id: 'p17-labirinto',
    name: 'Labirinto',
    difficulty: 3,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [Y, G, R, B, P, C],
      [Y, G, R, B, P, C],
      [G, Y, B, R, C, P],
    ],
  },
  // Solution: three dual-vertical-match swaps. Same mechanic, harder
  // visual mix (greens/cyans dominant).
  {
    id: 'p18-rede',
    name: 'Rede',
    difficulty: 3,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [G, C, B, P, R, Y],
      [G, C, B, P, R, Y],
      [C, G, P, B, Y, R],
    ],
  },
  // Solution: three dual-vertical-match swaps with another rotation.
  {
    id: 'p19-tear',
    name: 'Tear',
    difficulty: 3,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [P, Y, C, R, B, G],
      [P, Y, C, R, B, G],
      [Y, P, R, C, G, B],
    ],
  },
  // Solution: three dual-vertical-match swaps. Different palette mix
  // than p17-p19 so the picker reads as a distinct entry.
  {
    id: 'p20-vortex',
    name: 'Vórtice',
    difficulty: 3,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [C, R, G, Y, B, P],
      [C, R, G, Y, B, P],
      [R, C, Y, G, P, B],
    ],
  },
  // ──────────────────────────────────────────────────────────────────────
  // Expert (6-7 moves, 6 colors). 3 dual-vertical swaps + the same
  // catalog mechanic. Tightened movesAllowed so 3-star is always
  // optimal = 3 swaps.
  // ──────────────────────────────────────────────────────────────────────
  // Solution: three dual-vertical-match swaps. 6 colors, rotated.
  {
    id: 'p21-cascata',
    name: 'Cascata',
    difficulty: 4,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [B, G, Y, C, P, R],
      [B, G, Y, C, P, R],
      [G, B, C, Y, R, P],
    ],
  },
  // Solution: three dual-vertical-match swaps; the palette assignment
  // mirrors Cascata for a Cassino-pair feel.
  {
    id: 'p22-engrenagem',
    name: 'Engrenagem',
    difficulty: 4,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [P, C, Y, G, R, B],
      [P, C, Y, G, R, B],
      [C, P, G, Y, B, R],
    ],
  },
  // Solution: three dual-vertical-match swaps with a final palette
  // rotation. Same difficulty contract as the rest of Expert.
  {
    id: 'p23-galaxia',
    name: 'Galáxia',
    difficulty: 4,
    movesAllowed: 5,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [Y, B, P, C, G, R],
      [Y, B, P, C, G, R],
      [B, Y, C, P, R, G],
    ],
  },
  // ──────────────────────────────────────────────────────────────────────
  // Master (4 moves, 6 colors). The capstone uses CHAIN x2 mechanics:
  // each player swap clears the bottom dual-vertical-match AND triggers
  // a horizontal-three match at row 7 from the fallen top blocks. Both
  // swaps are chain triggers, so optimal play is 2 swaps for a chain x2
  // x 2 — visually distinct from the rest of the catalog.
  // ──────────────────────────────────────────────────────────────────────
  // Solution:
  //   Swap (7,0)↔(7,1): col 0 R-R-R + col 1 B-B-B match (chain 1). Top
  //     G/G fall onto the loose G at (7,2) → row 7 G-G-G horizontal
  //     match (chain 2).
  //   Swap (7,4)↔(7,5): col 4 P-P-P + col 5 Y-Y-Y match (chain 1). Top
  //     C/C fall onto the loose C at (7,3) → row 7 C-C-C horizontal
  //     match (chain 2).
  //   Two swaps total; 3-star bar is movesAllowed - 2 = 2.
  {
    id: 'p24-arquiteto',
    name: 'Arquiteto',
    difficulty: 5,
    movesAllowed: 4,
    rows: [
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [_, _, _, _, _, _],
      [G, G, _, _, C, C],
      [R, B, _, _, P, Y],
      [R, B, _, _, P, Y],
      [B, R, G, C, Y, P],
    ],
  },
];

export const PUZZLES: readonly PuzzleDef[] = RAW.map((p) => ({
  ...p,
  rows: padRows(p.rows),
}));

export function getPuzzleById(id: string): PuzzleDef | undefined {
  return PUZZLES.find((p) => p.id === id);
}

export const PUZZLE_ROWS_COUNT = PUZZLE_ROWS;
export const PUZZLE_COLS_COUNT = PUZZLE_COLS;
