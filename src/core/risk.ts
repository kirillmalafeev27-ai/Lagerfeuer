// Подсказки (раздел 2.8): кольцо срочности и силуэт дуба. Пороги — только из balance.ts.

import { balance, riskBlue } from '../config/balance.ts';
import type { Side } from './clearing.ts';
import { timeToEmbers } from './fires.ts';
import { stepsViaPile, stepsWithHands } from './intent.ts';
import type { GameState } from './state.ts';
import { fits, freeSlots, EPS } from './wood.ts';

export type RingLevel = 'calm' | 'soon' | 'late' | 'embers';

export interface Urgency {
  level: RingLevel;
  /** need / доступное время. */
  r: number;
  /** Шаги плюс одно подкладывание. */
  n: number;
}

/** Уровень кольца по r и длине пути n. */
export function ringLevel(r: number, n: number): Exclude<RingLevel, 'embers'> {
  if (r < riskBlue(n)) return 'calm';
  if (r <= balance.riskRed) return 'soon';
  return 'late';
}

/**
 * Кольцо срочности: самый быстрый способ помочь костру — полено в руках, если оно влезает,
 * иначе поход через поленницу за берёзой. need = n × A / p, всё в единицах A.
 * Дуб в руках помогает только после разгорания, поэтому его oakCatch прибавляется к need.
 */
export function urgency(s: GameState, side: Side): Urgency {
  const f = s.fires[side];
  if (f.embers !== null) return { level: 'embers', r: Infinity, n: 1 };
  const avail = timeToEmbers(s, side);
  const hk = s.hero.hands.kind;
  let best: { need: number; n: number } | null = null;
  if (hk !== null && fits(f, hk)) {
    const n = stepsWithHands(s, side) + 1;
    const need = n / s.p + (hk === 'oak' ? balance.oakCatchA : 0);
    best = { need, n };
  }
  if (fits(f, 'birch')) {
    const n = stepsViaPile(s, side) + 1;
    const need = n / s.p;
    if (!best || need < best.need) best = { need, n };
  }
  if (!best) return { level: 'calm', r: 0, n: 1 };
  const r = avail > EPS ? best.need / avail : Infinity;
  return { level: ringLevel(r, best.n), r, n: best.n };
}

/**
 * Силуэт дуба: 2 свободных места, костёр горит, и дуб, донесённый сейчас (из рук или
 * через поленницу), разгорится раньше углей с риском не больше 25%:
 * need / (время до углей − oakCatch) ≤ 0.75.
 */
export function oakHint(s: GameState, side: Side): boolean {
  if (!s.level.oak) return false;
  const f = s.fires[side];
  if (f.embers !== null) return false;
  if (freeSlots(f) + EPS < balance.oakSize) return false;
  const n = (s.hero.hands.kind === 'oak' ? stepsWithHands(s, side) : stepsViaPile(s, side)) + 1;
  const need = n / s.p;
  const avail = timeToEmbers(s, side) - balance.oakCatchA;
  if (avail <= EPS) return false;
  return need / avail <= balance.oakHintRisk;
}
