/**
 * PISKA — Phaser entrypoint.
 *
 * Boots the Phaser.Game with FIT scaling, picks portrait vs. landscape logical
 * size based on current viewport, and wires a layout-change event to scenes
 * so they can re-position UI when the device rotates.
 */

import Phaser from 'phaser';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { TitleScene } from '@/scenes/TitleScene';
import { ModeSelectScene } from '@/scenes/ModeSelectScene';
import { OnboardingScene } from '@/scenes/OnboardingScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { GameScene } from '@/scenes/GameScene';
import { HUDScene } from '@/scenes/HUDScene';
import { PauseScene } from '@/scenes/PauseScene';
import { GameOverScene } from '@/scenes/GameOverScene';
import { ResultScene } from '@/scenes/ResultScene';
import { VsScene } from '@/scenes/VsScene';
import { VsLocalScene } from '@/scenes/VsLocalScene';
import { VsResultScene } from '@/scenes/VsResultScene';
import { OnlineLobbyScene } from '@/scenes/OnlineLobbyScene';
import { OnlineVsScene } from '@/scenes/OnlineVsScene';
import { OnlineResultScene } from '@/scenes/OnlineResultScene';
import { AdventureMapScene } from '@/scenes/AdventureMapScene';
import { AdventureStageSelectScene } from '@/scenes/AdventureStageSelectScene';
import { StageIntroScene } from '@/scenes/StageIntroScene';
import { StageOutroScene } from '@/scenes/StageOutroScene';
import { AboutScene } from '@/scenes/AboutScene';
import { i18n } from '@/i18n';
import ptBR from '@/i18n/pt-BR';
import esES from '@/i18n/es-ES';
import enDict from '@/i18n/en';
import { SaveManager } from '@/save/SaveManager';
import { BGMPlayer, SFXPlayer } from '@/audio';
import { mountMuteButton } from '@/ui/MuteButton';

// On mobile we can't easily open DevTools, so surface any unhandled error
// as a visible toast so the player (or me, debugging) sees what went wrong
// instead of staring at a frozen canvas.
function installErrorOverlay(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const show = (message: string): void => {
    let host = document.getElementById('piska-err');
    if (!host) {
      host = document.createElement('div');
      host.id = 'piska-err';
      host.style.cssText =
        'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;' +
        'background:#3a0a14;color:#ffe;border:2px solid #f88;padding:10px;' +
        'font:12px/1.4 monospace;border-radius:6px;max-height:50vh;overflow:auto;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.6);';
      host.addEventListener('click', () => host?.remove());
      document.body.appendChild(host);
    }
    const line = document.createElement('div');
    line.textContent = message;
    line.style.marginTop = '4px';
    host.appendChild(line);
  };
  window.addEventListener('error', (ev) => {
    show(`ERR ${ev.message} @ ${ev.filename?.split('/').pop()}:${ev.lineno}`);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const text = reason instanceof Error ? reason.message : String(reason);
    show(`REJ ${text}`);
  });
}
installErrorOverlay();

// Initialize i18n before any scene runs so first-frame labels render with
// the player's chosen locale. Order: register all dictionaries → init (reads
// localStorage / navigator) → if a SaveManager-stored locale exists, prefer
// that (the SaveManager is the canonical source of truth for preferences).
i18n.register('pt-BR', ptBR);
i18n.register('es-ES', esES);
i18n.register('en', enDict);
i18n.init();
{
  const saved = SaveManager.get().getLocale();
  if (saved && saved !== i18n.getLocale()) i18n.setLocale(saved);
  // Apply persisted audio levels so the first BGM/SFX play at the saved volume.
  const s = SaveManager.get().getSettings();
  BGMPlayer.get().setVolume(s.bgmVolume);
  SFXPlayer.get().setVolume(s.sfxVolume);
}

// Canvas fills the viewport (Phaser.Scale.RESIZE). No letterbox, every tap
// reaches the game. Block textures opt into NEAREST sampling in PreloadScene
// so they still look pixel-art; menu/HUD text now renders crisply at the
// device's native resolution instead of being upscaled with NEAREST too.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
  backgroundColor: '#1a0f1f',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    ModeSelectScene,
    OnboardingScene,
    SettingsScene,
    GameScene,
    HUDScene,
    PauseScene,
    GameOverScene,
    ResultScene,
    VsScene,
    VsLocalScene,
    VsResultScene,
    OnlineLobbyScene,
    OnlineVsScene,
    OnlineResultScene,
    AdventureMapScene,
    AdventureStageSelectScene,
    StageIntroScene,
    StageOutroScene,
    AboutScene,
  ],
});

// PWA: register the service worker in production builds. We avoid registering
// during `vite dev` because the SW would cache hot-reload chunks and break HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`)
      .then((reg) => {
        // When a fresh SW takes over (because the player already had the
        // previous one running), reload once so the page picks up the new
        // bundle hash without the player needing to do anything.
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}

function handleViewportChange(): void {
  // With Scale.RESIZE Phaser already updates gameSize for us; we just relay a
  // typed event so scenes can re-position their UI without depending on the
  // scale manager's own 'resize' wiring.
  const portrait = window.innerWidth < window.innerHeight;
  game.events.emit('layout-changed', { portrait });
}

window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', handleViewportChange);

// Mount the persistent mute button overlay AFTER the Phaser game has been
// created so the canvas is in the DOM and we can layer the button on top.
const muteRoot = document.getElementById('game-root') ?? document.body;
mountMuteButton(muteRoot);

if (import.meta.env?.DEV) {
  (window as unknown as { __PISKA__: Phaser.Game }).__PISKA__ = game;
}
