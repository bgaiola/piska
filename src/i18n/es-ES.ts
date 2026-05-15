/**
 * es-ES — Spanish translation. Mirrors keys from pt-BR.
 */

import type { TranslationDict } from './index';

const dict: TranslationDict = {
  // Title
  'title.subtitle': 'Modo Sin Fin',
  'title.prompt': 'Toca o Espacio para jugar',
  'title.dedication': 'Para Carina,\nque jugó tanto que olvidó parpadear.',

  // Mode select
  'modeselect.heading.main': 'Elige el modo',
  'modeselect.heading.difficulty': 'Dificultad de la IA',
  'modeselect.hint.main': '↑↓ Navegar  •  Enter Seleccionar  •  Esc Volver',
  'modeselect.hint.difficulty': '↑↓ Navegar  •  Enter Confirmar  •  Esc Volver',
  'modeselect.adventure.label': 'Aventura',
  'modeselect.adventure.subtitle': 'Campaña con seis mundos y diálogos.',
  'modeselect.endless.label': 'Sin Fin',
  'modeselect.endless.subtitle': 'Sobrevive todo lo que puedas.',
  'modeselect.vsai.label': 'Vs Cláudio',
  'modeselect.vsai.subtitle': 'Duelo contra Cláudio (IA).',
  'modeselect.vslocal.label': 'Vs Local',
  'modeselect.vslocal.subtitle': 'Dos jugadores en el mismo teclado.',
  'modeselect.vsonline.label': 'Vs Online',
  'modeselect.vsonline.subtitle': 'Duelo por código de sala.',
  'modeselect.timeattack.label': 'Contrarreloj',
  'modeselect.timeattack.subtitle': 'Marca el máximo en 2 minutos.',
  'modeselect.stageclear.label': 'Despeja el Tablero',
  'modeselect.stageclear.subtitle': 'Vacía la pila sin que suba.',
  'modeselect.puzzle.label': 'Puzzle',
  'modeselect.puzzle.subtitle': 'Accesible vía Aventura.',
  'modeselect.settings': 'Ajustes',

  // Difficulty
  'difficulty.easy.label': 'Fácil',
  'difficulty.easy.subtitle': 'Cláudio distraído — bueno para calentar.',
  'difficulty.medium.label': 'Medio',
  'difficulty.medium.subtitle': 'Cláudio atento, comete pocos errores.',
  'difficulty.hard.label': 'Difícil',
  'difficulty.hard.subtitle': 'Cláudio agresivo, busca chains.',
  'difficulty.master.label': 'Maestro',
  'difficulty.master.subtitle': 'Cláudio implacable, sin errores.',

  // HUD
  'hud.score': 'PUNTOS',
  'hud.time': 'TIEMPO',
  'hud.chain': 'CHAIN x{{n}}!',
  'hud.garbage': 'Basura: {{n}}',

  // Result
  'result.endless': 'SIN FIN',
  'result.timeattack': 'CONTRARRELOJ',
  'result.stageclear': 'DESPEJA EL TABLERO',
  'result.puzzle.complete': 'PUZZLE COMPLETO',
  'result.puzzle.retry': 'INTÉNTALO DE NUEVO',
  'result.vs': 'RESULTADO VS',
  'result.generic': 'RESULTADO',
  'result.score': 'PUNTOS {{n}}',
  'result.time': 'TIEMPO {{t}}',
  'result.moves': 'JUGADAS {{used}}/{{allowed}}',
  'result.remaining': 'RESTANTES {{n}}',
  'result.prompt': 'Toca / Espacio para volver',

  // Versus
  'vs.you': 'TÚ',
  'vs.ai': 'Cláudio',
  'vs.ai.label': 'Cláudio: {{difficulty}}',
  'vs.you.won': '¡GANASTE!',
  'vs.ai.won': '¡GANÓ CLÁUDIO!',
  'vs.difficulty': 'Dificultad: {{difficulty}}',
  'vs.score.line': '{{label}}   {{score}}',
  'vs.replay': 'Jugar otra vez',
  'vs.back': 'Volver al menú',
  'vs.hint': '↑↓ Navegar  •  Enter Seleccionar',
  'vs.garbage': 'BASURA: {{n}}',
  'vs.p1': 'P1',
  'vs.p2': 'P2',
  'vs.p1.won': '¡GANÓ EL JUGADOR 1!',
  'vs.p2.won': '¡GANÓ EL JUGADOR 2!',
  'vs.local.subtitle': 'Dos jugadores — mismo teclado',

  // Pause
  'pause.title': 'PAUSA',
  'pause.prompt': 'Toca / Espacio para continuar',
  'pause.resume': 'Continuar',
  'pause.quit': 'Salir al menú',
  'pause.hint': '↑↓ Navegar  •  Enter Seleccionar  •  Esc Continuar',

  // Game over (legacy)
  'gameover.title': 'FIN DEL JUEGO',
  'gameover.prompt': 'Toca / Espacio para reiniciar',

  // Settings
  'settings.title': 'Ajustes',
  'settings.language': 'Idioma',
  'settings.bgm': 'Música (BGM)',
  'settings.sfx': 'Efectos (SFX)',
  'settings.vibration': 'Vibración',
  'settings.touchSide': 'Disposición de botones',
  'settings.touchSide.right': 'Diestro',
  'settings.touchSide.left': 'Zurdo',
  'settings.pixelPerfect': 'Pixel perfect',
  'settings.pixelPerfect.note': '(requiere recargar)',
  'settings.reset': 'Reiniciar progreso',
  'settings.reset.confirm': '¿Borrar todo el progreso?',
  'settings.reset.done': 'Progreso borrado.',
  'settings.back': 'Volver',
  'settings.on': 'Activado',
  'settings.off': 'Desactivado',
  'settings.lang.pt-BR': 'Português',
  'settings.lang.es-ES': 'Español',
  'settings.lang.en': 'English',
  'settings.hint': '↑↓ Navegar  •  ←→ Ajustar  •  Enter Confirmar  •  Esc Volver',

  // Common
  'common.back': 'Volver',
  'common.confirm': 'Confirmar',
  'common.cancel': 'Cancelar',
  'common.yes': 'Sí',
  'common.no': 'No',
};

export default dict;
