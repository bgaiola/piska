/**
 * MouseAdapter — translates mouse events on the canvas to uniform input events.
 *
 * Hover sets the cursor via `cursorSet`; clicking a valid cell sets the cursor
 * there and immediately fires `swap`. Cell resolution is delegated to a
 * caller-provided function so this adapter stays agnostic of the game scene's
 * layout.
 */

import type { EmitFn, InputAdapter, InputSource } from './InputController';

export interface MouseAdapterOptions {
  canvas: HTMLElement;
  cellAt: (clientX: number, clientY: number) => { row: number; col: number } | null;
}

const SOURCE: InputSource = 'mouse';

export class MouseAdapter implements InputAdapter {
  readonly name: InputSource = SOURCE;
  private readonly emit: EmitFn;
  private readonly canvas: HTMLElement;
  private readonly cellAt: MouseAdapterOptions['cellAt'];
  private enabled = false;
  /** Last cell the cursor was reported at — avoids spamming `cursorSet`. */
  private lastCell: { row: number; col: number } | null = null;

  constructor(emit: EmitFn, opts: MouseAdapterOptions) {
    this.emit = emit;
    this.canvas = opts.canvas;
    this.cellAt = opts.cellAt;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.lastCell = null;
  }

  destroy(): void {
    this.disable();
  }

  private onMouseDown = (ev: MouseEvent): void => {
    if (!this.enabled) return;
    // Only react to the primary button so right/middle clicks don't trigger swaps.
    if (ev.button !== 0) return;
    const cell = this.cellAt(ev.clientX, ev.clientY);
    if (!cell) return;
    this.emit('cursorSet', cell, SOURCE);
    this.emit('swap', {}, SOURCE);
    this.lastCell = cell;
  };

  private onMouseMove = (ev: MouseEvent): void => {
    if (!this.enabled) return;
    const cell = this.cellAt(ev.clientX, ev.clientY);
    if (!cell) return;
    if (
      this.lastCell &&
      this.lastCell.row === cell.row &&
      this.lastCell.col === cell.col
    ) {
      return;
    }
    this.lastCell = cell;
    this.emit('cursorSet', cell, SOURCE);
  };

  private onMouseLeave = (): void => {
    // Clearing prevents a stale cell from being treated as "current" when the
    // pointer returns; we re-emit on the next move regardless.
    this.lastCell = null;
  };
}
