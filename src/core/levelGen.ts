// Генерация уровня (раздел 5): поленница, честная раскладка скоростей, топливо, ветер,
// отсев сидов номинальным прогоном.

import { balance } from '../config/balance.ts';
import { type LevelId, levelFor } from '../config/levels.ts';
import { type Cell, type Side, SIDES, nearFires, oppositeCorner } from './clearing.ts';
import { eyesLevel } from './fires.ts';
import { nominalSurvives } from './nominal.ts';
import { hashSeed, mulberry32, randInt, shuffle, uniform } from './rng.ts';
import { type Fire, type GameState, type Log, type Shelter, emptyStats } from './state.ts';
import { makeGustSchedule } from './wind.ts';

export interface Pace {
  /** Медиана времени ответа, секунд (для правил — с поправкой на разброс, shared/pace.ts). */
  tMed: number;
  /** Доля верных ответов. */
  p: number;
}

/** Какая это ночь: вид вопросов и помощь после неудач. */
export interface NightOptions {
  /** Ночь с заданиями генератора: свои slotA и стартовое топливо, свой потолок длины. */
  generated?: boolean;
  /** Помощь после неудач подряд: 0 — нет, 1–2 — угли тлеют дольше (balance.assist). */
  assist?: number;
}

export interface GenOptions extends NightOptions {
  /** Не отсеивать сиды номинальным прогоном (тесты, тест темноты). */
  skipNominal?: boolean;
  /** Сообщение о растянутых порывах (по умолчанию console.warn). */
  warn?: (msg: string) => void;
}

/** Во сколько раз дольше тлеют угли при такой ступени помощи. */
export function assistEmberMul(assist: number): number {
  const steps = balance.assist.emberMul;
  return assist > 0 ? steps[Math.min(steps.length, assist) - 1] : 1;
}

export interface GenResult {
  state: GameState;
  attempts: number;
  stretched: boolean;
}

export function unitSeconds(tMed: number): number {
  return tMed + balance.unitOverheadSec;
}

/** Стартовое топливо — берёзовые поленья, неполное прогорает первым. */
function startLogs(fuel: number): Log[] {
  const n = Math.ceil(fuel - 1e-9);
  const logs: Log[] = [];
  const first = fuel - (n - 1);
  logs.push({ kind: 'birch', amount: first });
  for (let i = 1; i < n; i++) logs.push({ kind: 'birch', amount: 1 });
  return logs;
}

/** Один уровень по сиду, без проверки номинальным прогоном. */
export function buildLevel(
  levelId: LevelId,
  seed: number,
  pace: Pace,
  stretch = 1,
  night: NightOptions = {},
): GameState {
  const generated = night.generated === true;
  const level = levelFor(levelId, generated);
  const rng = mulberry32(seed);
  const A = unitSeconds(pace.tMed);
  const maxSec = generated ? balance.nightMaxSecGenerated : balance.nightMaxSec;
  const nightA = Math.min(level.nightA, maxSec / A);

  const pile = randInt(rng, 4) as Cell;
  const tent = oppositeCorner(pile);

  // Честная раскладка: пара «самый медленный + самый быстрый» — ближним или дальним.
  const kinds: Shelter[] = [];
  for (let i = 0; i < level.sheltered; i++) kinds.push('sheltered');
  for (let i = 0; i < level.open; i++) kinds.push('open');
  while (kinds.length < 4) kinds.push('normal');
  const multOf = (k: Shelter) =>
    k === 'sheltered'
      ? balance.multSheltered
      : k === 'open'
        ? balance.multOpen
        : balance.multNormal;
  kinds.sort((a, b) => multOf(a) - multOf(b));
  const pairA: Shelter[] = shuffle(rng, [kinds[0], kinds[3]]);
  const pairB: Shelter[] = shuffle(rng, [kinds[1], kinds[2]]);
  const near = nearFires(pile);
  const far = SIDES.filter((s) => s !== near[0] && s !== near[1]) as Side[];
  const [toNear, toFar] = rng() < 0.5 ? [pairA, pairB] : [pairB, pairA];
  const shelterOf = new Array<Shelter>(4);
  shelterOf[near[0]] = toNear[0];
  shelterOf[near[1]] = toNear[1];
  shelterOf[far[0]] = toFar[0];
  shelterOf[far[1]] = toFar[1];

  // Стартовое топливо с разбросом не меньше startFuelSpread.
  const [lo, hi] = level.startFuel;
  let fuels: number[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    fuels = SIDES.map(() => uniform(rng, lo, hi));
    if (Math.max(...fuels) - Math.min(...fuels) >= balance.startFuelSpread) break;
  }

  const fires: Fire[] = SIDES.map((side) => {
    const f: Fire = {
      side,
      shelter: shelterOf[side],
      mult: multOf(shelterOf[side]),
      fuel: fuels[side],
      logs: startLogs(fuels[side]),
      catching: null,
      embers: null,
      lowLevel: 0,
      countdown: 99,
    };
    f.lowLevel = eyesLevel(f);
    return f;
  });

  const gusts = makeGustSchedule(rng, level.wind, nightA, stretch);

  return {
    seed,
    levelId,
    level,
    A,
    p: pace.p,
    tMed: pace.tMed,
    t: 0,
    nightA,
    emberA: balance.emberA * assistEmberMul(night.assist ?? 0),
    generated,
    pile,
    tent,
    fires,
    gusts,
    hero: {
      cell: pile,
      hands: { kind: 'birch', count: balance.birchCarry },
      intent: null,
      autoIntent: false,
      x2: false,
      ready: false,
    },
    selectedWood: 'birch',
    paused: false,
    status: 'playing',
    dawnStarted: false,
    stars: 0,
    stats: emptyStats(),
  };
}

/**
 * Уровень, прошедший номинальный прогон. До nominalAttempts сидов; если ни один не прошёл,
 * промежутки между порывами растягиваются на 20% и пишется предупреждение.
 */
export function generateLevel(
  levelId: LevelId,
  seed: number,
  pace: Pace,
  opts: GenOptions = {},
): GenResult {
  if (opts.skipNominal)
    return { state: buildLevel(levelId, seed, pace, 1, opts), attempts: 1, stretched: false };
  for (let attempt = 0; attempt < balance.nominalAttempts; attempt++) {
    const s = buildLevel(levelId, attempt === 0 ? seed : hashSeed(seed, attempt), pace, 1, opts);
    if (nominalSurvives(s)) return { state: s, attempts: attempt + 1, stretched: false };
  }
  const s = buildLevel(
    levelId,
    hashSeed(seed, balance.nominalAttempts),
    pace,
    balance.nominalWindStretch,
    opts,
  );
  (opts.warn ?? console.warn)(
    `bonfires: level ${String(levelId)} seed ${seed}: no seed passed the nominal run, wind gaps stretched by 20%`,
  );
  return { state: s, attempts: balance.nominalAttempts, stretched: true };
}
