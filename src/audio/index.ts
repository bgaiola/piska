/**
 * Audio module barrel.
 * Import via `@/audio` rather than reaching into individual files.
 */

export { ChiptuneSynth } from './ChiptuneSynth';
export type { PulseDuty, NoteOn, NoiseKind } from './ChiptuneSynth';

export {
  Sequencer,
  noteFreq,
} from './Sequencer';
export type {
  Pitch,
  PulseNote,
  PulsePart,
  TriPart,
  NoisePart,
  Track,
} from './Sequencer';

export { BGMPlayer } from './BGMPlayer';
export { SFXPlayer } from './SFXPlayer';

export { getSharedSynth } from './synthSingleton';

export { TRACKS, TRACK_ID_BY_WORLD } from '@/data/tracks';
