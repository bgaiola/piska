/**
 * TouchAdapter — translates pointer (touch) events to uniform input events.
 *
 * Supports three gestures:
 *   1. Tap: short press + short movement on the same cell → `cursorSet` + `swap`.
 *   2. Quick horizontal swipe between two adjacent cells (< 250ms) → `cursorSet`
 *      anchored at the left of the pair + `swap`.
 *   3. Drag: longer horizontal movement (≥ half a cell) → `cursorSet` at the
 *      start cell + a single `swap` per drag.
 *
 * Uses pointer events filtered by `pointerType === 'touch'` so the same DOM
 * stream coexists with the MouseAdapter (which listens on `mouse*` events).
 */

import type { EmitFn, InputAdapter, InputSource } from './InputController';
import { haptic, HAPTIC } from '@/utils/haptics';

export interface TouchAdapterOptions {
  canvas: HTMLElement;
  cellAt: (clientX: number, clientY: number) => { row: number; col: number } | null;
  /** Current on-screen cell size in CSS pixels — used for gesture thresholds. */
  cellSizePx: () => number;
  /** Emit `navigator.vibrate(15)` on swap (default true). */
  enableHaptics?: boolean;
}

const SOURCE: InputSource = 'touch';
const TAP_MAX_DURATION_MS = 200;
const TAP_MAX_MOVE_PX = 8;
const SWIPE_MAX_DURATION_MS = 250;
const DRAG_MIN_MOVE_PX = 12;

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  startCell: { row: number; col: number } | null;
  /** True once we've decided this gesture is a drag (and emitted cursorSet). */
  isDrag: boolean;
  /** True once a swap has been emitted for this gesture (prevents duplicate). */
  swapped: boolean;
}

export class TouchAdapter implements InputAdapter {
  readonly name: InputSource = SOURCE;
  private readonly emit: EmitFn;
  private readonly canvas: HTMLElement;
  private readonly cellAt: TouchAdapterOptions['cellAt'];
  private readonly cellSizePx: () => number;
  private readonly haptics: boolean;
  private enabled = false;
  private active: ActivePointer | null = null;

  constructor(emit: EmitFn, opts: TouchAdapterOptions) {
    this.emit = emit;
    this.canvas = opts.canvas;
    this.cellAt = opts.cellAt;
    this.cellSizePx = opts.cellSizePx;
    this.haptics = opts.enableHaptics ?? true;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    // `passive: false` because we call preventDefault to suppress page scroll.
    const opts: AddEventListenerOptions = { passive: false };
    this.canvas.addEventListener('pointerdown', this.onPointerDown, opts);
    this.canvas.addEventListener('pointermove', this.onPointerMove, opts);
    this.canvas.addEventListener('pointerup', this.onPointerUp, opts);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel, opts);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.active = null;
  }

  destroy(): void {
    this.disable();
  }

  private isTouch(ev: PointerEvent): boolean {
    return ev.pointerType === 'touch';
  }

  private fireSwap(): void {
    this.emit('swap', {}, SOURCE);
    if (this.haptics) haptic(HAPTIC.swap);
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.enabled || !this.isTouch(ev)) return;
    // Only track one touch at a time — multi-finger gestures aren't part of the
    // game's mechanics, and tracking the first finger keeps interaction simple.
    if (this.active) return;
    ev.preventDefault();
    this.active = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      startTime: performance.now(),
      startCell: this.cellAt(ev.clientX, ev.clientY),
      isDrag: false,
      swapped: false,
    };
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.enabled || !this.isTouch(ev)) return;
    const a = this.active;
    if (!a || a.id !== ev.pointerId) return;
    ev.preventDefault();

    const dx = ev.clientX - a.startX;
    const dy = ev.clientY - a.startY;
    const absDx = Math.abs(dx);
    const elapsed = performance.now() - a.startTime;

    // --- Swipe between two adjacent cells (quick + short distance). ---
    if (
      !a.swapped &&
      a.startCell &&
      elapsed <= SWIPE_MAX_DURATION_MS &&
      absDx >= DRAG_MIN_MOVE_PX
    ) {
      const current = this.cellAt(ev.clientX, ev.clientY);
      if (
        current &&
        current.row === a.startCell.row &&
        Math.abs(current.col - a.startCell.col) === 1
      ) {
        const leftCol = Math.min(a.startCell.col, current.col);
        this.emit('cursorSet', { row: a.startCell.row, col: leftCol }, SOURCE);
        this.fireSwap();
        a.swapped = true;
        a.isDrag = true;
        return;
      }
    }

    // --- Longer horizontal drag → set cursor to start cell, swap once when
    //     movement exceeds half a cell width.
    if (!a.swapped && a.startCell) {
      const cellSize = Math.max(1, this.cellSizePx());
      const threshold = cellSize * 0.5;
      if (absDx >= threshold && absDx > Math.abs(dy)) {
        this.emit('cursorSet', a.startCell, SOURCE);
        this.fireSwap();
        a.swapped = true;
        a.isDrag = true;
      }
    }
  };

  private onPointerUp = (ev: PointerEvent): void => {
    if (!this.enabled || !this.isTouch(ev)) return;
    const a = this.active;
    if (!a || a.id !== ev.pointerId) return;
    ev.preventDefault();

    const dx = ev.clientX - a.startX;
    const dy = ev.clientY - a.startY;
    const elapsed = performance.now() - a.startTime;
    const moved = Math.hypot(dx, dy);

    // Tap = short + still — emit set + swap if it landed on a valid cell.
    if (
      !a.isDrag &&
      !a.swapped &&
      elapsed <= TAP_MAX_DURATION_MS &&
      moved <= TAP_MAX_MOVE_PX
    ) {
      const cell = this.cellAt(ev.clientX, ev.clientY);
      if (cell) {
        this.emit('cursorSet', cell, SOURCE);
        this.fireSwap();
      }
    }

    this.active = null;
  };

  private onPointerCancel = (ev: PointerEvent): void => {
    if (!this.enabled || !this.isTouch(ev)) return;
    const a = this.active;
    if (!a || a.id !== ev.pointerId) return;
    this.active = null;
  };
}
