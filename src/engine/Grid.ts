import type { Block, Cell } from './types';

/**
 * Grid state container.
 *
 * Coordinate convention:
 *   - row 0 is the TOP row.
 *   - row (rows - 1) is the BOTTOM row.
 *   - Gravity makes blocks fall toward LARGER row indices.
 *   - The stack "rises" by shifting all rows up (toward SMALLER index) and
 *     adding a fresh row at the bottom (row = rows - 1).
 *   - `riseOffset` is the fractional progress toward the next rise step, in
 *     [0, 1). When it reaches 1 the engine performs a rise step and resets it.
 */
export class Grid {
  readonly rows: number;
  readonly cols: number;
  cells: Cell[][]; // [row][col]
  riseOffset: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      const row: Cell[] = new Array(cols).fill(null);
      this.cells.push(row);
    }
    this.riseOffset = 0;
  }

  get(row: number, col: number): Cell {
    if (!this.isInBounds(row, col)) return null;
    return this.cells[row][col];
  }

  set(row: number, col: number, cell: Cell): void {
    if (!this.isInBounds(row, col)) return;
    this.cells[row][col] = cell;
  }

  isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  isEmpty(row: number, col: number): boolean {
    if (!this.isInBounds(row, col)) return false;
    return this.cells[row][col] === null;
  }

  /**
   * Top-out detection: any idle block reaching row 0.
   * Blocks still animating (swapping/falling/clearing/landed) at row 0 are
   * tolerated, since the engine may resolve them on subsequent ticks.
   */
  hasTopout(): boolean {
    for (let c = 0; c < this.cols; c++) {
      const cell = this.cells[0][c];
      if (cell !== null && cell.state === 'idle') return true;
    }
    return false;
  }

  clone(): Grid {
    const copy = new Grid(this.rows, this.cols);
    copy.riseOffset = this.riseOffset;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r][c];
        if (cell === null) {
          copy.cells[r][c] = null;
        } else {
          const cloned: Block = {
            id: cell.id,
            color: cell.color,
            kind: cell.kind,
            state: cell.state,
            swapTimer: cell.swapTimer,
            clearTimer: cell.clearTimer,
            fallTimer: cell.fallTimer,
            swapDir: cell.swapDir,
            garbageGroupId: cell.garbageGroupId,
            garbageWidth: cell.garbageWidth,
            garbageHeight: cell.garbageHeight,
            unlocking: cell.unlocking,
            unlockTimer: cell.unlockTimer,
          };
          copy.cells[r][c] = cloned;
        }
      }
    }
    return copy;
  }
}
