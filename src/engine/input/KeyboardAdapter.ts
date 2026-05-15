/**
 * KeyboardAdapter — translates DOM keyboard events to uniform input events.
 *
 * Bindings are configurable via constructor options. Each logical action maps
 * to one or more `KeyboardEvent.code` values so layouts (QWERTY/AZERTY/Dvorak)
 * behave the same way for movement keys.
 */

import type { EmitFn, InputAdapter, InputSource } from './InputController';

export interface KeyBindings {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  swap: string[];
  raise: string[];
  pause: string[];
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  swap: ['Space', 'KeyZ'],
  raise: ['ShiftLeft', 'ShiftRight'],
  pause: ['KeyP', 'Escape'],
};

export interface KeyboardAdapterOptions {
  bindings?: Partial<KeyBindings>;
  /** Target to attach listeners on. Defaults to `window`. */
  target?: Window | HTMLElement;
}

const SOURCE: InputSource = 'keyboard';

export class KeyboardAdapter implements InputAdapter {
  readonly name: InputSource = SOURCE;
  private readonly emit: EmitFn;
  private readonly target: Window | HTMLElement;
  private readonly bindings: KeyBindings;
  private enabled = false;
  /** Tracks which `code` values are currently held to suppress key-repeat noise. */
  private readonly heldKeys: Set<string> = new Set();

  constructor(emit: EmitFn, opts: KeyboardAdapterOptions = {}) {
    this.emit = emit;
    this.target = opts.target ?? window;
    this.bindings = {
      ...DEFAULT_KEY_BINDINGS,
      ...opts.bindings,
    };
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.target.addEventListener('keydown', this.onKeyDown as EventListener);
    this.target.addEventListener('keyup', this.onKeyUp as EventListener);
    // If the page loses focus we may miss keyup events — clear held state on blur.
    window.addEventListener('blur', this.onBlur);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    window.removeEventListener('blur', this.onBlur);
    this.releaseAllHeld();
  }

  destroy(): void {
    this.disable();
    this.heldKeys.clear();
  }

  private onBlur = (): void => {
    this.releaseAllHeld();
  };

  private releaseAllHeld(): void {
    // Emit raiseRelease if shift was held when focus left, otherwise listeners
    // would see the raise stuck on. We don't try to re-fire other key states —
    // the user can resume by pressing them again.
    const hadRaise = this.bindings.raise.some((c) => this.heldKeys.has(c));
    this.heldKeys.clear();
    if (hadRaise) this.emit('raiseRelease', {}, SOURCE);
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.enabled) return;
    const code = ev.code;
    // Native key-repeat: filter so a held arrow doesn't fire `cursorMove` 30x/s.
    // The gamepad/virtual d-pad expose their own repeat timing; for keyboard we
    // keep it simple — discrete press = one move. Holding still moves once.
    if (this.heldKeys.has(code)) return;

    let handled = false;
    if (this.bindings.up.includes(code)) {
      this.emit('cursorMove', { dRow: -1, dCol: 0 }, SOURCE);
      handled = true;
    } else if (this.bindings.down.includes(code)) {
      this.emit('cursorMove', { dRow: 1, dCol: 0 }, SOURCE);
      handled = true;
    } else if (this.bindings.left.includes(code)) {
      this.emit('cursorMove', { dRow: 0, dCol: -1 }, SOURCE);
      handled = true;
    } else if (this.bindings.right.includes(code)) {
      this.emit('cursorMove', { dRow: 0, dCol: 1 }, SOURCE);
      handled = true;
    } else if (this.bindings.swap.includes(code)) {
      this.emit('swap', {}, SOURCE);
      handled = true;
    } else if (this.bindings.raise.includes(code)) {
      this.emit('raisePress', {}, SOURCE);
      handled = true;
    } else if (this.bindings.pause.includes(code)) {
      this.emit('pause', {}, SOURCE);
      handled = true;
    }

    if (handled) {
      this.heldKeys.add(code);
      // Stop the browser from scrolling on Space / arrows.
      ev.preventDefault();
    }
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    if (!this.enabled) return;
    const code = ev.code;
    if (!this.heldKeys.has(code)) return;
    this.heldKeys.delete(code);

    if (this.bindings.raise.includes(code)) {
      // Only emit release when no other raise key is still held.
      const stillHeld = this.bindings.raise.some((c) => this.heldKeys.has(c));
      if (!stillHeld) this.emit('raiseRelease', {}, SOURCE);
    }
  };
}
