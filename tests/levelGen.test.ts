import { describe, expect, it } from 'vitest';
import { balance, riskBlue } from '../src/config/balance.ts';
import { LEVEL_IDS, levelById } from '../src/config/levels.ts';
import { SIDES, isNearFire, oppositeCorner } from '../src/core/clearing.ts';
import { buildLevel, generateLevel } from '../src/core/levelGen.ts';
import { nominalSurvives } from '../src/core/nominal.ts';
import { hashSeed, mulberry32 } from '../src/core/rng.ts';
import { lateShare } from '../src/core/simulate.ts';
import { makeGustSchedule } from '../src/core/wind.ts';

const pace = { tMed: 5, p: 0.8 };

describe('генерация уровня (5)', () => {
  it('палатка напротив поленницы, герой стартует у поленницы с двумя берёзами', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = buildLevel(3, seed, pace);
      expect(s.tent).toBe(oppositeCorner(s.pile));
      expect(s.hero.cell).toBe(s.pile);
      expect(s.hero.hands).toEqual({ kind: 'birch', count: 2 });
    }
  });

  it('раскладка укрытых и открытых честная: в каждой паре самый медленный и быстрый или средние', () => {
    for (const id of LEVEL_IDS) {
      for (let seed = 1; seed < 200; seed++) {
        const s = buildLevel(id, seed, pace);
        const near = s.fires.filter((f) => isNearFire(s.pile, f.side)).map((f) => f.mult);
        const far = s.fires.filter((f) => !isNearFire(s.pile, f.side)).map((f) => f.mult);
        const mean = (a: number[]) => (a[0] + a[1]) / 2;
        expect(Math.abs(mean(near) - mean(far))).toBeLessThanOrEqual(0.025 + 1e-9);
        const lvl = levelById(id);
        expect(s.fires.filter((f) => f.shelter === 'sheltered').length).toBe(lvl.sheltered);
        expect(s.fires.filter((f) => f.shelter === 'open').length).toBe(lvl.open);
      }
    }
  });

  it('стартовое топливо в диапазоне и с разбросом не меньше 0.6 места', () => {
    for (const id of LEVEL_IDS) {
      const [lo, hi] = levelById(id).startFuel;
      for (let seed = 1; seed < 200; seed++) {
        const fuels = buildLevel(id, seed, pace).fires.map((f) => f.fuel);
        expect(Math.min(...fuels)).toBeGreaterThanOrEqual(lo);
        expect(Math.max(...fuels)).toBeLessThanOrEqual(hi);
        expect(Math.max(...fuels) - Math.min(...fuels)).toBeGreaterThanOrEqual(balance.startFuelSpread);
      }
    }
  });

  it('на 1000 сидов генератор выдаёт только уровни, прошедшие номинальный прогон', () => {
    for (const id of LEVEL_IDS) {
      for (let i = 0; i < 1000; i++) {
        const g = generateLevel(id, hashSeed(77, i), pace, { warn: () => {} });
        expect(g.stretched).toBe(false);
        expect(nominalSurvives(g.state)).toBe(true);
      }
    }
  }, 120000);

  it('один сид — один уровень', () => {
    const a = generateLevel(5, 4242, pace).state;
    const b = generateLevel(5, 4242, pace).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('расписание порывов (2.4)', () => {
  it('первый не раньше windFirstA, без наложений, не два подряд с одной стороны', () => {
    for (const id of [3, 4, 5, 6, 'inf'] as const) {
      const lvl = levelById(id);
      for (let seed = 1; seed < 300; seed++) {
        const g = makeGustSchedule(mulberry32(seed), lvl.wind, lvl.nightA);
        expect(g.length).toBeGreaterThan(0);
        expect(g[0].start).toBeGreaterThanOrEqual(balance.windFirstA);
        for (let i = 0; i < g.length; i++) {
          expect(g[i].start - g[i].warn).toBeCloseTo(balance.windWarnA);
          expect(g[i].end - g[i].start).toBeCloseTo(lvl.wind!.dur);
          if (i > 0) {
            expect(g[i].start).toBeGreaterThanOrEqual(g[i - 1].end);
            expect(g[i].side).not.toBe(g[i - 1].side);
            const gap = g[i].start - g[i - 1].start;
            expect(gap).toBeLessThanOrEqual(lvl.wind!.every * balance.windGapMax + 1e-9);
          }
        }
        for (const x of g) expect(SIDES).toContain(x.side);
      }
    }
  });

  it('на уровнях 1–2 ветра нет', () => {
    expect(buildLevel(1, 1, pace).gusts).toEqual([]);
    expect(buildLevel(2, 1, pace).gusts).toEqual([]);
  });
});

describe('калибровка порогов кольца (2.8) по модели ответа (14.2)', () => {
  const RUNS = 20000;
  it('на границе голубого опозданий около 5%, на границе малинового — около 25%', () => {
    for (const tMed of [3, 5, 8]) {
      for (let n = 1; n <= 6; n++) {
        const rng = mulberry32(hashSeed(n, tMed));
        const blue = lateShare(rng, n, riskBlue(n), tMed, 0.8, RUNS);
        const red = lateShare(rng, n, balance.riskRed, tMed, 0.8, RUNS);
        expect(blue).toBeLessThan(0.065);
        expect(blue).toBeGreaterThan(0.035);
        expect(red).toBeGreaterThan(0.2);
        expect(red).toBeLessThan(0.3);
      }
    }
  });

  it('при точности 65–90% порог голубого сдвигается не больше чем на 0.06', () => {
    for (const p of [0.65, 0.9]) {
      for (let n = 1; n <= 6; n++) {
        const rng = mulberry32(hashSeed(n, p * 100));
        const below = lateShare(rng, n, riskBlue(n) - 0.06, 5, p, RUNS);
        const above = lateShare(rng, n, riskBlue(n) + 0.06, 5, p, RUNS);
        expect(below).toBeLessThan(0.05 + 0.01);
        expect(above).toBeGreaterThan(0.05 - 0.01);
      }
    }
  });
});
