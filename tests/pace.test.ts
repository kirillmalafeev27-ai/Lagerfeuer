import { describe, expect, it } from 'vitest';
import { balance, riskBlue } from '../src/config/balance.ts';
import { levelById, LEVEL_IDS } from '../src/config/levels.ts';
import { assistEmberMul, buildLevel, generateLevel } from '../src/core/levelGen.ts';
import { advance } from '../src/core/rules.ts';
import { hashSeed, logNormal, mulberry32 } from '../src/core/rng.ts';
import { paceConfigFor, paceKeyFor } from '../src/game/pacing.ts';
import { PaceTracker, SERIES_PACE_KEY, shrunkSigma, spreadFactor } from '../src/shared/pace.ts';
import type { KeyValueStorage } from '../src/shared/storage.ts';
import { simulate, genOptions } from '../tools/sim.ts';

function memory(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

/** Учёт темпа с ответами логнормального игрока. */
function trackerWith(
  kind: 'bank' | 'generated',
  n: number,
  tMed: number,
  sigma: number,
  seed = 1,
): PaceTracker {
  const t = new PaceTracker(memory(), paceConfigFor(kind), paceKeyFor(kind));
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) t.record(logNormal(rng, tMed, sigma) * 1000, true);
  return t;
}

describe('учёт темпа (раздел 3)', () => {
  it('без ответов — значения по умолчанию; у банка поправки нет: 5 с', () => {
    const s = new PaceTracker(memory(), paceConfigFor('bank')).snapshot();
    expect(s.tMed).toBeCloseTo(5);
    expect(s.p).toBe(0.8);
    expect(s.sigma).toBe(0.5);
  });

  it('задания генератора: своё значение по умолчанию на уровень, с поправкой на разброс', () => {
    const g = balance.paceGenerated;
    for (const cefr of ['A1', 'B1', 'C1']) {
      const s = new PaceTracker(memory(), paceConfigFor('generated', cefr)).snapshot();
      const f = Math.exp(balance.pace.spreadGain * (g.defaultSigma - balance.pace.refSigma));
      expect(s.median).toBe(g.defaultTMedByLevel[cefr]);
      expect(s.tMed).toBeCloseTo(g.defaultTMedByLevel[cefr] * f * g.allowance);
      expect(s.p).toBe(0.7);
    }
  });

  it('потолок медианы: 10 с у банка, 30 с у заданий генератора', () => {
    expect(trackerWith('bank', 20, 25, 0.3).snapshot().median).toBe(10);
    expect(trackerWith('generated', 20, 25, 0.3).snapshot().median).toBeGreaterThan(20);
    expect(trackerWith('generated', 20, 60, 0.3).snapshot().median).toBe(30);
  });

  it('банк и генератор хранятся отдельно и не смешиваются; у генератора — ключ на уровень', () => {
    const store = memory();
    const bank = new PaceTracker(store, paceConfigFor('bank'), paceKeyFor('bank'));
    const gen = new PaceTracker(
      store,
      paceConfigFor('generated', 'B1'),
      paceKeyFor('generated', 'B1'),
    );
    for (let i = 0; i < 10; i++) {
      bank.record(3000, true);
      gen.record(13000, i % 3 !== 0);
    }
    expect(paceKeyFor('bank')).toBe(SERIES_PACE_KEY);
    expect(paceKeyFor('generated', 'B1')).toBe('series:pace:gen:B1');
    expect([...store.map.keys()].sort()).toEqual(['series:pace', 'series:pace:gen:B1']);
    expect(bank.snapshot().median).toBe(3);
    expect(gen.snapshot().median).toBe(13);
    expect(gen.snapshot().p).toBeCloseTo(0.6);
  });

  it('разброс оценивается по ответам: σ 0.5 — поправки почти нет, σ 0.8 — ночь щадящая', () => {
    const calm = trackerWith('bank', 20, 5, 0.5, 3).snapshot();
    const wide = trackerWith('bank', 20, 5, 0.8, 3).snapshot();
    expect(calm.sigma).toBeGreaterThan(0.4);
    expect(calm.sigma).toBeLessThan(0.62);
    expect(wide.sigma).toBeGreaterThan(0.65);
    expect(wide.tMed / wide.median).toBeGreaterThan(1.15);
    expect(spreadFactor(0.5, balance.pace)).toBe(1);
  });

  it('одна долгая задумчивость не раздувает разброс и не сдвигает медиану', () => {
    const times = Array.from({ length: 19 }, (_, i) => 10 + (i % 5) * 0.4);
    const sigma = shrunkSigma([...times, 200], 10.8, balance.pace);
    expect(sigma).toBeLessThan(0.55);
    const t = new PaceTracker(memory(), paceConfigFor('generated'), paceKeyFor('generated'));
    for (const x of [...times, 200]) t.record(x * 1000, true);
    expect(t.snapshot().median).toBeCloseTo(10.8, 0);
  });
});

describe('поправка на разброс держит задуманные пороги колец (2.8)', () => {
  /** Доля опозданий n действий при r = need / доступное, для игрока с разбросом σ. */
  function late(n: number, r: number, sigma: number, runs: number, seed: number): number {
    const rng = mulberry32(seed);
    const tMed = 5;
    const p = 0.8;
    const A = tMed * spreadFactor(sigma, balance.pace) + balance.unitOverheadSec;
    const avail = (n * A) / (p * r);
    const swap = balance.questionSwapMs / 1000;
    const wrong = balance.wrongFeedbackMs / 1000;
    let k = 0;
    for (let i = 0; i < runs; i++) {
      let t = 0;
      let got = 0;
      while (got < n && t <= avail) {
        t += logNormal(rng, tMed, sigma);
        if (rng() < p) {
          got++;
          if (got < n) t += swap;
        } else t += wrong + swap;
      }
      if (t > avail) k++;
    }
    return k / runs;
  }

  it('на границе голубого опаздывают 3.5–9%, малинового — 17–31% при σ от 0.4 до 0.9', () => {
    for (const sigma of [0.4, 0.65, 0.9]) {
      for (const n of [1, 3, 6]) {
        const blue = late(n, riskBlue(n), sigma, 8000, hashSeed(n, sigma * 100));
        const red = late(n, balance.riskRed, sigma, 8000, hashSeed(n, sigma * 100, 2));
        expect(blue, `σ ${sigma}, n ${n}`).toBeGreaterThan(0.035);
        expect(blue, `σ ${sigma}, n ${n}`).toBeLessThan(0.09);
        expect(red, `σ ${sigma}, n ${n}`).toBeGreaterThan(0.17);
        expect(red, `σ ${sigma}, n ${n}`).toBeLessThan(0.31);
      }
    }
  });
});

describe('ночь с заданиями генератора', () => {
  const pace = { tMed: 14, p: 0.7 };

  it('свои slotA и стартовое топливо, ночь не длиннее nightMaxSecGenerated', () => {
    for (const id of LEVEL_IDS) {
      const l = levelById(id);
      const s = buildLevel(id, 7, pace, 1, { generated: true });
      expect(s.generated).toBe(true);
      expect(s.level.slotA).toBe(l.generated.slotA);
      expect(s.level.slotA).toBeGreaterThan(l.slotA);
      for (const f of s.fires) {
        expect(f.fuel).toBeGreaterThanOrEqual(l.generated.startFuel[0] - 1e-9);
        expect(f.fuel).toBeLessThanOrEqual(l.generated.startFuel[1] + 1e-9);
      }
      expect(s.nightA * s.A).toBeLessThanOrEqual(balance.nightMaxSecGenerated + 1e-9);
      // У банка — как раньше.
      const b = buildLevel(id, 7, { tMed: 9, p: 0.8 });
      expect(b.generated).toBe(false);
      expect(b.level.slotA).toBe(l.slotA);
      expect(b.nightA * b.A).toBeLessThanOrEqual(balance.nightMaxSec + 1e-9);
    }
  });

  it('уровни проходят номинальный прогон и с заданиями генератора', () => {
    for (const id of [2, 4, 6] as const) {
      let stretched = 0;
      for (let i = 0; i < 100; i++)
        if (generateLevel(id, hashSeed(i, 5), pace, { generated: true, warn: () => {} }).stretched)
          stretched++;
      expect(stretched, `уровень ${id}`).toBeLessThanOrEqual(2);
    }
  });

  it('баланс: типичный ученик проходит, дуб окупается, знание решает (симуляция, 14)', () => {
    const typical = genOptions();
    const win = (level: 1 | 4, bot: 'mixed' | 'birch', p = 0.7) => {
      const r = simulate(level, bot, 500, 12, p, 3, typical);
      return r.win / r.runs;
    };
    expect(win(1, 'mixed')).toBeGreaterThan(0.95);
    const mixed = win(4, 'mixed');
    expect(mixed).toBeGreaterThan(0.76);
    expect(mixed).toBeLessThan(0.93);
    expect(win(4, 'birch')).toBeLessThan(mixed - 0.05);
    expect(win(4, 'mixed', 0.85)).toBeGreaterThan(win(4, 'mixed', 0.6) + 0.1);
  });
});

describe('помощь после неудач — сухой мох: угли тлеют дольше', () => {
  it('ступени: ×1.5 после двух поражений подряд, ×2 после четырёх', () => {
    expect(assistEmberMul(0)).toBe(1);
    expect(assistEmberMul(1)).toBe(balance.assist.emberMul[0]);
    expect(assistEmberMul(2)).toBe(balance.assist.emberMul[1]);
    expect(assistEmberMul(5)).toBe(balance.assist.emberMul[1]);
  });

  it('угли этой ночи тлеют дольше, и волк выходит позже', () => {
    const plain = buildLevel(3, 11, { tMed: 5, p: 0.8 }, 1, {});
    const helped = buildLevel(3, 11, { tMed: 5, p: 0.8 }, 1, { assist: 2 });
    expect(plain.emberA).toBe(balance.emberA);
    expect(helped.emberA).toBeCloseTo(balance.emberA * 2);
    for (const s of [plain, helped]) {
      s.gusts = [];
      for (const f of s.fires) {
        f.fuel = 0.01;
        f.logs = [{ kind: 'birch', amount: 0.01 }];
      }
    }
    advance(plain, balance.emberA + 0.5, []);
    advance(helped, balance.emberA + 0.5, []);
    expect(plain.status).toBe('lost');
    expect(helped.status).toBe('playing');
    advance(helped, balance.emberA, []);
    expect(helped.status).toBe('lost');
  });
});
