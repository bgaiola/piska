/**
 * GamepadAdapter — polls the Web Gamepad API and emits uniform input events.
 *
 * The Gamepad API is poll-based (browsers don't fire events for stick / button
 * state), so this adapter implements `update(dtMs)` to advance internal timers
 * for hold-to-repeat directional movement.
 */

import type { EmitFn, InputAdapter, InputSource } from './InputController';

const SOURCE: InputSource = 'gamepad';

// Standard gamepad mapping (W3C). These constants describe the index in
// `Gamepad.buttons`.
const BTN_A = 0; // Swap (Xbox A / PS X / Nintendo B-position)
const BTN_B = 1; // Raise (Xbox B / PS Circle)
const BTN_SELECT = 8;
const BTN_START = 9;
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

const STICK_DEADZONE = 0.4;
const REPEAT_INITIAL_MS = 200;
const REPEAT_INTERVAL_MS = 80;

type Direction = 'up' | 'down' | 'left' | 'right';
const ALL_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

interface DirState {
  /** True while the direction is currently held this frame. */
  held: boolean;
  /** True if it was held the previous frame (for edge detection). */
  heldPrev: boolean;
  /** Milliseconds until the next repeat fire. */
  repeatTimerMs: number;
}

export interface GamepadAdapterOptions {
  /** Optional override for navigator.getGamepads (useful for tests). */
  getGamepads?: () => (Gamepad | null)[];
}

export class GamepadAdapter implements InputAdapter {
  readonly name: InputSource = SOURCE;
  private readonly emit: EmitFn;
  private readonly getGamepads: () => (Gamepad | null)[];
  private enabled = false;
  /** Index of the active gamepad, or null if none. */
  private activeIndex: number | null = null;
  private readonly directions: Record<Direction, DirState>;
  /** Previous edge-triggered button states, keyed by button index. */
  private readonly btnPrev: Map<number, boolean> = new Map();

  constructor(emit: EmitFn, opts: GamepadAdapterOptions = {}) {
    this.emit = emit;
    this.getGamepads =
      opts.getGamepads ??
      (() => {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
        return Array.from(navigator.getGamepads());
      });
    this.directions = {
      up: { held: false, heldPrev: false, repeatTimerMs: 0 },
      down: { held: false, heldPrev: false, repeatTimerMs: 0 },
      left: { held: false, heldPrev: false, repeatTimerMs: 0 },
      right: { held: false, heldPrev: false, repeatTimerMs: 0 },
    };
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('gamepadconnected', this.onConnected);
    window.addEventListener('gamepaddisconnected', this.onDisconnected);
    // Pick up any already-connected pad on enable.
    this.scanForFirstGamepad();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('gamepadconnected', this.onConnected);
    window.removeEventListener('gamepaddisconnected', this.onDisconnected);
    this.releaseAll();
    this.activeIndex = null;
  }

  destroy(): void {
    this.disable();
    this.btnPrev.clear();
  }

  update(dtMs: number): void {
    if (!this.enabled) return;
    const pad = this.activeGamepad();
    if (!pad) {
      this.releaseAll();
      return;
    }

    // --- Direction state from D-pad OR left stick. ---
    const axX = pad.axes[0] ?? 0;
    const axY = pad.axes[1] ?? 0;
    const dpadUp = pad.buttons[BTN_DPAD_UP]?.pressed ?? false;
    const dpadDown = pad.buttons[BTN_DPAD_DOWN]?.pressed ?? false;
    const dpadLeft = pad.buttons[BTN_DPAD_LEFT]?.pressed ?? false;
    const dpadRight = pad.buttons[BTN_DPAD_RIGHT]?.pressed ?? false;

    this.directions.up.held = dpadUp || axY <= -STICK_DEADZONE;
    this.directions.down.held = dpadDown || axY >= STICK_DEADZONE;
    this.directions.left.held = dpadLeft || axX <= -STICK_DEADZONE;
    this.directions.right.held = dpadRight || axX >= STICK_DEADZONE;

    for (const dir of ALL_DIRECTIONS) {
      const s = this.directions[dir];
      if (s.held && !s.heldPrev) {
        // Fresh press → emit immediately and arm the initial delay.
        this.emitDirection(dir);
        s.repeatTimerMs = REPEAT_INITIAL_MS;
      } else if (s.held && s.heldPrev) {
        s.repeatTimerMs -= dtMs;
        if (s.repeatTimerMs <= 0) {
          this.emitDirection(dir);
          s.repeatTimerMs = REPEAT_INTERVAL_MS;
        }
      } else if (!s.held && s.heldPrev) {
        // Released — reset timer so the next press fires the initial delay.
        s.repeatTimerMs = 0;
      }
      s.heldPrev = s.held;
    }

    // --- Edge-triggered action buttons. ---
    this.handleEdge(pad, BTN_A, () => this.emit('swap', {}, SOURCE));
    this.handleHold(
      pad,
      BTN_B,
      () => this.emit('raisePress', {}, SOURCE),
      () => this.emit('raiseRelease', {}, SOURCE),
    );
    this.handleEdge(pad, BTN_START, () => this.emit('pause', {}, SOURCE));
    this.handleEdge(pad, BTN_SELECT, () => this.emit('pause', {}, SOURCE));
  }

  private emitDirection(dir: Direction): void {
    switch (dir) {
      case 'up':
        this.emit('cursorMove', { dRow: -1, dCol: 0 }, SOURCE);
        return;
      case 'down':
        this.emit('cursorMove', { dRow: 1, dCol: 0 }, SOURCE);
        return;
      case 'left':
        this.emit('cursorMove', { dRow: 0, dCol: -1 }, SOURCE);
        return;
      case 'right':
        this.emit('cursorMove', { dRow: 0, dCol: 1 }, SOURCE);
        return;
    }
  }

  /** Fire `onPress` on the rising edge of a button. */
  private handleEdge(pad: Gamepad, index: number, onPress: () => void): void {
    const pressed = pad.buttons[index]?.pressed ?? false;
    const prev = this.btnPrev.get(index) ?? false;
    if (pressed && !prev) onPress();
    this.btnPrev.set(index, pressed);
  }

  /** Fire `onPress` on rising edge and `onRelease` on falling edge. */
  private handleHold(
    pad: Gamepad,
    index: number,
    onPress: () => void,
    onRelease: () => void,
  ): void {
    const pressed = pad.buttons[index]?.pressed ?? false;
    const prev = this.btnPrev.get(index) ?? false;
    if (pressed && !prev) onPress();
    else if (!pressed && prev) onRelease();
    this.btnPrev.set(index, pressed);
  }

  private activeGamepad(): Gamepad | null {
    if (this.activeIndex === null) {
      this.scanForFirstGamepad();
      if (this.activeIndex === null) return null;
    }
    const pads = this.getGamepads();
    const pad = pads[this.activeIndex] ?? null;
    if (!pad || !pad.connected) {
      // The pad we were tracking went away — try to find another.
      this.activeIndex = null;
      this.scanForFirstGamepad();
      if (this.activeIndex === null) return null;
      return this.getGamepads()[this.activeIndex] ?? null;
    }
    return pad;
  }

  private scanForFirstGamepad(): void {
    const pads = this.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        this.activeIndex = i;
        return;
      }
    }
    this.activeIndex = null;
  }

  private releaseAll(): void {
    // If raise was held when the gamepad disconnected, emit release so the
    // engine doesn't get stuck thinking the stack should keep rising.
    if (this.btnPrev.get(BTN_B)) {
      this.emit('raiseRelease', {}, SOURCE);
    }
    this.btnPrev.clear();
    for (const dir of ALL_DIRECTIONS) {
      const s = this.directions[dir];
      s.held = false;
      s.heldPrev = false;
      s.repeatTimerMs = 0;
    }
  }

  private onConnected = (ev: GamepadEvent): void => {
    if (this.activeIndex === null) {
      this.activeIndex = ev.gamepad.index;
    }
  };

  private onDisconnected = (ev: GamepadEvent): void => {
    if (this.activeIndex === ev.gamepad.index) {
      this.activeIndex = null;
      this.releaseAll();
    }
  };
}
