/**
 * InputController — central API for the input layer.
 *
 * Uniform events are emitted regardless of source device (keyboard, mouse,
 * touch, gamepad). Scenes subscribe via `on(event, handler)` and never need to
 * know what produced the event. Adapters are registered via factories that
 * receive an `emit` helper, so they don't keep a back-reference to the
 * controller and can be tested in isolation.
 */

export type InputEventName =
  | 'cursorMove'
  | 'cursorSet'
  | 'swap'
  | 'raisePress'
  | 'raiseRelease'
  | 'pause'
  | 'sourceChanged';

export type InputSource = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

export interface CursorMovePayload {
  dRow: number;
  dCol: number;
}

export interface CursorSetPayload {
  row: number;
  col: number;
}

export interface SourceChangedPayload {
  source: InputSource;
}

export interface InputAdapter {
  readonly name: InputSource;
  enable(): void;
  disable(): void;
  /** Optional per-frame poll (gamepad needs it). */
  update?(dtMs: number): void;
  destroy(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener<P = any> = (payload: P) => void;

export type EmitFn = (
  name: InputEventName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any,
  source?: InputSource,
) => void;

export type AdapterFactory = (emit: EmitFn) => InputAdapter;

export class InputController {
  private adapters: InputAdapter[] = [];
  private listeners: Map<InputEventName, Set<Listener>> = new Map();
  private _lastSource: InputSource = 'keyboard';

  /**
   * Register an adapter via a factory. The factory receives a bound `emit`
   * function the adapter calls to forward events to the controller. The
   * adapter is enabled by default so it is ready as soon as it is wired.
   */
  registerAdapter(factory: AdapterFactory): InputAdapter {
    const emit: EmitFn = (name, payload, source) => {
      this.emit(name, payload, source);
    };
    const adapter = factory(emit);
    this.adapters.push(adapter);
    return adapter;
  }

  /**
   * Subscribe to a uniform input event. Returns an unsubscribe function for
   * easy cleanup in scenes / React-style effects.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on<T = any>(name: InputEventName, fn: Listener<T>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn as Listener);
    return () => this.off(name, fn as Listener);
  }

  off(name: InputEventName, fn: Listener): void {
    const set = this.listeners.get(name);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this.listeners.delete(name);
  }

  /**
   * Emit an event to all subscribers. If a `source` is provided and differs
   * from the previously recorded source, a `sourceChanged` event is emitted
   * BEFORE the primary event so listeners can react to the device swap (e.g.
   * hide virtual buttons when keyboard is detected).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(name: InputEventName, payload?: any, source?: InputSource): void {
    if (source && source !== this._lastSource) {
      this._lastSource = source;
      this.dispatch('sourceChanged', { source } satisfies SourceChangedPayload);
    }
    this.dispatch(name, payload);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dispatch(name: InputEventName, payload?: any): void {
    const set = this.listeners.get(name);
    if (!set) return;
    // Copy to a temporary array so handlers calling `off()` mid-iteration are
    // safe, and so each handler's throw doesn't cancel the rest.
    const fns = Array.from(set);
    for (const fn of fns) {
      try {
        fn(payload);
      } catch (err) {
        // Swallow listener errors so one bad subscriber can't crash the input
        // dispatch loop. Surface them in the console for debugging.
        // eslint-disable-next-line no-console
        console.error(`[InputController] listener for "${name}" threw:`, err);
      }
    }
  }

  get lastSource(): InputSource {
    return this._lastSource;
  }

  /** Force the recorded last source. Useful for tests / explicit overrides. */
  setLastSource(source: InputSource): void {
    if (this._lastSource === source) return;
    this._lastSource = source;
    this.dispatch('sourceChanged', { source } satisfies SourceChangedPayload);
  }

  enableAll(): void {
    for (const a of this.adapters) a.enable();
  }

  disableAll(): void {
    for (const a of this.adapters) a.disable();
  }

  /** Per-frame update — drives polled adapters such as the gamepad. */
  update(dtMs: number): void {
    for (const a of this.adapters) a.update?.(dtMs);
  }

  destroy(): void {
    for (const a of this.adapters) {
      try {
        a.destroy();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[InputController] adapter "${a.name}" destroy threw:`, err);
      }
    }
    this.adapters = [];
    this.listeners.clear();
  }
}
