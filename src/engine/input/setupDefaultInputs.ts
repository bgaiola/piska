/**
 * setupDefaultInputs — convenience wiring for the standard PISKA input stack.
 *
 * Builds an InputController, registers the adapters the caller enabled, and
 * mounts the on-screen VirtualButtons. Touch detection chooses whether to show
 * the virtual buttons by default; callers can override afterwards by calling
 * `virtualButtons.setVisible(...)`.
 */

import { GamepadAdapter } from './GamepadAdapter';
import { InputController } from './InputController';
import { KeyboardAdapter } from './KeyboardAdapter';
import { MouseAdapter } from './MouseAdapter';
import { TouchAdapter } from './TouchAdapter';
import { VirtualButtons } from './VirtualButtons';

export interface SetupOptions {
  canvas: HTMLElement;
  virtualButtonsContainer: HTMLElement;
  cellAt: (clientX: number, clientY: number) => { row: number; col: number } | null;
  cellSizePx: () => number;
  enableGamepad?: boolean;
  enableTouch?: boolean;
  enableMouse?: boolean;
  enableKeyboard?: boolean;
}

export interface SetupResult {
  controller: InputController;
  virtualButtons: VirtualButtons;
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  if ('ontouchstart' in window) return true;
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
  return false;
}

export function setupDefaultInputs(opts: SetupOptions): SetupResult {
  const {
    canvas,
    virtualButtonsContainer,
    cellAt,
    cellSizePx,
    enableGamepad = true,
    enableTouch = true,
    enableMouse = true,
    enableKeyboard = true,
  } = opts;

  const controller = new InputController();

  if (enableKeyboard) {
    controller.registerAdapter((emit) => new KeyboardAdapter(emit));
  }
  if (enableMouse) {
    controller.registerAdapter((emit) => new MouseAdapter(emit, { canvas, cellAt }));
  }
  if (enableTouch) {
    controller.registerAdapter(
      (emit) => new TouchAdapter(emit, { canvas, cellAt, cellSizePx }),
    );
  }
  if (enableGamepad) {
    controller.registerAdapter((emit) => new GamepadAdapter(emit));
  }

  controller.enableAll();

  const virtualButtons = new VirtualButtons(
    { container: virtualButtonsContainer },
    (name, payload, source) => controller.emit(name, payload, source),
  );

  // Show virtual buttons by default on touch-capable devices, hide otherwise.
  virtualButtons.setVisible(detectTouch());

  // Auto-toggle virtual buttons when the active source changes — keyboard or
  // gamepad usage hides them; a touch event brings them back.
  controller.on<{ source: 'keyboard' | 'mouse' | 'touch' | 'gamepad' }>(
    'sourceChanged',
    ({ source }) => {
      virtualButtons.setVisible(source === 'touch');
    },
  );

  return { controller, virtualButtons };
}
