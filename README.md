# PISKA

> Para Carina, que jogou tanto que esqueceu de piscar.

Puzzle 2D inspirado em Panel de Pon / Tetris Attack. Personagens e arte
originais. Roda no navegador — desktop e mobile.

## Como rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

Outros scripts:

```bash
npm run build      # bundle de produção
npm run preview    # serve o bundle de produção localmente
npm run test       # vitest (lógica do engine)
npm run typecheck  # tsc --noEmit
```

## Stack

Phaser 3.80 + TypeScript (strict) + Vite. Engine puro (sem Phaser) sob
`src/engine/`; cena gráfica sob `src/scenes/`.

## Documentação

Spec completa, arquitetura do engine e roadmap em
[`CLAUDE.md`](./CLAUDE.md).
