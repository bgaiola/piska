/**
 * PISKA — Adventure worlds.
 *
 * Six biomes that frame the campaign. `themeColor` is a hex int used to tint
 * the world map node and stage tiles. `trackId` is the BGM id registered in
 * `@/data/tracks` (already shipped: title, world-1..world-6).
 *
 * Worlds are unlocked sequentially: world N becomes playable when every stage
 * of world N-1 has at least one star. That logic lives in SaveManager so the
 * UI just queries it.
 */

export type WorldId = 1 | 2 | 3 | 4 | 5 | 6;

export interface WorldDef {
  id: WorldId;
  /** pt-BR name shown on the world map. */
  name: string;
  /** Short pt-BR descriptor (one phrase) shown on the world map. */
  tagline: string;
  /** Hex int — base color for the world node and stage tile accents. */
  themeColor: number;
  /** BGM track id. Matches `@/data/tracks`. */
  trackId: string;
  /** Only world 1 is unlocked from a fresh save. */
  unlockedByDefault?: boolean;
}

export const WORLDS: Record<WorldId, WorldDef> = {
  1: {
    id: 1,
    name: 'Vale do Carvalho',
    tagline: 'Folhagem fresca, primeiros passos.',
    themeColor: 0x6ed058,
    trackId: 'world-1',
    unlockedByDefault: true,
  },
  2: {
    id: 2,
    name: 'Dunas de Âmbar',
    tagline: 'Areia quente, relógio correndo.',
    themeColor: 0xf5b94a,
    trackId: 'world-2',
  },
  3: {
    id: 3,
    name: 'Pico Geada',
    tagline: 'Ar fino, decisões precisas.',
    themeColor: 0x9fd6f5,
    trackId: 'world-3',
  },
  4: {
    id: 4,
    name: 'Recife Coral',
    tagline: 'Correnteza, padrões complexos.',
    themeColor: 0xe34b6e,
    trackId: 'world-4',
  },
  5: {
    id: 5,
    name: 'Forja Vulcânica',
    tagline: 'Lava, fumaça, batalhas.',
    themeColor: 0xe06022,
    trackId: 'world-5',
  },
  6: {
    id: 6,
    name: 'Castelo das Nuvens',
    tagline: 'Acima de tudo, o vento sabe.',
    themeColor: 0xc18df5,
    trackId: 'world-6',
  },
};

export const WORLD_IDS: WorldId[] = [1, 2, 3, 4, 5, 6];
