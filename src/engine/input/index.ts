/**
 * Barrel exports for the input layer.
 */

export {
  InputController,
  type AdapterFactory,
  type CursorMovePayload,
  type CursorSetPayload,
  type EmitFn,
  type InputAdapter,
  type InputEventName,
  type InputSource,
  type SourceChangedPayload,
} from './InputController';

export {
  KeyboardAdapter,
  DEFAULT_KEY_BINDINGS,
  type KeyBindings,
  type KeyboardAdapterOptions,
} from './KeyboardAdapter';

export { MouseAdapter, type MouseAdapterOptions } from './MouseAdapter';

export { TouchAdapter, type TouchAdapterOptions } from './TouchAdapter';

export { GamepadAdapter, type GamepadAdapterOptions } from './GamepadAdapter';

export { VirtualButtons, type VirtualButtonsOptions } from './VirtualButtons';

export {
  setupDefaultInputs,
  type SetupOptions,
  type SetupResult,
} from './setupDefaultInputs';
