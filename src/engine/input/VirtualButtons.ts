/**
 * VirtualButtons — DOM-based on-screen controls for touch devices.
 *
 * Renders a swap button, a raise button, a D-pad cluster and a pause button.
 * All emits are tagged as `'touch'`. Hold-to-repeat on the D-pad matches the
 * gamepad's timing for consistent feel across input sources.
 */

import type { EmitFn, InputEventName } from './InputController';

export interface VirtualButtonsOptions {
  container: HTMLElement;
  /** Dominant hand. Swap goes on this side, D-pad on the opposite. */
  side?: 'right' | 'left';
}

const REPEAT_INITIAL_MS = 200;
const REPEAT_INTERVAL_MS = 80;

// Local emit shape — virtual buttons only need name + payload, source is
// always 'touch' from this surface.
type LocalEmit = (name: InputEventName, payload?: unknown) => void;

interface DpadButton {
  el: HTMLButtonElement;
  dRow: number;
  dCol: number;
  timer: number | null;
  initialTimer: number | null;
}

export class VirtualButtons {
  private readonly container: HTMLElement;
  private readonly emit: LocalEmit;
  private side: 'right' | 'left';
  private root: HTMLDivElement;
  private swapBtn: HTMLButtonElement;
  private raiseBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private dpadRoot: HTMLDivElement;
  private dpadButtons: DpadButton[] = [];
  private destroyed = false;

  constructor(opts: VirtualButtonsOptions, emit: EmitFn) {
    this.container = opts.container;
    this.side = opts.side ?? 'right';
    // Wrap the EmitFn so every event is tagged 'touch'.
    this.emit = (name, payload) => emit(name, payload, 'touch');

    this.root = document.createElement('div');
    this.root.className = 'piska-vb-root';
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';

    this.swapBtn = this.makeButton('A', ['piska-vb', 'piska-vb-swap']);
    this.swapBtn.style.width = '80px';
    this.swapBtn.style.height = '80px';

    this.raiseBtn = this.makeButton('R', ['piska-vb', 'piska-vb-raise']);
    this.raiseBtn.style.width = '64px';
    this.raiseBtn.style.height = '64px';

    this.pauseBtn = this.makeButton('II', ['piska-vb', 'piska-vb-pause']);
    this.pauseBtn.style.width = '40px';
    this.pauseBtn.style.height = '40px';

    this.dpadRoot = document.createElement('div');
    this.dpadRoot.className = 'piska-vb-dpad';
    this.dpadRoot.style.position = 'absolute';
    this.dpadRoot.style.width = '180px';
    this.dpadRoot.style.height = '180px';
    this.dpadRoot.style.pointerEvents = 'none';

    this.buildDpad();
    this.applyLayout();

    this.root.appendChild(this.swapBtn);
    this.root.appendChild(this.raiseBtn);
    this.root.appendChild(this.pauseBtn);
    this.root.appendChild(this.dpadRoot);
    this.container.appendChild(this.root);

    // Wire action buttons.
    this.bindSwap();
    this.bindRaise();
    this.bindPause();
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.root.style.display = visible ? '' : 'none';
  }

  setSide(side: 'right' | 'left'): void {
    if (this.destroyed) return;
    if (this.side === side) return;
    this.side = side;
    this.applyLayout();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    // Remove listeners by cloning each interactive node, which drops bound
    // handlers without needing to track every closure.
    for (const d of this.dpadButtons) this.stopDpadRepeat(d);
    this.dpadButtons = [];
    if (this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }

  // ---------- internal helpers ----------

  private makeButton(label: string, classes: string[]): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    for (const c of classes) b.classList.add(c);
    b.style.position = 'absolute';
    b.style.pointerEvents = 'auto';
    b.style.touchAction = 'none';
    b.style.userSelect = 'none';
    // Prevent the default focus ring from interfering with rapid taps.
    b.setAttribute('tabindex', '-1');
    return b;
  }

  /**
   * Resolves the safe-area inset CSS variables. Other agents own the global
   * stylesheet; we just reference `--safe-*` so the layout adapts whenever
   * those variables become available.
   */
  private applyLayout(): void {
    const safeTop = 'var(--safe-top, 0px)';
    const safeBottom = 'var(--safe-bottom, 0px)';
    const safeLeft = 'var(--safe-left, 0px)';
    const safeRight = 'var(--safe-right, 0px)';

    // Action buttons go on `this.side`; the D-pad goes on the opposite side.
    const actionSide = this.side;
    const dpadSide = this.side === 'right' ? 'left' : 'right';

    this.setBtnCorner(this.swapBtn, actionSide, 'bottom', 24, 24, safeBottom, safeLeft, safeRight);
    // Raise sits 16px above swap (button height 80 + gap 16 = 96 offset).
    this.setBtnCorner(
      this.raiseBtn,
      actionSide,
      'bottom',
      24,
      24 + 80 + 16,
      safeBottom,
      safeLeft,
      safeRight,
    );

    // Pause: opposite top corner from the action cluster so it doesn't conflict.
    const pauseSide = actionSide === 'right' ? 'left' : 'right';
    this.setBtnCorner(this.pauseBtn, pauseSide, 'top', 16, 16, safeTop, safeLeft, safeRight);

    // D-pad cluster in the bottom corner opposite the action buttons.
    this.dpadRoot.style.bottom = `calc(${safeBottom} + 24px)`;
    if (dpadSide === 'left') {
      this.dpadRoot.style.left = `calc(${safeLeft} + 24px)`;
      this.dpadRoot.style.right = '';
    } else {
      this.dpadRoot.style.right = `calc(${safeRight} + 24px)`;
      this.dpadRoot.style.left = '';
    }
  }

  private setBtnCorner(
    btn: HTMLButtonElement,
    horiz: 'left' | 'right',
    vert: 'top' | 'bottom',
    horizPx: number,
    vertPx: number,
    safeVert: string,
    safeLeft: string,
    safeRight: string,
  ): void {
    // Reset both axes so toggling sides doesn't leave stale offsets.
    btn.style.left = '';
    btn.style.right = '';
    btn.style.top = '';
    btn.style.bottom = '';
    if (horiz === 'left') btn.style.left = `calc(${safeLeft} + ${horizPx}px)`;
    else btn.style.right = `calc(${safeRight} + ${horizPx}px)`;
    if (vert === 'top') btn.style.top = `calc(${safeVert} + ${vertPx}px)`;
    else btn.style.bottom = `calc(${safeVert} + ${vertPx}px)`;
  }

  private buildDpad(): void {
    const size = 56;
    const center = 90 - size / 2; // root is 180×180 → center axis at 90px

    const make = (
      label: string,
      cls: string,
      style: Partial<CSSStyleDeclaration>,
      dRow: number,
      dCol: number,
    ): DpadButton => {
      const el = this.makeButton(label, ['piska-vb', `piska-vb-dpad-${cls}`]);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      for (const [k, v] of Object.entries(style)) {
        (el.style as unknown as Record<string, string>)[k] = String(v);
      }
      this.dpadRoot.appendChild(el);
      const d: DpadButton = { el, dRow, dCol, timer: null, initialTimer: null };
      this.bindDpadButton(d);
      return d;
    };

    this.dpadButtons = [
      make('U', 'up', { top: '0px', left: `${center}px` }, -1, 0),
      make('D', 'down', { bottom: '0px', left: `${center}px` }, 1, 0),
      make('L', 'left', { left: '0px', top: `${center}px` }, 0, -1),
      make('R', 'right', { right: '0px', top: `${center}px` }, 0, 1),
    ];
  }

  private bindDpadButton(d: DpadButton): void {
    d.el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      d.el.classList.add('is-pressed');
      try {
        d.el.setPointerCapture(ev.pointerId);
      } catch {
        // Some browsers refuse capture on non-primary touches; harmless.
      }
      this.emit('cursorMove', { dRow: d.dRow, dCol: d.dCol });
      // Initial delay, then steady-state repeats.
      d.initialTimer = window.setTimeout(() => {
        d.initialTimer = null;
        d.timer = window.setInterval(() => {
          this.emit('cursorMove', { dRow: d.dRow, dCol: d.dCol });
        }, REPEAT_INTERVAL_MS);
      }, REPEAT_INITIAL_MS);
    });

    const stop = (ev: PointerEvent): void => {
      d.el.classList.remove('is-pressed');
      try {
        if (d.el.hasPointerCapture(ev.pointerId)) {
          d.el.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // Ignore: capture may already be gone.
      }
      this.stopDpadRepeat(d);
    };
    d.el.addEventListener('pointerup', stop);
    d.el.addEventListener('pointercancel', stop);
    d.el.addEventListener('pointerleave', stop);
  }

  private stopDpadRepeat(d: DpadButton): void {
    if (d.initialTimer !== null) {
      window.clearTimeout(d.initialTimer);
      d.initialTimer = null;
    }
    if (d.timer !== null) {
      window.clearInterval(d.timer);
      d.timer = null;
    }
  }

  private bindSwap(): void {
    this.swapBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.swapBtn.classList.add('is-pressed');
      this.emit('swap', {});
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(15);
        } catch {
          // Ignored — vibrate isn't critical.
        }
      }
    });
    const up = (): void => {
      this.swapBtn.classList.remove('is-pressed');
    };
    this.swapBtn.addEventListener('pointerup', up);
    this.swapBtn.addEventListener('pointercancel', up);
    this.swapBtn.addEventListener('pointerleave', up);
  }

  private bindRaise(): void {
    this.raiseBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.raiseBtn.classList.add('is-pressed');
      this.emit('raisePress', {});
    });
    const release = (): void => {
      if (!this.raiseBtn.classList.contains('is-pressed')) return;
      this.raiseBtn.classList.remove('is-pressed');
      this.emit('raiseRelease', {});
    };
    this.raiseBtn.addEventListener('pointerup', release);
    this.raiseBtn.addEventListener('pointercancel', release);
    this.raiseBtn.addEventListener('pointerleave', release);
  }

  private bindPause(): void {
    this.pauseBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.pauseBtn.classList.add('is-pressed');
      this.emit('pause', {});
    });
    const up = (): void => {
      this.pauseBtn.classList.remove('is-pressed');
    };
    this.pauseBtn.addEventListener('pointerup', up);
    this.pauseBtn.addEventListener('pointercancel', up);
    this.pauseBtn.addEventListener('pointerleave', up);
  }
}
