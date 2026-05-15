/**
 * PISKA — Adventure characters.
 *
 * Six original characters, one per world. All names, species and traits are
 * 100% original — no Nintendo IP referenced anywhere. Each character has a
 * short pt-BR voice (greet / defeat / victory / optional tutorial line) used
 * by Stage Intro and Outro dialogs. Lines are intentionally short so they
 * fit in the dialog box without scrolling.
 */

export type CharacterId =
  | 'pim'
  | 'salla'
  | 'boreal'
  | 'murena'
  | 'brasa'
  | 'aura';

export type Mood = 'neutral' | 'happy' | 'surprised' | 'sad';

export interface CharacterDef {
  id: CharacterId;
  /** Display name shown above the portrait. */
  name: string;
  /** Short species blurb used on the world card. */
  species: string;
  /** World this character anchors (1..6). */
  worldId: number;
  /** Dominant fill color for the placeholder portrait. */
  primaryColor: number;
  /** Secondary tint used for outlines / cheeks / accents. */
  accentColor: number;
  /** Voice lines in pt-BR. Each line ≤ 80 chars to keep dialog snappy. */
  pt: {
    greet: string;
    defeat: string;
    victory: string;
    tutorial?: string;
  };
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  pim: {
    id: 'pim',
    name: 'Pim',
    species: 'Raposinha verde',
    worldId: 1,
    primaryColor: 0x6ed058,
    accentColor: 0x2e7a26,
    pt: {
      greet: 'Oi! Sou a Pim! Vem comigo, é fácil, eu acho!',
      defeat: 'Aaai... cai de novo. Tenta de novo comigo?',
      victory: 'Boa! Eu sabia! Bem que eu disse que era fácil!',
      tutorial: 'Troca dois quadrados do lado pra alinhar três da mesma cor.',
    },
  },
  salla: {
    id: 'salla',
    name: 'Salla',
    species: 'Lagartixa do oásis',
    worldId: 2,
    primaryColor: 0xf5d24a,
    accentColor: 0xa57a18,
    pt: {
      greet: 'A areia ensina: quem corre, tropeça em si mesmo.',
      defeat: 'O tempo voou. Respire. Volte.',
      victory: 'O oásis floresce em quem espera o instante certo.',
      tutorial: 'Olhe para o relógio. Cada segundo é uma gota.',
    },
  },
  boreal: {
    id: 'boreal',
    name: 'Boreal',
    species: 'Cabra-de-gelo',
    worldId: 3,
    primaryColor: 0x9fd6f5,
    accentColor: 0x2a4a6e,
    pt: {
      greet: 'Pico Geada não perdoa hesitação. Pronto?',
      defeat: 'O gelo guarda quem cai. Levante.',
      victory: 'Sólido. Como pedra no inverno.',
      tutorial: 'Mais cores, mais cuidado. Não acelere sem razão.',
    },
  },
  murena: {
    id: 'murena',
    name: 'Murena',
    species: 'Polva cientista',
    worldId: 4,
    primaryColor: 0xe34b6e,
    accentColor: 0x6a1a36,
    pt: {
      greet: 'Calma, eu anotei tudo! Vamos por partes, ok?',
      defeat: 'Hipótese rejeitada! Mas que dado bonito!',
      victory: 'Eureka! Eu sabia que essa cadeia ia fechar!',
      tutorial: 'Pense antes de tocar. Um swap errado custa uma jogada.',
    },
  },
  brasa: {
    id: 'brasa',
    name: 'Brasa',
    species: 'Dragãozinho ferreiro',
    worldId: 5,
    primaryColor: 0xe06022,
    accentColor: 0x6a1c08,
    pt: {
      greet: 'Eu sou o Brasa! Vem, mostra do que tu é feito!',
      defeat: 'Boa, boa! Tu queimou bem. Bora de novo!',
      victory: 'Hahaha! Forja vence forja. Respeito.',
      tutorial: 'Em duelo, chain manda lixo pro outro lado.',
    },
  },
  aura: {
    id: 'aura',
    name: 'Aura',
    species: 'Fada-do-vento',
    worldId: 6,
    primaryColor: 0xc18df5,
    accentColor: 0x4a2670,
    pt: {
      greet: 'Sobe o vento, abre o céu — chegou a hora.',
      defeat: 'Cai a folha, segue a brisa. Tente outra vez.',
      victory: 'Brilha quem persiste. Bem-vindo ao alto.',
      tutorial: 'No castelo, tudo conta: cor, tempo, paciência.',
    },
  },
};

export const CHARACTER_BY_WORLD: Record<number, CharacterId> = {
  1: 'pim',
  2: 'salla',
  3: 'boreal',
  4: 'murena',
  5: 'brasa',
  6: 'aura',
};
