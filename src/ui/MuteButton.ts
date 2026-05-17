/**
 * MuteButton — single, persistent DOM overlay anchored to the top-left of
 * the viewport so the player can silence the music from any screen without
 * digging through Settings.
 *
 * Implemented as a DOM node (not a Phaser GameObject) so it survives scene
 * transitions without each scene having to opt in. The icon is an inline
 * SVG (not an emoji) so it renders identically across Android, iOS, macOS
 * and desktop browsers — emojis were inconsistent and read as washed-out
 * smileys on some Android skins.
 *
 * Positioning: top-left, BELOW the touch-mode MENU pill so the two never
 * overlap on gameplay scenes. On non-touch the spot is empty and it reads
 * as a tasteful corner control.
 */

import { BGMPlayer } from '@/audio';

const STORAGE_KEY = 'piska.muteButtonPersisted';

let mounted = false;

// SVG icons — drawn inline so we don't depend on emoji fonts. Same 24×24
// viewBox so the muted/unmuted variants align perfectly.
const ICON_UNMUTED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polygon points="4,9 4,15 9,15 14,20 14,4 9,9" fill="currentColor" stroke="currentColor"/>
  <path d="M17.5 8.5 C 19 10 19 14 17.5 15.5" />
  <path d="M20 6 C 22.5 9 22.5 15 20 18" />
</svg>`;

const ICON_MUTED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polygon points="4,9 4,15 9,15 14,20 14,4 9,9" fill="currentColor" stroke="currentColor"/>
  <line x1="17" y1="9" x2="22" y2="14" />
  <line x1="22" y1="9" x2="17" y2="14" />
</svg>`;

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
  // 40px round button — comfortably above Apple's 44px minimum tap target
  // when you account for the visual padding around the icon. Same purple
  // palette + warm gold border that the JOGAR / SOBRE pills use, so it
  // reads as part of the same visual family instead of a stray control.
  btn.style.cssText = [
    'position:fixed',
    // Sit BELOW the touch-mode MENU pill (MENU is 44px at safe+16; we
    // anchor at safe+70 with 10px gap). On desktop this is just a corner
    // control near the top of the left edge.
    'top:calc(env(safe-area-inset-top, 0px) + 70px)',
    'left:calc(env(safe-area-inset-left, 0px) + 14px)',
    'z-index:10000',
    'width:40px',
    'height:40px',
    'border-radius:20px',
    'border:2px solid #ffcc55',
    'background:rgba(37, 19, 56, 0.95)',
    'color:#ffe',
    'box-shadow:0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'margin:0',
    'touch-action:manipulation',
    '-webkit-tap-highlight-color:transparent',
    'user-select:none',
    '-webkit-user-select:none',
    'transition:transform 80ms ease, background 80ms ease, border-color 120ms ease',
  ].join(';');

  const render = (): void => {
    const muted = BGMPlayer.get().isMuted();
    btn.innerHTML = muted ? ICON_MUTED : ICON_UNMUTED;
    if (muted) {
      btn.style.borderColor = '#8a6a78';
      btn.style.background = 'rgba(37, 19, 56, 0.75)';
      btn.style.color = '#a89aa8';
    } else {
      btn.style.borderColor = '#ffcc55';
      btn.style.background = 'rgba(37, 19, 56, 0.95)';
      btn.style.color = '#ffe';
    }
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.title = muted ? 'Som desligado' : 'Som ligado';
  };
  render();

  // pointerup is the primary fire path (matches the JOGAR / MENU buttons,
  // reliable on iOS). click is a fallback for mouse-only browsers and odd
  // Android keyboards. The `pressed` flag dedupes between the two.
  let pressed = false;
  btn.addEventListener('pointerdown', (ev) => {
    pressed = true;
    btn.style.transform = 'scale(0.92)';
    ev.stopPropagation();
  });
  const release = (): void => {
    btn.style.transform = 'scale(1)';
  };
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
    release();
    if (!pressed) return;
    pressed = false;
    toggle(ev);
  });
  btn.addEventListener('pointercancel', () => {
    pressed = false;
    release();
  });
  btn.addEventListener('pointerleave', () => {
    release();
  });
  btn.addEventListener('click', (ev) => {
    if (pressed) {
      pressed = false;
      return;
    }
    toggle(ev);
  });

  container.appendChild(btn);
}
