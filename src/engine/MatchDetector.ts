import type { Grid } from './Grid';
import type { Block, CellRef } from './types';

export interface MatchGroup {
  cells: CellRef[]; // all cells in the group (unioned across H and V runs)
}

/**
 * Returns the block at (row, col) iff it counts as a "matchable" block:
 * - non-null
 * - in 'idle' or 'landed' state
 * - a colored block (not garbage — garbage clears via adjacency, not matching)
 *
 * Blocks that are swapping, falling, or clearing are explicitly ignored.
 */
function matchable(grid: Grid, row: number, col: number): Block | null {
  const cell = grid.get(row, col);
  if (cell === null) return null;
  if (cell.state !== 'idle' && cell.state !== 'landed') return null;
  if (cell.kind === 'garbage') return null;
  return cell;
}

/**
 * Scans the grid for runs of >=3 same-color matchable blocks horizontally and
 * vertically. Unioned overlapping runs (e.g. T/L/+ shapes) collapse into a
 * single group via a simple BFS over shared cells.
 */
export function findMatches(grid: Grid): MatchGroup[] {
  const runs: CellRef[][] = [];

  // Horizontal runs.
  for (let r = 0; r < grid.rows; r++) {
    let runStart = 0;
    let runColor: string | null = null;
    let runLen = 0;
    for (let c = 0; c <= grid.cols; c++) {
      const block = c < grid.cols ? matchable(grid, r, c) : null;
      const color = block ? block.color : null;
      if (color !== null && color === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 3 && runColor !== null) {
          const cells: CellRef[] = [];
          for (let cc = runStart; cc < runStart + runLen; cc++) {
            cells.push({ row: r, col: cc });
          }
          runs.push(cells);
        }
        runStart = c;
        runColor = color;
        runLen = color === null ? 0 : 1;
      }
    }
  }

  // Vertical runs.
  for (let c = 0; c < grid.cols; c++) {
    let runStart = 0;
    let runColor: string | null = null;
    let runLen = 0;
    for (let r = 0; r <= grid.rows; r++) {
      const block = r < grid.rows ? matchable(grid, r, c) : null;
      const color = block ? block.color : null;
      if (color !== null && color === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 3 && runColor !== null) {
          const cells: CellRef[] = [];
          for (let rr = runStart; rr < runStart + runLen; rr++) {
            cells.push({ row: rr, col: c });
          }
          runs.push(cells);
        }
        runStart = r;
        runColor = color;
        runLen = color === null ? 0 : 1;
      }
    }
  }

  if (runs.length === 0) return [];

  // Union overlapping runs. Two runs belong to the same group iff they share at
  // least one (row, col) cell. We do this with a small Union-Find keyed by run
  // index.
  const parent: number[] = runs.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Map "row,col" -> first run index that contained it. Whenever a subsequent
  // run touches the same cell, union the two runs.
  const cellOwner = new Map<string, number>();
  for (let i = 0; i < runs.length; i++) {
    for (const ref of runs[i]) {
      const key = `${ref.row},${ref.col}`;
      const existing = cellOwner.get(key);
      if (existing === undefined) {
        cellOwner.set(key, i);
      } else {
        union(existing, i);
      }
    }
  }

  // Collect cells per group root, deduped by (row, col).
  const groupsByRoot = new Map<number, Map<string, CellRef>>();
  for (let i = 0; i < runs.length; i++) {
    const root = find(i);
    let bucket = groupsByRoot.get(root);
    if (!bucket) {
      bucket = new Map<string, CellRef>();
      groupsByRoot.set(root, bucket);
    }
    for (const ref of runs[i]) {
      const key = `${ref.row},${ref.col}`;
      if (!bucket.has(key)) bucket.set(key, ref);
    }
  }

  const result: MatchGroup[] = [];
  for (const bucket of groupsByRoot.values()) {
    result.push({ cells: Array.from(bucket.values()) });
  }
  return result;
}
