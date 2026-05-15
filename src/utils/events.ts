/**
 * Tiny typed event bus. Listeners receive every emitted event; filtering is the
 * subscriber's responsibility (typically a `switch` on `e.type`).
 */
export class EventBus<T extends { type: string }> {
  private listeners: Array<(e: T) => void> = [];

  /**
   * Subscribe to events. Returns an unsubscribe function.
   */
  on(fn: (e: T) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  emit(e: T): void {
    // Iterate over a snapshot so subscribers can safely unsubscribe during dispatch.
    const snapshot = this.listeners.slice();
    for (const fn of snapshot) {
      fn(e);
    }
  }

  clear(): void {
    this.listeners.length = 0;
  }
}
