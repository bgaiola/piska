/**
 * SaveManager — singleton wrapper around `localStorage` that holds high
 * scores, best times, puzzle stars, the Vs win/loss record, and audio
 * settings. The on-disk shape is versioned (`version: 1`) so future
 * migrations can be added without breaking saved profiles.
 *
 * Failure modes (private mode, quota exceeded, corrupt JSON) are swallowed:
 * the manager falls back to in-memory defaults so the game still plays.
 */

import type { ModeResultData } from '@/modes/ModeBase';
import type { Locale } from '@/i18n';
import { getStagesForWorld } from '@/data/stages';
import { WORLD_IDS, type WorldId } from '@/data/worlds';

export interface AdventureStageProgress {
  stars: 0 | 1 | 2 | 3;
  bestScore: number;
  bestTimeMs?: number;
}

export interface AdventureSave {
  stages: Record<string, AdventureStageProgress>;
  completedWorlds: number[];
}

interface SaveData {
  version: 1;
  highScores: Partial<Record<string, number>>; // key: mode (or 'puzzle:<id>')
  bestTimes: Partial<Record<string, number>>;
  stars: Partial<Record<string, number>>; // puzzle stars per id
  vsRecord: { wins: number; losses: number };
  settings: {
    bgmVolume: number;
    sfxVolume: number;
    locale: Locale;
    vibrationEnabled: boolean;
    touchSide: 'right' | 'left';
  };
  adventure: AdventureSave;
}

const STORAGE_KEY = 'piska.save.v1';

export class SaveManager {
  private static instance: SaveManager | null = null;
  static get(): SaveManager {
    return (this.instance ??= new SaveManager());
  }
  private data: SaveData = this.defaultData();

  private constructor() {
    this.load();
  }

  private defaultData(): SaveData {
    return {
      version: 1,
      highScores: {},
      bestTimes: {},
      stars: {},
      vsRecord: { wins: 0, losses: 0 },
      settings: {
        bgmVolume: 0.6,
        sfxVolume: 0.8,
        locale: 'pt-BR',
        vibrationEnabled: true,
        touchSide: 'right',
      },
      adventure: { stages: {}, completedWorlds: [] },
    };
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1) {
        const defaults = this.defaultData();
        const parsedAdv = (parsed.adventure ?? {}) as Partial<AdventureSave>;
        this.data = {
          ...defaults,
          ...parsed,
          // Settings deserve a deep merge so older saves get sensible defaults
          // for any new fields without losing the saved volumes.
          settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
          // Adventure was added in fase 3 — migrate older saves silently.
          adventure: {
            stages: { ...defaults.adventure.stages, ...(parsedAdv.stages ?? {}) },
            completedWorlds: Array.isArray(parsedAdv.completedWorlds)
              ? parsedAdv.completedWorlds.slice()
              : [],
          },
        };
      }
    } catch {
      /* ignore corrupt save */
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota etc */
    }
  }

  recordResult(r: ModeResultData): void {
    const key = r.mode; // could be extended for puzzle id
    if ((this.data.highScores[key] ?? 0) < r.score) this.data.highScores[key] = r.score;
    if (r.mode === 'time-attack' || r.mode === 'stage-clear') {
      if ((this.data.bestTimes[key] ?? Infinity) > r.timeMs) this.data.bestTimes[key] = r.timeMs;
    }
    if (r.mode === 'puzzle' && r.stars !== undefined) {
      const prev = this.data.stars[key] ?? 0;
      if (r.stars > prev) this.data.stars[key] = r.stars;
    }
    this.save();
  }

  recordVsResult(won: boolean): void {
    if (won) this.data.vsRecord.wins++;
    else this.data.vsRecord.losses++;
    this.save();
  }

  getHighScore(mode: string): number {
    return this.data.highScores[mode] ?? 0;
  }
  getBestTime(mode: string): number | undefined {
    return this.data.bestTimes[mode];
  }
  getStars(mode: string): number {
    return this.data.stars[mode] ?? 0;
  }
  getVsRecord(): { wins: number; losses: number } {
    return this.data.vsRecord;
  }
  getSettings(): SaveData['settings'] {
    return this.data.settings;
  }
  setSetting(k: 'bgmVolume' | 'sfxVolume', v: number): void {
    this.data.settings[k] = v;
    this.save();
  }

  setLocale(loc: Locale): void {
    this.data.settings.locale = loc;
    this.save();
  }
  getLocale(): Locale {
    return this.data.settings.locale;
  }

  setVibration(on: boolean): void {
    this.data.settings.vibrationEnabled = on;
    this.save();
  }
  getVibration(): boolean {
    return this.data.settings.vibrationEnabled;
  }

  setTouchSide(side: 'right' | 'left'): void {
    this.data.settings.touchSide = side;
    this.save();
  }
  getTouchSide(): 'right' | 'left' {
    return this.data.settings.touchSide;
  }

  // ---------------------------------------------------------------------------
  // Adventure mode
  // ---------------------------------------------------------------------------

  /**
   * Persist the outcome of an adventure stage. Stars only ever increase — a
   * worse run never overwrites a better one. Score and time are also
   * monotonic (best score up, best time down).
   */
  recordAdventureResult(
    stageId: string,
    _result: 'won' | 'lost',
    stars: 0 | 1 | 2 | 3,
    score: number,
    timeMs: number,
  ): void {
    const adv = this.data.adventure;
    const prev = adv.stages[stageId] ?? { stars: 0, bestScore: 0 };
    const merged: AdventureStageProgress = {
      stars: Math.max(prev.stars, stars) as 0 | 1 | 2 | 3,
      bestScore: Math.max(prev.bestScore, score),
      bestTimeMs:
        prev.bestTimeMs === undefined
          ? timeMs
          : Math.min(prev.bestTimeMs, timeMs),
    };
    adv.stages[stageId] = merged;
    // Mark worlds completed (all stages with ≥ 1 star). Cheap to recompute.
    adv.completedWorlds = WORLD_IDS.filter((wid) =>
      getStagesForWorld(wid).every(
        (s) => (adv.stages[s.id]?.stars ?? 0) >= 1,
      ),
    );
    this.save();
  }

  getAdventureProgress(stageId: string): AdventureStageProgress {
    return (
      this.data.adventure.stages[stageId] ?? { stars: 0, bestScore: 0 }
    );
  }

  /**
   * A world is unlocked when every stage of the previous world has ≥1 star.
   * World 1 is always unlocked.
   */
  isWorldUnlocked(worldId: number): boolean {
    if (worldId <= 1) return true;
    const prev = worldId - 1;
    if (prev < 1) return true;
    return getStagesForWorld(prev as WorldId).every(
      (s) => (this.data.adventure.stages[s.id]?.stars ?? 0) >= 1,
    );
  }

  /**
   * Returns true when the stage AT index `stageIndex` of the given world is
   * playable. Adventure also gates stages within a world: stage N is
   * unlocked only if stage N-1 has ≥1 star.
   */
  isStageUnlocked(worldId: WorldId, stageIndex: number): boolean {
    if (!this.isWorldUnlocked(worldId)) return false;
    if (stageIndex <= 1) return true;
    const stages = getStagesForWorld(worldId);
    const prev = stages.find((s) => s.index === stageIndex - 1);
    if (!prev) return true;
    return (this.data.adventure.stages[prev.id]?.stars ?? 0) >= 1;
  }

  getAdventure(): AdventureSave {
    return this.data.adventure;
  }

  reset(): void {
    this.data = this.defaultData();
    this.save();
  }
}
