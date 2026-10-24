import { describe, expect, it } from 'vitest';
import { balance, riskBlue } from '../src/config/balance.ts';
import { E, N, NE, NW, S, W } from '../src/core/clearing.ts';
import { timeToEmbers, timeToWolf } from '../src/core/fires.ts';
import { route } from '../src/core/intent.ts';
import { oakHint, ringLevel, urgency } from '../src/core/risk.ts';
import { makeState } from './helpers.ts';

describe('время до углей и до волка (13.3.6)', () => {
  it('считает разгорающийся дуб и только объявленный ветер', () => {
    const s = makeState({ level: 3, fuels: [1, 3, 3, 3] });
    const slotA = s.level.slotA;
    expect(timeToEmbers(s, N)).toBeCloseTo(slotA);
    expect(timeToWolf(s, N)).toBeCloseTo(slotA + balance.emberA);
    s.fires[N].catching = 2;
    expect(timeToEmbers(s, N)).toBeCloseTo(3 * slotA);
    s.fires[N].catching = null;
    s.gusts = [{ side: N, warn: 0, start: 2, end: 6, phase: 0 }];
    expect(timeToEmbers(s, N)).toBeCloseTo(slotA);
    s.gusts[0].phase = 1;
    const m = s.level.wind!.mult;
    expect(timeToEmbers(s, N)).toBeCloseTo(2 + 4 + (1 - (2 + 4 * m) / slotA) * slotA);
  });

  it('угли с разгорающимся дубом не опасны, если дуб успевает', () => {
    const s = makeState({ level: 2, fuels: [0, 3, 3, 3] });
    s.fires[N].embers = 2;
    s.fires[N].catching = 1;
    expect(timeToEmbers(s, N)).toBe(0);
    expect(timeToWolf(s, N)).toBeGreaterThan(10);
  });
});

describe('кольцо срочности (2.8.2)', () => {
  it('пороги: голубое ниже riskBlue(n), малиновое выше riskRed', () => {
    expect(ringLevel(riskBlue(2) - 0.01, 2)).toBe('calm');
    expect(ringLevel(riskBlue(2) + 0.01, 2)).toBe('soon');
    expect(ringLevel(balance.riskRed + 0.01, 2)).toBe('late');
    expect(riskBlue(9)).toBe(0.6);
  });

  it('на углях кольцо «угли»; полный костёр — спокойный', () => {
    const s = makeState({ pile: NW, fuels: [0, 3, 2, 2] });
    s.fires[N].embers = 1;
    expect(urgency(s, N).level).toBe('embers');
    expect(urgency(s, E).level).toBe('calm');
  });

  it('берёт самый быстрый способ: полено в руках или поход через поленницу', () => {
    const s = makeState({ pile: NW, fuels: [2, 0.3, 2, 2] });
    const u = urgency(s, E);
    expect(u.n).toBe(2);
    const need = 2 / s.p;
    expect(u.r).toBeCloseTo(need / (0.3 * s.level.slotA));
    s.hero.hands = { kind: null, count: 0 };
    s.hero.cell = NE;
    expect(urgency(s, E).n).toBe(3);
  });
});

describe('силуэт дуба (2.8.3)', () => {
  it('2 свободных места, горит, и дуб успеет разгореться с риском ≤ 25%', () => {
    const s = makeState({ pile: NW, fuels: [0.9, 2, 2, 2] });
    expect(oakHint(s, N)).toBe(true);
    s.fires[N].fuel = 1.2;
    s.fires[N].logs = [{ kind: 'birch', amount: 1.2 }];
    expect(oakHint(s, N)).toBe(false);
    s.fires[N].fuel = 0.35;
    s.fires[N].logs = [{ kind: 'birch', amount: 0.35 }];
    expect(oakHint(s, N)).toBe(false);
    const l1 = makeState({ level: 1, pile: NW, fuels: [0.9, 2, 2, 2] });
    expect(oakHint(l1, N)).toBe(false);
  });
});

describe('маршрут (2.8.4)', () => {
  it('с пустыми руками заходит к поленнице', () => {
    const s = makeState({ pile: NW, fuels: [2, 2, 2, 2] });
    s.hero.cell = NE;
    s.hero.hands = { kind: null, count: 0 };
    expect(route(s, { kind: 'feed', fire: S })).toEqual([NW, 2]);
    s.hero.hands = { kind: 'birch', count: 1 };
    expect(route(s, { kind: 'feed', fire: W })).toEqual([NW]);
    expect(route(s, { kind: 'feed', fire: E })).toEqual([]);
  });
});
