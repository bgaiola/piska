/**
 * pt-BR — translation source of truth for PISKA.
 * Other locales should mirror these keys; missing entries fall back to pt-BR.
 */

import type { TranslationDict } from './index';

const dict: TranslationDict = {
  // Title
  'title.subtitle': 'Endless Mode',
  'title.prompt': 'Tap ou Espaço para jogar',
  'title.dedication': 'Para Carina,\nque jogou tanto que esqueceu de piscar.',

  // Mode select
  'modeselect.heading.main': 'Escolha o modo',
  'modeselect.heading.difficulty': 'Dificuldade da IA',
  'modeselect.hint.main': '↑↓ Navegar  •  Enter Selecionar  •  Esc Voltar',
  'modeselect.hint.difficulty': '↑↓ Navegar  •  Enter Confirmar  •  Esc Voltar',
  'modeselect.adventure.label': 'Aventura',
  'modeselect.adventure.subtitle': 'Campanha com seis mundos e diálogos.',
  'modeselect.endless.label': 'Endless',
  'modeselect.endless.subtitle': 'Sobreviva o máximo que puder.',
  'modeselect.vsai.label': 'Vs Cláudio',
  'modeselect.vsai.subtitle': 'Duelo contra o Cláudio (IA).',
  'modeselect.vslocal.label': 'Vs Local',
  'modeselect.vslocal.subtitle': 'Dois jogadores no mesmo teclado.',
  'modeselect.vsonline.label': 'Vs Online',
  'modeselect.vsonline.subtitle': 'Duelo via código de sala.',
  'modeselect.timeattack.label': 'Time Attack',
  'modeselect.timeattack.subtitle': 'Pontue o máximo em 2 minutos.',
  'modeselect.stageclear.label': 'Stage Clear',
  'modeselect.stageclear.subtitle': 'Limpe a pilha sem deixar subir.',
  'modeselect.puzzle.label': 'Puzzle',
  'modeselect.puzzle.subtitle': 'Acessível pela Aventura.',
  'modeselect.settings': 'Ajustes',

  // Difficulty
  'difficulty.easy.label': 'Fácil',
  'difficulty.easy.subtitle': 'Cláudio distraído — bom para aquecer.',
  'difficulty.medium.label': 'Médio',
  'difficulty.medium.subtitle': 'Cláudio atento, comete poucos erros.',
  'difficulty.hard.label': 'Difícil',
  'difficulty.hard.subtitle': 'Cláudio agressivo, busca chains.',
  'difficulty.master.label': 'Mestre',
  'difficulty.master.subtitle': 'Cláudio implacável, sem erros.',

  // HUD
  'hud.score': 'SCORE',
  'hud.time': 'TIME',
  'hud.chain': 'CHAIN x{{n}}!',
  'hud.garbage': 'Garbage: {{n}}',

  // Result
  'result.endless': 'ENDLESS',
  'result.timeattack': 'TIME ATTACK',
  'result.stageclear': 'STAGE CLEAR',
  'result.puzzle.complete': 'PUZZLE COMPLETO',
  'result.puzzle.retry': 'TENTE NOVAMENTE',
  'result.vs': 'VS RESULT',
  'result.generic': 'RESULT',
  'result.score': 'SCORE {{n}}',
  'result.time': 'TIME {{t}}',
  'result.moves': 'MOVES {{used}}/{{allowed}}',
  'result.remaining': 'RESTANTE {{n}}',
  'result.prompt': 'Tap / Espaço para voltar',

  // Versus
  'vs.you': 'VOCÊ',
  'vs.ai': 'Cláudio',
  'vs.ai.label': 'Cláudio: {{difficulty}}',
  'vs.you.won': 'VOCÊ VENCEU!',
  'vs.ai.won': 'CLÁUDIO VENCEU!',
  'vs.difficulty': 'Dificuldade: {{difficulty}}',
  'vs.score.line': '{{label}}   {{score}}',
  'vs.replay': 'Jogar de novo',
  'vs.back': 'Voltar ao menu',
  'vs.hint': '↑↓ Navegar  •  Enter Selecionar',
  'vs.garbage': 'GARBAGE: {{n}}',
  'vs.p1': 'P1',
  'vs.p2': 'P2',
  'vs.p1.won': 'JOGADOR 1 VENCEU!',
  'vs.p2.won': 'JOGADOR 2 VENCEU!',
  'vs.local.subtitle': 'Dois jogadores — mesmo teclado',

  // Pause
  'pause.title': 'PAUSADO',
  'pause.prompt': 'Tap / Espaço para continuar',
  'pause.resume': 'Continuar',
  'pause.quit': 'Sair para o menu',
  'pause.hint': '↑↓ Navegar  •  Enter Selecionar  •  Esc Continuar',

  // Game over (legacy)
  'gameover.title': 'GAME OVER',
  'gameover.prompt': 'Tap / Espaço para reiniciar',

  // Settings
  'settings.title': 'Ajustes',
  'settings.language': 'Idioma',
  'settings.bgm': 'Música (BGM)',
  'settings.sfx': 'Efeitos (SFX)',
  'settings.vibration': 'Vibração',
  'settings.touchSide': 'Layout dos botões',
  'settings.touchSide.right': 'Destro',
  'settings.touchSide.left': 'Canhoto',
  'settings.pixelPerfect': 'Pixel perfect',
  'settings.pixelPerfect.note': '(requer reload)',
  'settings.reset': 'Resetar progresso',
  'settings.reset.confirm': 'Apagar todo o progresso?',
  'settings.reset.done': 'Progresso apagado.',
  'settings.back': 'Voltar',
  'settings.on': 'Ligado',
  'settings.off': 'Desligado',
  'settings.lang.pt-BR': 'Português',
  'settings.lang.es-ES': 'Español',
  'settings.lang.en': 'English',
  'settings.hint': '↑↓ Navegar  •  ←→ Ajustar  •  Enter Confirmar  •  Esc Voltar',

  // Common
  'common.back': 'Voltar',
  'common.confirm': 'Confirmar',
  'common.cancel': 'Cancelar',
  'common.yes': 'Sim',
  'common.no': 'Não',
};

export default dict;
