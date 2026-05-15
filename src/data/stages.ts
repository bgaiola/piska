/**
 * PISKA — Adventure stage definitions.
 *
 * 38 curated stages across 6 worlds. Adventure mode is exclusively a series
 * of duels against the world's character (Pim, Salla, Boreal, Murena, Brasa,
 * Aura). Every stage runs in `vs-ai` mode with a difficulty preset that
 * climbs as the player progresses through the campaign.
 *
 * Stage IDs follow the pattern `w<world>-s<index>`. Indexes are 1-based.
 *
 * Star criteria for vs-ai are SCORE-BASED. Stars are computed by
 * `computeStarsForStage` below — losing the duel always yields 0 stars,
 * winning always grants at least 1 (with higher scores unlocking 2 and 3).
 */

import type { GameMode } from '@/modes';
import type { AIDifficulty } from '@/engine/AIPlayer';
import type { CharacterId, Mood } from './characters';
import { CHARACTER_BY_WORLD } from './characters';
import type { WorldId } from './worlds';

export interface DifficultyPreset {
  numColors: 4 | 5 | 6;
  initialStackHeight: number;
  /** Fraction of one row per second the stack rises. */
  baseRiseSpeed: number;
  /** Optional fixed seed for determinism. */
  rngSeed?: number;
}

export interface StageModeParams {
  /** Time Attack: window length. Stage Clear: hard time-out. */
  timeLimitMs?: number;
  /** Puzzle: maximum swaps. */
  movesAllowed?: number;
  /** Stage Clear: pre-filled rows. Overrides `difficulty.initialStackHeight`
   *  for layout-aware modes when present. */
  initialStackHeight?: number;
  /** Stage Clear: row index that, once the stack drops below, wins. */
  targetLine?: number;
  /** Vs IA: AI difficulty preset. */
  vsAiDifficulty?: AIDifficulty;
}

export interface StarCriteria {
  /** For score-driven modes (endless, time-attack, vs-ai). Higher is better. */
  score?: { '1': number; '2': number; '3': number };
  /** For pure survival modes where time alone matters. Higher is better. */
  timeMs?: { '1': number; '2': number; '3': number };
  /** For stage-clear: blocks left on board when the run ends. Lower is better. */
  remainingBlocks?: { '1': number; '2': number; '3': number };
}

export interface DialogLine {
  speaker: CharacterId;
  mood?: Mood;
  text: string;
}

export interface DialogScript {
  lines: DialogLine[];
}

export interface StageDef {
  /** Globally unique. */
  id: string;
  worldId: WorldId;
  /** 1-based position within the world. */
  index: number;
  /** Defaults to the world's hero, but boss stages can deviate. */
  characterId: CharacterId;
  mode: GameMode;
  modeParams: StageModeParams;
  difficulty: DifficultyPreset;
  intro?: DialogScript;
  outro?: {
    onWin?: DialogScript;
    onLose?: DialogScript;
  };
  starCriteria: StarCriteria;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const PIM: CharacterId = CHARACTER_BY_WORLD[1];
const SALLA: CharacterId = CHARACTER_BY_WORLD[2];
const BOREAL: CharacterId = CHARACTER_BY_WORLD[3];
const MURENA: CharacterId = CHARACTER_BY_WORLD[4];
const BRASA: CharacterId = CHARACTER_BY_WORLD[5];
const AURA: CharacterId = CHARACTER_BY_WORLD[6];

/** Score thresholds per AI difficulty. */
const SCORE_TIERS: Record<AIDifficulty, { '1': number; '2': number; '3': number }> = {
  easy: { '1': 300, '2': 900, '3': 1800 },
  medium: { '1': 400, '2': 1100, '3': 2200 },
  hard: { '1': 500, '2': 1300, '3': 2600 },
  master: { '1': 600, '2': 1500, '3': 3000 },
};

const scoreFor = (diff: AIDifficulty): StarCriteria => ({
  score: { ...SCORE_TIERS[diff] },
});

// ---------------------------------------------------------------------------
// Stage list. Every stage is a duel against the world's character.
// ---------------------------------------------------------------------------

export const STAGES: StageDef[] = [
  // -------------------------------------------------------------------------
  // WORLD 1 — Vale do Carvalho (Pim). 6 stages.
  // Curve: easy, easy, easy, easy, medium, medium.
  // -------------------------------------------------------------------------
  {
    id: 'w1-s1',
    worldId: 1,
    index: 1,
    characterId: PIM,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'easy' },
    difficulty: { numColors: 4, initialStackHeight: 4, baseRiseSpeed: 0.1 },
    intro: {
      lines: [
        { speaker: PIM, mood: 'happy', text: 'Oi! Sou a Pim! Bem-vindo ao Vale do Carvalho!' },
        { speaker: PIM, mood: 'neutral', text: 'Aqui é assim: tu duela comigo. Mas vou pegar leve.' },
        { speaker: PIM, mood: 'neutral', text: 'Troca dois quadrados do lado pra alinhar três da mesma cor.' },
        { speaker: PIM, mood: 'happy', text: 'Quando alinha, somem! E manda lixo pro meu lado!' },
        { speaker: PIM, mood: 'happy', text: 'Vai lá, eu confio em ti!' },
      ],
    },
    outro: {
      onWin: { lines: [{ speaker: PIM, mood: 'happy', text: 'Boa! Eu sabia! Bem que eu disse que era fácil!' }] },
      onLose: { lines: [{ speaker: PIM, mood: 'sad', text: 'Aaai... cai de novo. Tenta de novo comigo?' }] },
    },
    starCriteria: scoreFor('easy'),
  },
  {
    id: 'w1-s2',
    worldId: 1,
    index: 2,
    characterId: PIM,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'easy' },
    difficulty: { numColors: 4, initialStackHeight: 4, baseRiseSpeed: 0.1 },
    intro: {
      lines: [
        { speaker: PIM, mood: 'happy', text: 'De novo! Eu adoro duelar!' },
        { speaker: PIM, mood: 'neutral', text: 'Tenta fazer cadeia — combo gera mais combo!' },
      ],
    },
    starCriteria: scoreFor('easy'),
  },
  {
    id: 'w1-s3',
    worldId: 1,
    index: 3,
    characterId: PIM,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'easy' },
    difficulty: { numColors: 4, initialStackHeight: 5, baseRiseSpeed: 0.1 },
    intro: {
      lines: [
        { speaker: PIM, mood: 'neutral', text: 'A pilha já começa mais alta agora.' },
        { speaker: PIM, mood: 'happy', text: 'Mas tu já pegou o jeito, né?' },
      ],
    },
    starCriteria: scoreFor('easy'),
  },
  {
    id: 'w1-s4',
    worldId: 1,
    index: 4,
    characterId: PIM,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'easy' },
    difficulty: { numColors: 4, initialStackHeight: 5, baseRiseSpeed: 0.12 },
    intro: {
      lines: [
        { speaker: PIM, mood: 'surprised', text: 'O vento subiu! A pilha tá subindo mais rápido!' },
        { speaker: PIM, mood: 'happy', text: 'Respira fundo e vai!' },
      ],
    },
    starCriteria: scoreFor('easy'),
  },
  {
    id: 'w1-s5',
    worldId: 1,
    index: 5,
    characterId: PIM,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 4, initialStackHeight: 5, baseRiseSpeed: 0.12 },
    intro: {
      lines: [
        { speaker: PIM, mood: 'surprised', text: 'Hoje eu vim com mais foco! Aviso desde já!' },
        { speaker: PIM, mood: 'happy', text: 'Combo de 4 manda mais lixo. Tenta!' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w1-s6',
    worldId: 1,
    index: 6,
    characterId: PIM,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 4, initialStackHeight: 5, baseRiseSpeed: 0.13 },
    intro: {
      lines: [
        { speaker: PIM, mood: 'neutral', text: 'Última fase do vale!' },
        { speaker: PIM, mood: 'surprised', text: 'Eu vou dar o meu máximo dessa vez!' },
        { speaker: PIM, mood: 'happy', text: 'Mostra a corrente!' },
      ],
    },
    outro: {
      onWin: { lines: [{ speaker: PIM, mood: 'happy', text: 'Eba! Tu graduou do vale! Vai pra Salla agora!' }] },
      onLose: { lines: [{ speaker: PIM, mood: 'sad', text: 'Tava difícil mesmo. Volta quando quiser!' }] },
    },
    starCriteria: scoreFor('medium'),
  },

  // -------------------------------------------------------------------------
  // WORLD 2 — Dunas de Âmbar (Salla). 6 stages.
  // Curve: easy, medium, medium, medium, medium, hard.
  // -------------------------------------------------------------------------
  {
    id: 'w2-s1',
    worldId: 2,
    index: 1,
    characterId: SALLA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'easy' },
    difficulty: { numColors: 4, initialStackHeight: 5, baseRiseSpeed: 0.13 },
    intro: {
      lines: [
        { speaker: SALLA, mood: 'neutral', text: 'Bem-vindo às dunas. Sou Salla, guardiã do oásis.' },
        { speaker: SALLA, mood: 'neutral', text: 'A areia ensina: quem corre, tropeça em si mesmo.' },
        { speaker: SALLA, mood: 'neutral', text: 'Aqui também é duelo. Mas o tempo é da areia.' },
        { speaker: SALLA, mood: 'happy', text: 'Comece devagar. Encadeie como onda.' },
        { speaker: SALLA, mood: 'neutral', text: 'Cada combo me manda lixo. Cada chain, mais ainda.' },
      ],
    },
    starCriteria: scoreFor('easy'),
  },
  {
    id: 'w2-s2',
    worldId: 2,
    index: 2,
    characterId: SALLA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 4, initialStackHeight: 4, baseRiseSpeed: 0.13 },
    intro: {
      lines: [
        { speaker: SALLA, mood: 'neutral', text: 'Agora eu acordo. A areia me revela.' },
        { speaker: SALLA, mood: 'happy', text: 'Mantenha a calma. Pressa fura padrão.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w2-s3',
    worldId: 2,
    index: 3,
    characterId: SALLA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.13 },
    intro: {
      lines: [
        { speaker: SALLA, mood: 'surprised', text: 'Cinco cores hoje. O sol confunde.' },
        { speaker: SALLA, mood: 'neutral', text: 'Veja antes de mover. Cada swap é uma gota.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w2-s4',
    worldId: 2,
    index: 4,
    characterId: SALLA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.14 },
    intro: {
      lines: [
        { speaker: SALLA, mood: 'neutral', text: 'Vento de leste. A duna sobe.' },
        { speaker: SALLA, mood: 'happy', text: 'Defenda primeiro. Ataque depois.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w2-s5',
    worldId: 2,
    index: 5,
    characterId: SALLA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.15 },
    intro: {
      lines: [
        { speaker: SALLA, mood: 'neutral', text: 'O vento ficou impaciente hoje.' },
        { speaker: SALLA, mood: 'surprised', text: 'A pilha começa alta. Aceite e jogue.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w2-s6',
    worldId: 2,
    index: 6,
    characterId: SALLA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.16 },
    intro: {
      lines: [
        { speaker: SALLA, mood: 'neutral', text: 'A última duna é a mais alta.' },
        { speaker: SALLA, mood: 'happy', text: 'Atravesse. Boreal o espera no gelo.' },
      ],
    },
    outro: {
      onWin: { lines: [{ speaker: SALLA, mood: 'happy', text: 'A água o segue. Boa jornada.' }] },
      onLose: { lines: [{ speaker: SALLA, mood: 'sad', text: 'O tempo voou. Respire. Volte.' }] },
    },
    starCriteria: scoreFor('hard'),
  },

  // -------------------------------------------------------------------------
  // WORLD 3 — Pico Geada (Boreal). 6 stages.
  // Curve: medium, medium, medium, hard, hard, hard.
  // -------------------------------------------------------------------------
  {
    id: 'w3-s1',
    worldId: 3,
    index: 1,
    characterId: BOREAL,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.16 },
    intro: {
      lines: [
        { speaker: BOREAL, mood: 'neutral', text: 'Sou Boreal. Cabra-de-gelo. Pouca conversa.' },
        { speaker: BOREAL, mood: 'neutral', text: 'Pico Geada não perdoa hesitação.' },
        { speaker: BOREAL, mood: 'neutral', text: 'Cadeias mandam lixo pro outro lado. Use isso.' },
        { speaker: BOREAL, mood: 'happy', text: 'Vença-me. Estou observando.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w3-s2',
    worldId: 3,
    index: 2,
    characterId: BOREAL,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.16 },
    intro: {
      lines: [
        { speaker: BOREAL, mood: 'neutral', text: 'Uma avalanche começa.' },
        { speaker: BOREAL, mood: 'neutral', text: 'Derreta sem pressa. Mas derreta.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w3-s3',
    worldId: 3,
    index: 3,
    characterId: BOREAL,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.18 },
    intro: {
      lines: [
        { speaker: BOREAL, mood: 'neutral', text: 'O vento subiu. Cuidado com a velocidade.' },
        { speaker: BOREAL, mood: 'surprised', text: 'Mantenha o ritmo. Não acelere sem razão.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w3-s4',
    worldId: 3,
    index: 4,
    characterId: BOREAL,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.18 },
    intro: {
      lines: [
        { speaker: BOREAL, mood: 'neutral', text: 'Agora pesa. Eu não vou recuar.' },
        { speaker: BOREAL, mood: 'happy', text: 'Leia o telegraph. Defenda. Ataque.' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w3-s5',
    worldId: 3,
    index: 5,
    characterId: BOREAL,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.18 },
    intro: {
      lines: [
        { speaker: BOREAL, mood: 'neutral', text: 'A geleira está pesada.' },
        { speaker: BOREAL, mood: 'happy', text: 'Quem desce a montanha, escolhe o passo.' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w3-s6',
    worldId: 3,
    index: 6,
    characterId: BOREAL,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.2 },
    intro: {
      lines: [
        { speaker: BOREAL, mood: 'neutral', text: 'Última encosta. Sem suavidade.' },
        { speaker: BOREAL, mood: 'happy', text: 'Mostre o que aprendeu.' },
      ],
    },
    outro: {
      onWin: { lines: [{ speaker: BOREAL, mood: 'happy', text: 'Sólido. Como pedra no inverno.' }] },
      onLose: { lines: [{ speaker: BOREAL, mood: 'sad', text: 'O gelo guarda quem cai. Levante.' }] },
    },
    starCriteria: scoreFor('hard'),
  },

  // -------------------------------------------------------------------------
  // WORLD 4 — Recife Coral (Murena). 6 stages.
  // Curve: medium, hard, hard, hard, hard, master.
  // -------------------------------------------------------------------------
  {
    id: 'w4-s1',
    worldId: 4,
    index: 1,
    characterId: MURENA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'medium' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.2 },
    intro: {
      lines: [
        { speaker: MURENA, mood: 'happy', text: 'Ah, finalmente! Murena, ao seu dispor.' },
        { speaker: MURENA, mood: 'neutral', text: 'Polva, cientista, oito braços, muito duelo.' },
        { speaker: MURENA, mood: 'neutral', text: 'Recife Coral é minha tese. Padrões, padrões.' },
        { speaker: MURENA, mood: 'happy', text: 'Vamos validar a hipótese: você ganha?' },
        { speaker: MURENA, mood: 'surprised', text: 'Pense em cadeia, não em swap. Diferença abissal.' },
      ],
    },
    starCriteria: scoreFor('medium'),
  },
  {
    id: 'w4-s2',
    worldId: 4,
    index: 2,
    characterId: MURENA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.2 },
    intro: {
      lines: [
        { speaker: MURENA, mood: 'neutral', text: 'A correnteza acelerou. Maré viva.' },
        { speaker: MURENA, mood: 'happy', text: 'Encadeie! Encadeie! Dados bonitos!' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w4-s3',
    worldId: 4,
    index: 3,
    characterId: MURENA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.22 },
    intro: {
      lines: [
        { speaker: MURENA, mood: 'surprised', text: 'Esse aqui me deu trabalho!' },
        { speaker: MURENA, mood: 'happy', text: 'Eu já anotei suas jogadas. Tem padrão!' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w4-s4',
    worldId: 4,
    index: 4,
    characterId: MURENA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.22 },
    intro: {
      lines: [
        { speaker: MURENA, mood: 'neutral', text: 'Mais pilha, mais ponto, mais perigo.' },
        { speaker: MURENA, mood: 'happy', text: 'Eureka antecipado: vamos pontuar bonito.' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w4-s5',
    worldId: 4,
    index: 5,
    characterId: MURENA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.22 },
    intro: {
      lines: [
        { speaker: MURENA, mood: 'neutral', text: 'Olha esse esqueleto de coral. Lindo.' },
        { speaker: MURENA, mood: 'surprised', text: 'Eu vou pegar pesado dessa vez. Aviso!' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w4-s6',
    worldId: 4,
    index: 6,
    characterId: MURENA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 5, initialStackHeight: 7, baseRiseSpeed: 0.24 },
    intro: {
      lines: [
        { speaker: MURENA, mood: 'surprised', text: 'Última estação de pesquisa!' },
        { speaker: MURENA, mood: 'happy', text: 'Modo mestre. Eu sinto na ventosa.' },
      ],
    },
    outro: {
      onWin: { lines: [{ speaker: MURENA, mood: 'happy', text: 'Eureka! Eu sabia que essa cadeia ia fechar!' }] },
      onLose: { lines: [{ speaker: MURENA, mood: 'sad', text: 'Hipótese rejeitada! Mas que dado bonito!' }] },
    },
    starCriteria: scoreFor('master'),
  },

  // -------------------------------------------------------------------------
  // WORLD 5 — Forja Vulcânica (Brasa). 6 stages.
  // Curve: hard, hard, hard, master, master, master.
  // -------------------------------------------------------------------------
  {
    id: 'w5-s1',
    worldId: 5,
    index: 1,
    characterId: BRASA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 5, baseRiseSpeed: 0.24 },
    intro: {
      lines: [
        { speaker: BRASA, mood: 'happy', text: 'OPA! Tu chegou! Eu sou o Brasa!' },
        { speaker: BRASA, mood: 'happy', text: 'Forja vulcânica, dragãozinho ferreiro, em pessoa!' },
        { speaker: BRASA, mood: 'neutral', text: 'Aqui é duelo pesado. Pega firme.' },
        { speaker: BRASA, mood: 'surprised', text: 'Combo de 4? Manda lixo pro outro! HAHA!' },
        { speaker: BRASA, mood: 'neutral', text: 'Cadeia de 2 também! Quanto maior, pior pro outro.' },
        { speaker: BRASA, mood: 'happy', text: 'Bora ver tu marteland! Vai!' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w5-s2',
    worldId: 5,
    index: 2,
    characterId: BRASA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 5, initialStackHeight: 6, baseRiseSpeed: 0.24 },
    intro: {
      lines: [
        { speaker: BRASA, mood: 'happy', text: 'Segunda rodada! Aquece a forja!' },
        { speaker: BRASA, mood: 'neutral', text: 'A pilha sobe rápido. Não dorme!' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w5-s3',
    worldId: 5,
    index: 3,
    characterId: BRASA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 6, initialStackHeight: 5, baseRiseSpeed: 0.24 },
    intro: {
      lines: [
        { speaker: BRASA, mood: 'surprised', text: 'SEIS cores hoje! Mais brasa pra forja!' },
        { speaker: BRASA, mood: 'happy', text: 'Eu também vou sofrer, calma. HAHA!' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w5-s4',
    worldId: 5,
    index: 4,
    characterId: BRASA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.26 },
    intro: {
      lines: [
        { speaker: BRASA, mood: 'neutral', text: 'Modo mestre. Eu não vacilo.' },
        { speaker: BRASA, mood: 'happy', text: 'Combo gera mais combo. Aceita a brasa!' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w5-s5',
    worldId: 5,
    index: 5,
    characterId: BRASA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 5, baseRiseSpeed: 0.26 },
    intro: {
      lines: [
        { speaker: BRASA, mood: 'surprised', text: 'IA mestre. Cuidado.' },
        { speaker: BRASA, mood: 'happy', text: 'Lê o telegraph! Quando vem lixo, prepara contra-ataque!' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w5-s6',
    worldId: 5,
    index: 6,
    characterId: BRASA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.28 },
    intro: {
      lines: [
        { speaker: BRASA, mood: 'happy', text: 'CHEGOU! Última fase da forja!' },
        { speaker: BRASA, mood: 'surprised', text: 'É contra mim no auge! Sem corte!' },
        { speaker: BRASA, mood: 'happy', text: 'Vence aqui e tu ganha respeito eterno!' },
      ],
    },
    outro: {
      onWin: { lines: [{ speaker: BRASA, mood: 'happy', text: 'Hahaha! Forja vence forja. Respeito!' }] },
      onLose: { lines: [{ speaker: BRASA, mood: 'sad', text: 'Boa, boa! Tu queimou bem. Bora de novo!' }] },
    },
    starCriteria: scoreFor('master'),
  },

  // -------------------------------------------------------------------------
  // WORLD 6 — Castelo das Nuvens (Aura). 8 stages.
  // Curve: hard, master, master, master, master, master, master, master.
  // -------------------------------------------------------------------------
  {
    id: 'w6-s1',
    worldId: 6,
    index: 1,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'hard' },
    difficulty: { numColors: 6, initialStackHeight: 5, baseRiseSpeed: 0.28 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'Sobe o vento, abre o céu.' },
        { speaker: AURA, mood: 'neutral', text: 'Eu sou Aura, fada-do-vento.' },
        { speaker: AURA, mood: 'neutral', text: 'Guardiã do Castelo das Nuvens.' },
        { speaker: AURA, mood: 'happy', text: 'Você subiu seis biomas. Merece a chegada.' },
        { speaker: AURA, mood: 'neutral', text: 'Aqui tudo conta: cor, tempo, paciência.' },
        { speaker: AURA, mood: 'surprised', text: 'Comece. Eu observo.' },
        { speaker: AURA, mood: 'happy', text: 'Brilha quem persiste.' },
      ],
    },
    starCriteria: scoreFor('hard'),
  },
  {
    id: 'w6-s2',
    worldId: 6,
    index: 2,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.3 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'O vento corre. Você também.' },
        { speaker: AURA, mood: 'happy', text: 'Pontue como quem semeia: rápido e bem.' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w6-s3',
    worldId: 6,
    index: 3,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.3 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'Uma nuvem que se recusa a se desfazer.' },
        { speaker: AURA, mood: 'happy', text: 'Sopre devagar. Mas sopre.' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w6-s4',
    worldId: 6,
    index: 4,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 5, baseRiseSpeed: 0.3 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'surprised', text: 'Eu aprendi a ler o vento.' },
        { speaker: AURA, mood: 'neutral', text: 'Mantenha o ritmo. Defenda. Contra-ataque.' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w6-s5',
    worldId: 6,
    index: 5,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.3 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'Um enigma que custou séculos.' },
        { speaker: AURA, mood: 'happy', text: 'Use os mínimos sopros. Os melhores.' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w6-s6',
    worldId: 6,
    index: 6,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.32 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'Tempestade no horizonte.' },
        { speaker: AURA, mood: 'surprised', text: 'Sobreviva ao máximo. Sem fim.' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w6-s7',
    worldId: 6,
    index: 7,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 7, baseRiseSpeed: 0.32 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'Três correntes antes da torre.' },
        { speaker: AURA, mood: 'happy', text: 'Acumule. Cada ponto é uma estrela.' },
      ],
    },
    starCriteria: scoreFor('master'),
  },
  {
    id: 'w6-s8',
    worldId: 6,
    index: 8,
    characterId: AURA,
    mode: 'vs-ai',
    modeParams: { vsAiDifficulty: 'master' },
    difficulty: { numColors: 6, initialStackHeight: 6, baseRiseSpeed: 0.32 },
    intro: {
      lines: [
        { speaker: AURA, mood: 'neutral', text: 'A torre se abre. Aqui é o fim do caminho.' },
        { speaker: AURA, mood: 'surprised', text: 'Sou eu. Sou o espelho. Sou o vento.' },
        { speaker: AURA, mood: 'happy', text: 'Quem vence o vento, conhece o céu.' },
        { speaker: AURA, mood: 'neutral', text: 'Sem perdão agora. Sem demora.' },
        { speaker: AURA, mood: 'happy', text: 'Brilha, viajante. É a sua hora.' },
      ],
    },
    outro: {
      onWin: {
        lines: [
          { speaker: AURA, mood: 'happy', text: 'O céu abriu. Você ouviu o vento.' },
          { speaker: AURA, mood: 'happy', text: 'PISKA fica menor sem você. Volte sempre.' },
        ],
      },
      onLose: {
        lines: [
          { speaker: AURA, mood: 'sad', text: 'Cai a folha, segue a brisa.' },
          { speaker: AURA, mood: 'neutral', text: 'Tente outra vez. O céu não tem hora.' },
        ],
      },
    },
    starCriteria: scoreFor('master'),
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const BY_ID: Map<string, StageDef> = new Map(STAGES.map((s) => [s.id, s]));

export function getStageById(id: string): StageDef | undefined {
  return BY_ID.get(id);
}

export function getStagesForWorld(worldId: WorldId): StageDef[] {
  return STAGES.filter((s) => s.worldId === worldId).sort(
    (a, b) => a.index - b.index,
  );
}

export const STAGE_COUNT = STAGES.length;

// ---------------------------------------------------------------------------
// Star calculation — shared by GameScene and VsScene so the adventure flow
// produces consistent stars regardless of which scene ran the stage.
//
// For vs-ai (every Adventure stage): a loss is always 0 stars; a win is at
// least 1 star, with score thresholds unlocking the 2nd and 3rd. For the
// remaining (legacy) modes we keep the previous behavior so the helper stays
// drop-in compatible with any code that still calls it from GameScene.
// ---------------------------------------------------------------------------

interface StarComputeInput {
  mode: import('@/modes').GameMode;
  score: number;
  timeMs: number;
  remainingBlocks?: number;
  stars?: 1 | 2 | 3;
}

export function computeStarsForStage(
  stage: StageDef,
  data: StarComputeInput,
  won: boolean,
): 0 | 1 | 2 | 3 {
  if (!won) return 0;

  if (data.mode === 'vs-ai') {
    const crit = stage.starCriteria;
    if (crit.score) {
      const raw = starsFromHigherIsBetter(data.score, crit.score);
      // Winning the duel always grants at least 1 star.
      return (raw === 0 ? 1 : raw) as 1 | 2 | 3;
    }
    return 1;
  }

  if (data.mode === 'puzzle') {
    return (data.stars ?? 1) as 1 | 2 | 3;
  }
  const crit = stage.starCriteria;
  if (crit.score) {
    return starsFromHigherIsBetter(data.score, crit.score);
  }
  if (crit.timeMs) {
    return starsFromHigherIsBetter(data.timeMs, crit.timeMs);
  }
  if (crit.remainingBlocks && data.remainingBlocks !== undefined) {
    return starsFromLowerIsBetter(data.remainingBlocks, crit.remainingBlocks);
  }
  return 1;
}

function starsFromHigherIsBetter(
  value: number,
  th: { '1': number; '2': number; '3': number },
): 0 | 1 | 2 | 3 {
  if (value >= th['3']) return 3;
  if (value >= th['2']) return 2;
  if (value >= th['1']) return 1;
  return 0;
}

function starsFromLowerIsBetter(
  value: number,
  th: { '1': number; '2': number; '3': number },
): 0 | 1 | 2 | 3 {
  if (value <= th['3']) return 3;
  if (value <= th['2']) return 2;
  if (value <= th['1']) return 1;
  return 1;
}
