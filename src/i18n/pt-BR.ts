/**
 * pt-BR — translation source of truth for PISKA.
 * Other locales should mirror these keys; missing entries fall back to pt-BR.
 */

import type { TranslationDict } from './index';

const dict: TranslationDict = {
  // Title
  'title.subtitle': 'Endless Mode',
  'title.cta': 'JOGAR',
  'title.prompt': 'ou Espaço',
  'title.dedication': 'Para Carina,\nque jogou tanto que esqueceu de piscar.',

  // Mode select
  'modeselect.heading.main': 'Escolha o modo',
  'modeselect.heading.difficulty': 'Dificuldade da IA',
  'modeselect.hint.main': '↑↓ Navegar  •  Enter Selecionar  •  Esc Voltar',
  'modeselect.hint.difficulty': '↑↓ Navegar  •  Enter Confirmar  •  Esc Voltar',
  'modeselect.heading.puzzle': 'Escolha o puzzle',
  'modeselect.hint.puzzle': '↑↓ Navegar  •  Enter Iniciar  •  Esc Voltar',
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
  'modeselect.puzzle.subtitle': 'Limpe o tabuleiro em X jogadas.',

  // Puzzles
  'puzzle.p1-the-line.label': 'A Linha',
  'puzzle.p1-the-line.subtitle': '3 jogadas  •  Fácil',
  'puzzle.p2-two-pairs.label': 'Dois Pares',
  'puzzle.p2-two-pairs.subtitle': '3 jogadas  •  Fácil',
  'puzzle.p3-stairs.label': 'Escadas',
  'puzzle.p3-stairs.subtitle': '4 jogadas  •  Médio',
  'puzzle.p4-sandwich.label': 'Sanduíche',
  'puzzle.p4-sandwich.subtitle': '4 jogadas  •  Médio',
  'puzzle.p5-bridge.label': 'Ponte',
  'puzzle.p5-bridge.subtitle': '5 jogadas  •  Difícil',
  'puzzle.p6-cross.label': 'Cruz',
  'puzzle.p6-cross.subtitle': '5 jogadas  •  Difícil',
  'puzzle.p7-spiral.label': 'Espiral',
  'puzzle.p7-spiral.subtitle': '6 jogadas  •  Veterano',
  'puzzle.p8-pyramid.label': 'Pirâmide',
  'puzzle.p8-pyramid.subtitle': '7 jogadas  •  Mestre',
  // ── Catálogo expandido (p9–p24) ───────────────────────────────────
  'puzzle.p9-beijo.label': 'Beijo',
  'puzzle.p9-beijo.subtitle': '3 jogadas  •  Fácil',
  'puzzle.p10-trio.label': 'Trio',
  'puzzle.p10-trio.subtitle': '3 jogadas  •  Fácil',
  'puzzle.p11-quarteto.label': 'Quarteto',
  'puzzle.p11-quarteto.subtitle': '4 jogadas  •  Fácil',
  'puzzle.p12-pingo.label': 'Pingo',
  'puzzle.p12-pingo.subtitle': '4 jogadas  •  Fácil',
  'puzzle.p13-cantos.label': 'Cantos',
  'puzzle.p13-cantos.subtitle': '4 jogadas  •  Médio',
  'puzzle.p14-vidraca.label': 'Vidraça',
  'puzzle.p14-vidraca.subtitle': '5 jogadas  •  Médio',
  'puzzle.p15-travesseiro.label': 'Travesseiro',
  'puzzle.p15-travesseiro.subtitle': '5 jogadas  •  Médio',
  'puzzle.p16-prisma.label': 'Prisma',
  'puzzle.p16-prisma.subtitle': '5 jogadas  •  Médio',
  'puzzle.p17-labirinto.label': 'Labirinto',
  'puzzle.p17-labirinto.subtitle': '5 jogadas  •  Difícil',
  'puzzle.p18-rede.label': 'Rede',
  'puzzle.p18-rede.subtitle': '5 jogadas  •  Difícil',
  'puzzle.p19-tear.label': 'Tear',
  'puzzle.p19-tear.subtitle': '5 jogadas  •  Difícil',
  'puzzle.p20-vortex.label': 'Vórtice',
  'puzzle.p20-vortex.subtitle': '5 jogadas  •  Difícil',
  'puzzle.p21-cascata.label': 'Cascata',
  'puzzle.p21-cascata.subtitle': '5 jogadas  •  Veterano',
  'puzzle.p22-engrenagem.label': 'Engrenagem',
  'puzzle.p22-engrenagem.subtitle': '5 jogadas  •  Veterano',
  'puzzle.p23-galaxia.label': 'Galáxia',
  'puzzle.p23-galaxia.subtitle': '5 jogadas  •  Veterano',
  'puzzle.p24-arquiteto.label': 'Arquiteto',
  'puzzle.p24-arquiteto.subtitle': '4 jogadas  •  Mestre',
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

  // Onboarding (first-run tutorial overlay)
  'onboarding.slide1.title': 'Troque blocos',
  'onboarding.slide1.body':
    'Toque em um par de blocos do lado para trocar. Combine 3 ou mais da mesma cor para limpar.',
  'onboarding.slide2.title': 'Encadeie chains',
  'onboarding.slide2.body':
    'Quando blocos caem em cima de uma combinação, eles encadeiam! Chains valem muito mais pontos.',
  'onboarding.slide3.title': 'Cuidado com o topo',
  'onboarding.slide3.body':
    'Os blocos sobem o tempo todo. Não deixe alcançar o topo. Use o botão R para forçar uma subida quando quiser.',
  'onboarding.skip': 'Pular',
  'onboarding.next': 'Próximo',
  'onboarding.start': 'Começar a jogar!',

  // Common
  'common.back': 'Voltar',
  'common.confirm': 'Confirmar',
  'common.cancel': 'Cancelar',
  'common.yes': 'Sim',
  'common.no': 'Não',
};

export default dict;
