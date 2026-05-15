# PISKA Audio Module

Procedural NES-style chiptune music + SFX synthesized via the Web Audio API.
No audio file assets — everything is generated at runtime.

## Architecture

```
ChiptuneSynth   — Low-level Web Audio voices (2 pulse, 1 triangle, 1 noise)
Sequencer       — Step sequencer with look-ahead scheduling (~200 ms)
synthSingleton  — Shared ChiptuneSynth instance
BGMPlayer       — Singleton for background music + volume persistence
SFXPlayer       — Singleton for short feedback sounds
tracks (data/)  — Hand-authored Track definitions (1 title + 6 worlds)
```

## Tracks

| ID         | World                  | Mood                            | Key            | BPM |
| ---------- | ---------------------- | ------------------------------- | -------------- | --- |
| `title`    | Title Screen           | Cheerful, welcoming             | C major        | 140 |
| `world-1`  | Vale do Carvalho       | Bouncy folk, tutorial-friendly  | F major        | 120 |
| `world-2`  | Dunas de Âmbar         | Mysterious, Arabic flavor       | D harmonic min | 110 |
| `world-3`  | Pico Geada             | Crystalline, sparkly            | A minor        | 130 |
| `world-4`  | Recife Coral           | Floaty, liquid                  | F lydian       | 118 |
| `world-5`  | Forja Vulcânica        | Driving, chromatic, urgent      | E minor        | 150 |
| `world-6`  | Castelo das Nuvens     | Epic, final-boss energy         | B minor → D    | 135 |

Each track loops every 16 beats (4 bars).

## Browser autoplay

`AudioContext` starts in `'suspended'` state in every modern browser. The first
call to `BGMPlayer.get().unlock()` **must** be made inside a user-gesture
handler (click/keydown/touchstart), otherwise the context will silently stay
suspended and no sound will be produced.

```ts
button.addEventListener('click', async () => {
  await BGMPlayer.get().unlock();
  BGMPlayer.get().play('title');
});
```

## Integration snippet (for scenes)

```ts
import { BGMPlayer, SFXPlayer, TRACK_ID_BY_WORLD } from '@/audio';

// TitleScene.create()
this.input.once('pointerdown', async () => {
  await BGMPlayer.get().unlock();
  BGMPlayer.get().play('title');
});
this.input.keyboard?.once('keydown', async () => {
  await BGMPlayer.get().unlock();
  BGMPlayer.get().play('title');
});

// GameScene.create(worldNumber: number = 1)
const trackId = TRACK_ID_BY_WORLD[worldNumber] ?? 'world-1';
BGMPlayer.get().play(trackId);

// Engine events
engine.on('block.swapped', () => SFXPlayer.get().swap());
engine.on('match.found', (e: { comboSize: number; chain: number }) => {
  SFXPlayer.get().clear(e.comboSize);
  if (e.chain >= 2) SFXPlayer.get().chain(e.chain);
});

// Game over
engine.on('game.over', () => {
  BGMPlayer.get().stop();
  SFXPlayer.get().gameOver();
});

// Settings UI
BGMPlayer.get().setVolume(0.5); // persists in localStorage('piska.bgmVolume')
SFXPlayer.get().setVolume(0.8); // persists in localStorage('piska.sfxVolume')
```

## Volume model

- `BGMPlayer.setVolume(v)` controls the **shared master gain**. It affects both
  BGM and SFX (since they share an `AudioContext`).
- `SFXPlayer.setVolume(v)` scales SFX velocities independently. SFX can be
  ducked or muted without touching the music.
- Both volumes persist to `localStorage` on every set.

## Pause behavior

- `BGMPlayer.pause()` suspends the AudioContext entirely. All audio stops.
- `BGMPlayer.resume()` resumes the context and the sequencer.
- Best practice: pause when the page becomes hidden, resume when visible.

## Performance notes

- Every note creates a short-lived OscillatorNode (or BufferSource for noise)
  that is stopped and disconnected after its release tail. Idle tabs do not
  accumulate nodes.
- The Sequencer schedules ~200 ms ahead using a 25 ms `setInterval`. When the
  tab is backgrounded, browsers throttle the interval, which can cause
  micro-gaps. For Phase 1 this is acceptable; if it becomes an issue, switch
  to a `Worker`-based clock.
