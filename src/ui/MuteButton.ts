/**
 * MuteButton — single, persistent DOM overlay anchored to the top-right of
 * the viewport so the player can silence the music from any screen without
 * digging through Settings.
 *
 * Implemented as a DOM node (not a Phaser GameObject) for three reasons:
 *
 *   1. It survives scene transitions without each scene having to opt in.
 *   2. CSS safe-area insets keep it clear of iPhone notches automatically.
 *   3. The MENU button on touch devices already lives at top-right corner;
 *      we offset to the LEFT side at the top so the two never overlap on
 *      gameplay scenes.
 *
 * Mounted once during `main.ts` boot and held alive for the lifetime of the
 * page. The button reads / writes BGMPlayer state directly; no scene-level
 * plumbing required.
 */

import { BGMPlayer } from '@/audio';

const STORAGE_KEY = 'piska.muteButtonPersisted';

let mounted = false;

function readPersistedMute(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePersistedMute(muted: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // quota or private mode — silently ignore.
  }
}

export function mountMuteButton(container: HTMLElement): void {
  if (mounted) return;
  mounted = true;

  // Restore the previous session's mute state. BGMPlayer initialises unmuted
  // by default; if the player had mute on we toggle once here so the audio
  // engine matches the visible icon.
  if (readPersistedMute()) {
    try {
      BGMPlayer.get().toggleMute();
    } catch {
      // Audio subsystem not ready yet on some browsers; we'll re-check on
      // first click anyway.
    }
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'piska-mute';
  btn.setAttribute('aria-label', 'Toggle music');
  btn.setAttribute('tabindex', '-1');
  btn.style.cssText = [
    'position:fixed',
    // Top-LEFT corner, BELOW where the touch-mode MENU pill lives
    // (MENU is 44px tall at safe+16; we sit at safe+72 with a 12px gap).
    // On desktop the spot is empty so a mid-edge button reads fine; on
    // touch the player still has a clear corner tap target without us
    // colliding with the pause button.
    'top:calc(env(safe-area-inset-top, 0px) + 72px)',
    'left:calc(env(safe-area-inset-left, 0px) + 12px)',
    'z-index:10000',
    'width:36px',
    'height:36px',
    'border-radius:18px',
    'border:2px solid rgba(255, 204, 85, 0.7)',
    'background:rgba(26, 10, 34, 0.78)',
    'color:#ffe',
    'font:14px monospace',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'touch-action:manipulation',
    '-webkit-tap-highlight-color:transparent',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';');

  const render = (): void => {
    const muted = BGMPlayer.get().isMuted();
    // Speaker glyphs: unicode 🔊 / 🔇. Fall back gracefully even when the
    // emoji font is missing — both glyphs are tiny enough that the colour
    // change carries the state too.
    btn.textContent = muted ? '\u{1F507}' : '\u{1F509}';
    btn.style.borderColor = muted
      ? 'rgba(140, 100, 120, 0.7)'
      : 'rgba(255, 204, 85, 0.7)';
    btn.style.background = muted
      ? 'rgba(26, 10, 34, 0.55)'
      : 'rgba(26, 10, 34, 0.78)';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  };
  render();

  // pointerup beats click on iOS for the same reasons the JOGAR / MENU
  // buttons switched: synthesized click events sometimes don't fire after a
  // touch sequence. We still wire click as a fallback for mouse-only
  // browsers and odd Android keyboards.
  let pressed = false;
  btn.addEventListener('pointerdown', (ev) => {
    pressed = true;
    ev.stopPropagation();
  });
  const toggle = (ev: Event): void => {
    ev.stopPropagation();
    try {
      BGMPlayer.get().toggleMute();
    } catch {
      // ignore: audio subsystem will recover on next user gesture.
    }
    writePersistedMute(BGMPlayer.get().isMuted());
    render();
  };
  btn.addEventListener('pointerup', (ev) => {
    if (!pressed) return;
    pressed = false;
    toggle(ev);
  });
  btn.addEventListener('pointercancel', () => {
    pressed = false;
  });
  btn.addEventListener('click', (ev) => {
    // Fires either as the primary action (mouse) or as a fallback when
    // pointerdown→pointerup didn't both fire. The `pressed` flag dedupes.
    if (pressed) {
      pressed = false;
      return;
    }
    toggle(ev);
  });

  container.appendChild(btn);
}
