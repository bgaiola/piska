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
import { LOGICAL_PORTRAIT, LOGICAL_LANDSCAPE } from '@/config';
import { i18n } from '@/i18n';
import ptBR from '@/i18n/pt-BR';
import esES from '@/i18n/es-ES';
import enDict from '@/i18n/en';
import { SaveManager } from '@/save/SaveManager';
import { BGMPlayer, SFXPlayer } from '@/audio';

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

const portrait = window.innerWidth < window.innerHeight;
const dims = portrait ? LOGICAL_PORTRAIT : LOGICAL_LANDSCAPE;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: dims.width,
  height: dims.height,
  pixelArt: true,
  backgroundColor: '#1a0f1f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    ModeSelectScene,
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
  ],
});

// PWA: register the service worker in production builds. We avoid registering
// during `vite dev` because the SW would cache hot-reload chunks and break HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`)
      .catch(() => {});
  });
}

let lastPortrait = portrait;

function handleViewportChange(): void {
  const nowPortrait = window.innerWidth < window.innerHeight;
  if (nowPortrait === lastPortrait) return;
  lastPortrait = nowPortrait;
  const d = nowPortrait ? LOGICAL_PORTRAIT : LOGICAL_LANDSCAPE;
  game.scale.setGameSize(d.width, d.height);
  game.events.emit('layout-changed', { portrait: nowPortrait });
}

window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', handleViewportChange);

if (import.meta.env?.DEV) {
  (window as unknown as { __PISKA__: Phaser.Game }).__PISKA__ = game;
}
