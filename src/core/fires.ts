// Горение (раздел 2.3): скорость, интегрирование и прогноз «время до углей / до волка».

import { balance } from '../config/balance.ts';
import type { Side } from './clearing.ts';
import type { Fire, GameState, Gust } from './state.ts';
import { activeGust, knownGusts, windMult } from './wind.ts';
import { EPS } from './wood.ts';

/** Скорость горения костра, мест в единицу A, с учётом дующего сейчас порыва. */
export function burnRate(s: GameState, side: Side): number {
  const f = s.fires[side];
  const gust = activeGust(s, side);
  return (f.mult * (gust ? windMult(s) : 1)) / s.level.slotA;
}

/** Прогорание костра за dt единиц при постоянной скорости. Мутирует костёр. */
export function integrateFire(f: Fire, rate: number, dt: number): void {
  if (f.embers !== null) {
    f.embers -= dt;
  } else if (f.fuel > 0) {
    let burn = rate * dt;
    while (burn > 0 && f.logs.length > 0) {
      const log = f.logs[0];
      if (log.amount > burn + EPS) {
        log.amount -= burn;
        burn = 0;
      } else {
        burn -= log.amount;
        f.logs.shift();
      }
    }
    let fuel = 0;
    for (const l of f.logs) fuel += l.amount;
    f.fuel = fuel;
  }
  if (f.catching !== null) f.catching -= dt;
}

export interface Projection {
  /** Через сколько единиц костёр догорит до углей (0 — уже угли). */
  tEmbers: number;
  /** Через сколько единиц из темноты выйдет волк, если никто не поможет. */
  tWolf: number;
}

/**
 * Прогноз костра без вмешательства игрока: учитывает разгорающийся дуб
 * и переданные порывы (обычно только объявленные).
 */
export function projectFire(s: GameState, side: Side, gusts: readonly Gust[]): Projection {
  const f = s.fires[side];
  const base = f.mult / s.level.slotA;
  const wm = windMult(s);
  const ivs: Array<[number, number]> = [];
  for (const g of gusts) {
    if (g.side !== side || g.phase === 3) continue;
    const a = Math.max(0, g.start - s.t);
    const b = g.end - s.t;
    if (b > EPS) ivs.push([a, b]);
  }

  let t = 0;
  let fuel = f.fuel;
  let catching = f.catching;
  let embers = f.embers;
  let tEmbers = embers !== null ? 0 : Infinity;

  for (let guard = 0; guard < 64; guard++) {
    if (embers !== null) {
      if (catching !== null && catching < embers) {
        // Дуб разгорается раньше, чем дотлеют угли: костёр снова горит.
        t += Math.max(0, catching);
        embers = null;
        catching = null;
        fuel = balance.oakSize;
        continue;
      }
      return { tEmbers, tWolf: t + Math.max(0, embers) };
    }

    let inGust = false;
    let nextBoundary = Infinity;
    for (const [a, b] of ivs) {
      if (t >= a - EPS && t < b - EPS) {
        inGust = true;
        if (b < nextBoundary) nextBoundary = b;
      } else if (a > t + EPS && a < nextBoundary) {
        nextBoundary = a;
      }
    }
    const rate = base * (inGust ? wm : 1);
    const dtZero = fuel / rate;
    const dtCatch = catching === null ? Infinity : Math.max(0, catching);
    const dtBound = nextBoundary - t;

    if (dtCatch <= dtZero && dtCatch <= dtBound) {
      fuel -= rate * dtCatch;
      t += dtCatch;
      catching = null;
      fuel += balance.oakSize;
      continue;
    }
    if (dtZero <= dtBound) {
      t += dtZero;
      fuel = 0;
      if (catching !== null) catching -= dtZero;
      embers = balance.emberA;
      if (tEmbers === Infinity) tEmbers = t;
      continue;
    }
    fuel -= rate * dtBound;
    if (catching !== null) catching -= dtBound;
    t = nextBoundary;
  }
  return { tEmbers, tWolf: Infinity };
}

/** Время до углей с учётом разгорающегося дуба и только объявленного ветра (13.3.6). */
export function timeToEmbers(s: GameState, side: Side): number {
  return projectFire(s, side, knownGusts(s)).tEmbers;
}

/** Время до волка с учётом разгорающегося дуба и только объявленного ветра (13.3.6). */
export function timeToWolf(s: GameState, side: Side): number {
  return projectFire(s, side, knownGusts(s)).tWolf;
}

/** Уровень глаз по топливу: 0 — нет, 1 — пара глаз, 2 — три пары ближе. */
export function eyesLevel(f: Fire): 0 | 1 | 2 {
  if (f.embers !== null) return 2;
  if (f.fuel < balance.eyesThreeBelow) return 2;
  if (f.fuel < balance.eyesOneBelow) return 1;
  return 0;
}
