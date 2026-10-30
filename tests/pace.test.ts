import { describe, expect, it } from 'vitest';
import { balance } from '../src/config/balance.ts';
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

  it('задания генератора: своё значение по умолчанию на уровень, без запаса', () => {
    const g = balance.paceGenerated;
    for (const cefr of ['A1', 'B1', 'C1']) {
      const s = new PaceTracker(memory(), paceConfigFor('generated', cefr)).snapshot();
      expect(s.median).toBe(g.defaultTMedByLevel[cefr]);
      expect(s.tMed).toBeCloseTo(g.defaultTMedByLevel[cefr]);
      expect(s.p).toBe(0.7);
    }
    expect(g.defaultTMedByLevel.B1).toBe(12);
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

  it('разброс оценивается по ответам, но на темп правил не влияет: T_эфф = медиана', () => {
    const calm = trackerWith('bank', 20, 5, 0.5, 3).snapshot();
    const wide = trackerWith('generated', 20, 12, 0.8, 3).snapshot();
    expect(calm.sigma).toBeGreaterThan(0.4);
    expect(calm.sigma).toBeLessThan(0.62);
    expect(wide.sigma).toBeGreaterThan(0.65);
    expect(calm.tMed).toBe(calm.median);
    expect(wide.tMed).toBe(wide.median);
    expect(spreadFactor(0.9, balance.pace)).toBe(1);
  });

  it('known(): своя медиана — с пяти ответов', () => {
    const t = new PaceTracker(memory(), paceConfigFor('generated'), paceKeyFor('generated'));
    for (let i = 0; i < 4; i++) t.record(8000, true);
    expect(t.known()).toBe(false);
    expect(t.snapshot().median).toBe(12);
    t.record(8000, true);
    expect(t.known()).toBe(true);
    expect(t.snapshot().median).toBe(8);
  });

  it('свои наборы слов — свой учёт на всех уровнях, по умолчанию 7 с, а не 12', () => {
    expect(paceKeyFor('generated', 'B1', true)).toBe('series:pace:gen:vocab');
    expect(paceKeyFor('generated', 'C1', true)).toBe('series:pace:gen:vocab');
    expect(paceKeyFor('bank', 'B1', true)).toBe(SERIES_PACE_KEY);
    const store = memory();
    const vocab = new PaceTracker(
      store,
      paceConfigFor('generated', 'B1', true),
      paceKeyFor('generated', 'B1', true),
    );
    expect(vocab.snapshot().tMed).toBe(balance.paceGenerated.defaultTMedVocab);
    for (let i = 0; i < 5; i++) vocab.record(5000, true);
    expect(vocab.snapshot().tMed).toBe(5);
    // Ответы на своих наборах слов не ускоряют ночь с предложениями генератора того же уровня.
    const gen = new PaceTracker(
      store,
      paceConfigFor('generated', 'B1'),
      paceKeyFor('generated', 'B1'),
    );
    expect(gen.known()).toBe(false);
    expect(gen.snapshot().tMed).toBe(12);
    expect(paceConfigFor('bank', 'B1', true)).toBe(balance.pace);
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

describe('ночь с заданиями генератора', () => {
  const pace = { tMed: 14, p: 0.7 };

  it('свои slotA и стартовое топливо, ночь не длиннее nightMaxSecGenerated', () => {
    for (const id of LEVEL_IDS) {
      const l = levelById(id);
      const s = buildLevel(id, 7, pace, 1, { generated: true });
      expect(s.generated).toBe(true);
      expect(s.level.slotA).toBe(l.generated.slotA);
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

  it('баланс как у банка: ученик с 80% верных — цели раздела 14, дуб окупается, знание решает', () => {
    const good = genOptions({ sigma: 0.6 });
    const win = (level: 1 | 4, bot: 'mixed' | 'birch', p = 0.8) => {
      const r = simulate(level, bot, 500, 10, p, 3, good);
      return r.win / r.runs;
    };
    expect(win(1, 'mixed')).toBeGreaterThan(0.97);
    const mixed = win(4, 'mixed');
    expect(mixed).toBeGreaterThan(0.72);
    expect(mixed).toBeLessThan(0.9);
    expect(win(4, 'birch')).toBeLessThan(mixed - 0.1);
    expect(win(4, 'mixed', 0.9)).toBeGreaterThan(win(4, 'mixed', 0.7) + 0.15);
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
