/**
 * BGMPlayer — high-level background music controller.
 *
 * Wraps a shared ChiptuneSynth + Sequencer. Singleton-accessed via
 * BGMPlayer.get(). Persists volume in localStorage('piska.bgmVolume').
 *
 * Browser autoplay note: AudioContexts start in 'suspended' state. Call
 * unlock() from a user-gesture event handler (click/keydown) so the first
 * audible play() actually makes sound. Outside a user gesture the context
 * will stay suspended silently and the music will be queued but inaudible.
 */

import { Sequencer } from './Sequencer';
import { getSharedSynth } from './synthSingleton';
import { TRACKS } from '@/data/tracks';

const STORAGE_KEY = 'piska.bgmVolume';
const DEFAULT_VOLUME = 0.6;

function readStoredVolume(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeStoredVolume(v: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    // Storage may be disabled (private mode); ignore.
  }
}

export class BGMPlayer {
  private static instance: BGMPlayer | null = null;

  static get(): BGMPlayer {
    if (!BGMPlayer.instance) {
      BGMPlayer.instance = new BGMPlayer();
    }
    return BGMPlayer.instance;
  }

  private sequencer: Sequencer;
  private unlocked = false;
  private volume: number;
  private mutedVolume: number | null = null;

  private constructor() {
    const synth = getSharedSynth();
    this.sequencer = new Sequencer(synth);
    this.volume = readStoredVolume();
    // BGMPlayer is the canonical master-volume owner.
    synth.setMasterVolume(this.volume);
  }

  /** Must be called from a user gesture (click/keydown) per autoplay policy. */
  async unlock(): Promise<void> {
    await getSharedSynth().resume();
    this.unlocked = getSharedSynth().ctx.state === 'running';
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Play a track id ('title', 'world-1', ...). No-op if same id is playing. */
  play(trackId: string): void {
    const track = TRACKS[trackId];
    if (!track) {
      console.warn(`[BGMPlayer] Unknown track id: ${trackId}`);
      return;
    }
    if (this.sequencer.currentId() === trackId && this.sequencer.isPlaying()) {
      return;
    }
    this.sequencer.play(track);
  }

  stop(): void {
    this.sequencer.stop();
  }

  pause(): void {
    this.sequencer.pause();
    void getSharedSynth().suspend();
  }

  resume(): void {
    void getSharedSynth().resume();
    this.sequencer.resume();
  }

  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.volume = clamped;
    this.mutedVolume = null;
    getSharedSynth().setMasterVolume(clamped);
    writeStoredVolume(clamped);
  }

  getVolume(): number {
    return this.volume;
  }

  toggleMute(): void {
    if (this.mutedVolume === null) {
      this.mutedVolume = this.volume;
      getSharedSynth().setMasterVolume(0);
      this.volume = 0;
    } else {
      this.volume = this.mutedVolume;
      this.mutedVolume = null;
      getSharedSynth().setMasterVolume(this.volume);
    }
  }

  isPlaying(): boolean {
    return this.sequencer.isPlaying();
  }

  currentTrackId(): string | null {
    return this.sequencer.currentId();
  }
}
