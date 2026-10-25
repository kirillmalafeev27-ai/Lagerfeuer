// GameState — чистые данные (раздел 13.3.1). Меняется только через reduce().

import type { LevelConfig, LevelId } from '../config/levels.ts';
import type { Cell, Side } from './clearing.ts';
import type { WoodKind } from './wood.ts';

export interface Log {
  kind: WoodKind;
  /** Сколько мест этого полена ещё не прогорело. */
  amount: number;
}

export type Shelter = 'sheltered' | 'normal' | 'open';

export interface Fire {
  side: Side;
  shelter: Shelter;
  /** Множитель горения костра без ветра. */
  mult: number;
  /** Горящее топливо, мест (0..3). */
  fuel: number;
  /** Горящие поленья в порядке закладки: первым прогорает первое. */
  logs: Log[];
  /** Сколько единиц осталось до розжига разгорающегося дуба, иначе null. */
  catching: number | null;
  /** Сколько единиц осталось тлеть углям, иначе null (костёр горит). */
  embers: number | null;
  /** Уровень тревоги для глаз: 0 — нет, 1 — меньше 1 места, 2 — меньше 0.5. */
  lowLevel: 0 | 1 | 2;
  /** Последнее объявленное число отсчёта углей (99 — отсчёта не было). */
  countdown: number;
}

export interface Gust {
  side: Side;
  warn: number;
  start: number;
  end: number;
  /** 0 — ждёт, 1 — объявлен, 2 — дует, 3 — кончился. */
  phase: 0 | 1 | 2 | 3;
}

export type Intent = { kind: 'feed'; fire: Side } | { kind: 'move'; cell: Cell } | { kind: 'pile' };

export interface Hands {
  kind: WoodKind | null;
  count: number;
}

export interface Hero {
  cell: Cell;
  hands: Hands;
  intent: Intent | null;
  /** Намерение выставлено само (руки опустели → «к поленнице»). */
  autoIntent: boolean;
  /** «×2»: подбросить обе берёзы в один костёр. */
  x2: boolean;
  /** Готовое действие: верный ответ без намерения (не больше одного). */
  ready: boolean;
}

export interface Stats {
  correct: number;
  wrong: number;
  times: number[];
  birchFed: number;
  oakFed: number;
  embersCount: number;
  everEmbers: boolean;
  relights: number;
  gusts: number;
  steps: number;
  cause: { fire: Side; near: boolean; gust: boolean } | null;
}

export type Status = 'playing' | 'won' | 'lost';

export interface GameState {
  seed: number;
  levelId: LevelId;
  level: LevelConfig;
  /** Единица времени игры, секунд: A = T_med + unitOverheadSec. */
  A: number;
  /** Доля верных ответов игрока, зафиксированная на старте раунда. */
  p: number;
  tMed: number;
  /** Время ночи, единиц A. */
  t: number;
  /** Длина ночи с учётом ограничения nightMaxSec, единиц A. */
  nightA: number;
  /** Сколько тлеют угли, единиц A: больше emberA — помощь после неудач (balance.assist). */
  emberA: number;
  /** Ночь с заданиями генератора: свои параметры уровня и потолок длины (levels.generated). */
  generated: boolean;
  pile: Cell;
  tent: Cell;
  fires: Fire[];
  gusts: Gust[];
  hero: Hero;
  selectedWood: WoodKind;
  paused: boolean;
  status: Status;
  dawnStarted: boolean;
  stars: 0 | 1 | 2 | 3;
  stats: Stats;
}

export function emptyStats(): Stats {
  return {
    correct: 0,
    wrong: 0,
    times: [],
    birchFed: 0,
    oakFed: 0,
    embersCount: 0,
    everEmbers: false,
    relights: 0,
    gusts: 0,
    steps: 0,
    cause: null,
  };
}

/** Глубокая копия состояния (оно маленькое; редуктор не мутирует вход). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    fires: s.fires.map((f) => ({ ...f, logs: f.logs.map((l) => ({ ...l })) })),
    gusts: s.gusts.map((g) => ({ ...g })),
    hero: {
      ...s.hero,
      hands: { ...s.hero.hands },
      intent: s.hero.intent ? { ...s.hero.intent } : null,
    },
    stats: {
      ...s.stats,
      times: s.stats.times.slice(),
      cause: s.stats.cause ? { ...s.stats.cause } : null,
    },
  };
}

/** Доля прошедшей ночи 0..1. */
export function nightProgress(s: GameState): number {
  return Math.min(1, s.t / s.nightA);
}
