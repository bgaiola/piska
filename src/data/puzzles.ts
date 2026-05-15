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
