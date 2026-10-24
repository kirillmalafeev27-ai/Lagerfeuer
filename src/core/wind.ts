// Ветер (раздел 2.4): расписание порывов, известные (объявленные) порывы.

import { balance } from '../config/balance.ts';
import type { WindConfig } from '../config/levels.ts';
import { type Side, SIDES } from './clearing.ts';
import { type Rng, pick, uniform } from './rng.ts';
import type { GameState, Gust } from './state.ts';

/**
 * Расписание порывов. Первый — не раньше windFirstA, дальше старт следующего через
 * every × U(0.7, 1.3) после старта предыдущего, но не раньше его конца: порывы не
 * накладываются. Два порыва подряд с одной стороны не бывает.
 */
export function makeGustSchedule(
  rng: Rng,
  wind: WindConfig | null,
  nightA: number,
  stretch = 1,
): Gust[] {
  if (!wind) return [];
  const gusts: Gust[] = [];
  const gap = () => wind.every * uniform(rng, balance.windGapMin, balance.windGapMax) * stretch;
  let start = Math.max(balance.windFirstA * stretch, gap());
  let prevSide: Side | null = null;
  while (start < nightA) {
    const sides: readonly Side[] = prevSide === null ? SIDES : SIDES.filter((s) => s !== prevSide);
    const side: Side = pick(rng, sides);
    gusts.push({
      side,
      warn: Math.max(0, start - balance.windWarnA),
      start,
      end: start + wind.dur,
      phase: 0,
    });
    prevSide = side;
    const end = start + wind.dur;
    start = Math.max(start + gap(), end);
  }
  return gusts;
}

/** Порыв, который сейчас дует с этой стороны. */
export function activeGust(s: GameState, side: Side): Gust | null {
  for (const g of s.gusts) if (g.side === side && g.phase === 2) return g;
  return null;
}

/** Порывы, о которых игроку уже объявлено (с момента предупреждения), ещё не кончившиеся. */
export function knownGusts(s: GameState): Gust[] {
  return s.gusts.filter((g) => g.phase === 1 || g.phase === 2);
}

/** Объявленный, но ещё не начавшийся порыв (для значка и листьев). */
export function warnedGust(s: GameState): Gust | null {
  for (const g of s.gusts) if (g.phase === 1) return g;
  return null;
}

export function windMult(s: GameState): number {
  return s.level.wind ? s.level.wind.mult : 1;
}
