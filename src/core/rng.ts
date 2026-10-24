// Случайность логики — только сидированная (детерминизм, раздел 13.3.5).
export {
  mulberry32,
  hashSeed,
  uniform,
  randInt,
  pick,
  shuffle,
  normal,
  logNormal,
} from '../shared/rng.ts';
export type { Rng } from '../shared/rng.ts';
