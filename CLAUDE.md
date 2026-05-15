# PISKA — Project Notes for Claude

> Para Carina, que jogou tanto que esqueceu de piscar.

## Vision

PISKA is a 2D puzzle game in the spirit of **Panel de Pon / Tetris Attack**:
swap horizontally-adjacent blocks on a slowly rising stack, line up 3+ of the
same color to clear them, and chain cascading clears for big score multipliers.
The aesthetic is original (no Nintendo IP) — pixel-art with a dark, slightly
neon palette.

The game must run smoothly in a browser on desktop *and* mobile (touch + virtual
buttons), feel snappy, and stay entirely offline.

## Stack

- **Phaser 3.80+** for rendering, scenes, scaling.
- **TypeScript** (strict) for everything.
- **Vite** for dev server / bundling.
- **Vitest** for unit tests of the engine.
- Path alias: `@/*` → `src/*`.

## Folder Structure (concise)

```
src/
  engine/        Pure game logic. No Phaser imports.
    Grid.ts          Stack + cell access.
    MatchDetector.ts Run-of-3+ detection.
    ChainTracker.ts  Cascade multiplier bookkeeping.
    ScoreManager.ts  Combo/chain → score arithmetic.
    types.ts         BlockColor, Block, EngineEvent, EngineConfig.
    input/           Input abstraction (keyboard, touch, mouse, gamepad).
  scenes/        Phaser scenes: Boot, Preload, Title, Game, HUD, Pause, GameOver.
  modes/         Mode definitions (Endless, Versus, Puzzle, Challenge, Story).
  audio/         SFX + music wiring (later).
  ui/            Shared UI widgets (later).
  save/          LocalStorage persistence (later).
  i18n/          Translations (pt-BR first).
  data/          Static configs (level scripts, puzzles).
  utils/         Generic helpers (RNG, math).
  config.ts      Rendering-side constants.
  main.ts        Phaser.Game bootstrap.
  styles.css     Page CSS + virtual-button overlay.
```

## Engine Architecture (summary)

- **GameEngine** owns a `Grid`, a `cursor` (`{row, col}`), a `ScoreManager`,
  and an `EventBus`. Public API:
  - `tick(dtMs)` advances all timers and runs match/fall/rise logic.
  - `moveCursor(dRow, dCol)` / `setCursor(row, col)` reposition the cursor.
  - `swap()` swaps the two cells under the cursor.
  - `setManualRaise(active)` boosts rise speed while the player holds it.
  - `pause()` / `resume()` freeze/unfreeze the tick loop.
  - `events.on(handler)` returns an unsubscribe function. Event types live in
    `engine/types.ts`.
- **Block state machine**: `idle → swapping → idle → clearing → (removed) →
  falling → landed → idle`. Timers (`swapTimer`, `clearTimer`, `fallTimer`)
  expose interpolation values that the renderer reads each frame.
- **Rise**: `grid.riseOffset` ∈ [0,1). When it hits 1.0 the stack shifts up by
  one full row and a new row is appended at the bottom from the seeded RNG.
- The engine is **deterministic** given the same `rngSeed` and input sequence
  — important for puzzle and challenge modes.

## Input Layer

`setupDefaultInputs({ canvas, virtualButtonsContainer, cellAt, cellSizePx })`
wires Keyboard, Mouse, Touch, and Gamepad adapters into a single
`InputController`. The controller emits high-level events:

- `cursorMove({ dRow, dCol })`
- `cursorSet({ row, col })`
- `swap`
- `raisePress` / `raiseRelease`
- `pause`
- `sourceChanged({ source })`

`cellAt(clientX, clientY)` and `cellSizePx()` are callbacks supplied by
`GameScene` so the input layer can translate touches into grid coords without
knowing anything about Phaser scaling.

## Modes

1. **Endless** — survive as long as possible while the rise speed ramps. The
   only mode shipped in fase 1.
2. **Versus** — two AI/Human players; clearing big chains sends "garbage"
   blocks to the opponent.
3. **Puzzle** — hand-crafted boards with a fixed number of swaps to clear all
   blocks.
4. **Challenge / Time Attack** — score as much as possible in 2 minutes.
5. **Story** — short campaign of curated boards with light narration.

## Difficulty Curve (Endless)

| Phase | Time (s) | Rise speed (rows/s) | numColors |
| ----- | -------- | ------------------- | --------- |
| 1     | 0–60     | 0.10                | 5         |
| 2     | 60–180   | 0.14                | 5         |
| 3     | 180–360  | 0.18                | 6         |
| 4     | 360–600  | 0.22                | 6         |
| 5     | 600+     | 0.26                | 6         |

(Tunable in `modes/endless.ts` once that mode shipper exists.)

## IP Warning

**Original characters, names, and sprites only.** Do NOT reference Lip,
Furil, Yoshi, or any Nintendo IP in code, assets, or text. The dedicatória
("Para Carina") is fine — that's family, not IP.

## Common Commands

```bash
npm run dev        # Vite dev server (localhost:5173)
npm run build      # Typecheck + production bundle
npm run preview    # Serve the production bundle locally
npm run test       # Vitest run (engine logic)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm run format     # Prettier
```

## Conventions

- TypeScript **strict**, including `noUnusedLocals` and `noImplicitReturns`.
- Use `import type { ... }` for type-only imports.
- Engine files must not import `phaser`. Scene files must not import
  `*.test.ts` or vitest globals.
- Comments and UI strings: pt-BR in player-visible text, English in code.
- Never run destructive git commands without asking the user first.
