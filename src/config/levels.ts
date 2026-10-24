// Таблица уровней (раздел 4). Длительности — в единицах A.
// slotA уровней 4–∞ подобраны симуляцией (раздел 14), см. DECISIONS.md.

export type LevelId = 1 | 2 | 3 | 4 | 5 | 6 | 'inf';

/** Набор подсказок: «все», «кольцо у цели, дуб», «дуб», «нет». */
export type HintSet = 'all' | 'targetRing' | 'oak' | 'none';

export interface WindConfig {
  /** Порыв раз в столько единиц (до разброса). */
  every: number;
  /** Множитель горения костра под порывом. */
  mult: number;
  /** Длительность порыва. */
  dur: number;
}

export interface LevelConfig {
  id: LevelId;
  nightA: number;
  slotA: number;
  oak: boolean;
  wind: WindConfig | null;
  sheltered: number;
  open: number;
  hints: HintSet;
  startFuel: readonly [number, number];
}

const START_FUEL: readonly [number, number] = [1.2, 2.4];
const START_FUEL_L1: readonly [number, number] = [1.5, 2.5];

export const levels: readonly LevelConfig[] = [
  { id: 1, nightA: 36, slotA: 12.0, oak: false, wind: null, sheltered: 0, open: 0, hints: 'all', startFuel: START_FUEL_L1 },
  { id: 2, nightA: 40, slotA: 10.5, oak: true, wind: null, sheltered: 0, open: 0, hints: 'all', startFuel: START_FUEL },
  { id: 3, nightA: 42, slotA: 10.0, oak: true, wind: { every: 12, mult: 2.0, dur: 5 }, sheltered: 1, open: 1, hints: 'all', startFuel: START_FUEL },
  { id: 4, nightA: 42, slotA: 9.8, oak: true, wind: { every: 10, mult: 2.5, dur: 6 }, sheltered: 1, open: 1, hints: 'targetRing', startFuel: START_FUEL },
  { id: 5, nightA: 44, slotA: 9.8, oak: true, wind: { every: 9, mult: 2.5, dur: 6 }, sheltered: 1, open: 1, hints: 'targetRing', startFuel: START_FUEL },
  { id: 6, nightA: 44, slotA: 10.0, oak: true, wind: { every: 8, mult: 2.5, dur: 6 }, sheltered: 2, open: 2, hints: 'oak', startFuel: START_FUEL },
  { id: 'inf', nightA: 46, slotA: 9.3, oak: true, wind: { every: 8, mult: 2.5, dur: 6 }, sheltered: 2, open: 2, hints: 'none', startFuel: START_FUEL },
];

export const LEVEL_IDS: readonly LevelId[] = levels.map((l) => l.id);

export function levelById(id: LevelId): LevelConfig {
  const l = levels.find((x) => x.id === id);
  if (!l) throw new Error(`unknown level ${String(id)}`);
  return l;
}

export function levelIndex(id: LevelId): number {
  return LEVEL_IDS.indexOf(id);
}

export function nextLevel(id: LevelId): LevelId | null {
  const i = levelIndex(id);
  return i >= 0 && i + 1 < LEVEL_IDS.length ? LEVEL_IDS[i + 1] : null;
}

export interface HintFlags {
  ringsAll: boolean;
  ringTarget: boolean;
  oak: boolean;
  route: boolean;
}

export function hintFlags(set: HintSet): HintFlags {
  switch (set) {
    case 'all':
      return { ringsAll: true, ringTarget: true, oak: true, route: true };
    case 'targetRing':
      return { ringsAll: false, ringTarget: true, oak: true, route: true };
    case 'oak':
      return { ringsAll: false, ringTarget: false, oak: true, route: true };
    case 'none':
      return { ringsAll: false, ringTarget: false, oak: false, route: true };
  }
}
