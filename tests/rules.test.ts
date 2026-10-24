import { describe, expect, it } from 'vitest';
import { balance } from '../src/config/balance.ts';
import { E, N, NE, NW, S, SE, SW, W } from '../src/core/clearing.ts';
import { reduce } from '../src/core/rules.ts';
import { correct, makeState, run, tickA, types, wrong } from './helpers.ts';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('дрова (2.2)', () => {
  it('берёза занимает 1 место и вспыхивает сразу', () => {
    const s = makeState({ pile: NW, fuels: [1.5, 2, 2, 2] });
    const r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: N }, correct]);
    close(r.state.fires[N].fuel, 2.5);
    expect(r.events).toContainEqual({ type: 'FED', fire: N, kind: 'birch', relit: false });
    expect(r.state.hero.hands).toEqual({ kind: 'birch', count: 1 });
  });

  it('дуб занимает 2 места сразу, а топливо растёт только через oakCatchA', () => {
    const s = makeState({ pile: NW, fuels: [1, 2, 2, 2] });
    let r = run(s, [
      { type: 'SET_INTENT', kind: 'pile', wood: 'oak' },
      { type: 'SET_INTENT', kind: 'feed', fire: N },
      correct,
    ]);
    expect(r.events).toContainEqual({ type: 'SWAP', kind: 'oak' });
    const f = r.state.fires[N];
    expect(f.catching).toBeCloseTo(balance.oakCatchA);
    close(f.fuel, 1);
    r = run(r.state, [tickA(r.state, balance.oakCatchA - 0.01)]);
    expect(types(r.events)).not.toContain('OAK_CAUGHT');
    r = run(r.state, [tickA(r.state, 0.02)]);
    expect(types(r.events)).toContain('OAK_CAUGHT');
    const burned = (balance.oakCatchA + 0.01) / r.state.level.slotA;
    close(r.state.fires[N].fuel, 1 - burned + 2, 1e-4);
    expect(r.state.fires[N].catching).toBeNull();
  });

  it('полено, которое не влезает целиком, не подбрасывается: PASST NICHT', () => {
    const s = makeState({ pile: NW, fuels: [2.5, 2, 2, 2] });
    const r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: N }]);
    expect(r.events).toContainEqual({ type: 'DENIED', reason: 'noFit', fire: N });
    expect(r.state.hero.intent).toBeNull();
    const s2 = makeState({ pile: NW, fuels: [1.2, 2, 2, 2] });
    const r2 = run(s2, [
      { type: 'SET_INTENT', kind: 'pile', wood: 'oak' },
      { type: 'SET_INTENT', kind: 'feed', fire: N },
    ]);
    expect(r2.events).toContainEqual({ type: 'DENIED', reason: 'noFit', fire: N });
  });

  it('дуб на угли положить нельзя: NUR BIRKE', () => {
    const s = makeState({ pile: NW, fuels: [0, 2, 2, 2] });
    s.fires[N].embers = 2;
    const r = run(s, [
      { type: 'SET_INTENT', kind: 'pile', wood: 'oak' },
      { type: 'SET_INTENT', kind: 'feed', fire: N },
    ]);
    expect(r.events).toContainEqual({ type: 'DENIED', reason: 'oakOnEmbers', fire: N });
  });

  it('в руках 2 берёзы или 1 дуб, на уровне 1 дуба нет', () => {
    const s = makeState({ pile: NW, fuels: [2, 2, 2, 2] });
    const r = run(s, [{ type: 'SELECT_WOOD', kind: 'oak' }]);
    expect(r.state.hero.hands).toEqual({ kind: 'oak', count: 1 });
    const l1 = makeState({ level: 1, pile: NW, fuels: [2, 2, 2, 2] });
    const r1 = run(l1, [{ type: 'SELECT_WOOD', kind: 'oak' }]);
    expect(r1.events).toContainEqual({ type: 'DENIED', reason: 'noWood' });
    expect(r1.state.hero.hands).toEqual({ kind: 'birch', count: 2 });
  });

  it('взять дрова бесплатно; проходя через поленницу, герой добирает тот же вид', () => {
    const s = makeState({ pile: NW, fuels: [1, 1, 1, 1] });
    s.hero.cell = NE;
    s.hero.hands = { kind: 'birch', count: 1 };
    const r = run(s, [{ type: 'SET_INTENT', kind: 'move', cell: SW }, correct]);
    expect(r.state.hero.cell).toBe(NW);
    expect(r.state.hero.hands).toEqual({ kind: 'birch', count: 2 });
    expect(r.events).toContainEqual({ type: 'PICKUP', kind: 'birch', n: 1 });
    expect(r.state.stats.correct).toBe(1);
  });

  it('с пустыми руками у поленницы герой берёт выбранный вид', () => {
    const s = makeState({ pile: NW, fuels: [1, 1, 1, 1] });
    s.hero.cell = NE;
    s.hero.hands = { kind: null, count: 0 };
    const r = run(s, [
      { type: 'SELECT_WOOD', kind: 'oak' },
      { type: 'SET_INTENT', kind: 'pile' },
      correct,
    ]);
    expect(r.state.hero.cell).toBe(NW);
    expect(r.state.hero.hands).toEqual({ kind: 'oak', count: 1 });
  });
});

describe('костры, угли и волки (2.3)', () => {
  it('место прогорает за slotA, делённое на множитель', () => {
    const s = makeState({ fuels: [3, 3, 3, 3], mults: [1, 1.25, 0.8, 1] });
    const r = run(s, [tickA(s, 4)]);
    const slotA = s.level.slotA;
    close(r.state.fires[N].fuel, 3 - 4 / slotA);
    close(r.state.fires[E].fuel, 3 - (4 * 1.25) / slotA);
    close(r.state.fires[S].fuel, 3 - (4 * 0.8) / slotA);
  });

  it('глаза: меньше 1 места — пара, меньше 0.5 — три пары', () => {
    const s = makeState({ fuels: [1.2, 3, 3, 3] });
    const slotA = s.level.slotA;
    let r = run(s, [tickA(s, 0.2 * slotA - 0.01)]);
    expect(types(r.events)).not.toContain('FIRE_LOW');
    r = run(r.state, [tickA(s, 0.02)]);
    expect(r.events).toContainEqual({ type: 'FIRE_LOW', fire: N, level: 1 });
    r = run(r.state, [tickA(s, 0.5 * slotA)]);
    expect(r.events).toContainEqual({ type: 'FIRE_LOW', fire: N, level: 2 });
  });

  it('догоревший костёр превращается в угли на emberA, потом выходит волк', () => {
    const s = makeState({ fuels: [0.1, 3, 3, 3] });
    const slotA = s.level.slotA;
    let r = run(s, [tickA(s, 0.1 * slotA + 0.001)]);
    expect(r.events).toContainEqual({ type: 'EMBERS', fire: N });
    expect(r.state.fires[N].embers).not.toBeNull();
    expect(r.state.stats.everEmbers).toBe(true);
    r = run(r.state, [tickA(s, balance.emberA - 0.01)]);
    expect(r.state.status).toBe('playing');
    const cd = r.events.filter((e) => e.type === 'EMBER_COUNTDOWN').map((e) => (e as { n: number }).n);
    expect(cd).toEqual([3, 2, 1]);
    r = run(r.state, [tickA(s, 0.02)]);
    expect(r.events).toContainEqual({ type: 'WOLF_IN', fire: N });
    expect(r.state.status).toBe('lost');
  });

  it('берёза на углях сразу зажигает костёр с 1 местом', () => {
    const s = makeState({ pile: NW, fuels: [0, 3, 3, 3] });
    s.fires[N].embers = 1;
    const r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: N }, correct]);
    expect(r.state.fires[N].embers).toBeNull();
    close(r.state.fires[N].fuel, balance.relightFuel);
    expect(r.events).toContainEqual({ type: 'RELIT', fire: N, by: 'birch' });
  });

  it('дуб, начавший разгораться до углей, спасает костёр, если успевает', () => {
    const s = makeState({ pile: NW, fuels: [0.3, 3, 3, 3] });
    let r = run(s, [
      { type: 'SET_INTENT', kind: 'pile', wood: 'oak' },
      { type: 'SET_INTENT', kind: 'feed', fire: N },
      correct,
    ]);
    r = run(r.state, [tickA(s, balance.oakCatchA + 0.5)]);
    expect(types(r.events)).toContain('EMBERS');
    expect(r.events).toContainEqual({ type: 'RELIT', fire: N, by: 'oak' });
    expect(r.state.status).toBe('playing');
    expect(r.state.fires[N].embers).toBeNull();
  });

  it('дуб не спасает, если угли дотлевают раньше', () => {
    const s = makeState({ pile: NW, fuels: [0.02, 3, 3, 3] });
    let r = run(s, [
      { type: 'SET_INTENT', kind: 'pile', wood: 'oak' },
      { type: 'SET_INTENT', kind: 'feed', fire: N },
      correct,
    ]);
    r = run(r.state, [tickA(s, balance.oakCatchA)]);
    expect(r.state.status).toBe('lost');
  });

  it('горит то, что положили раньше', () => {
    const s = makeState({ pile: NW, fuels: [0.5, 3, 3, 3] });
    let r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: N }, correct]);
    expect(r.state.fires[N].logs.map((l) => l.kind)).toEqual(['birch', 'birch']);
    r = run(r.state, [tickA(s, 0.5 * s.level.slotA + 0.01)]);
    expect(r.state.fires[N].logs.length).toBe(1);
  });
});

describe('ветер (2.4)', () => {
  it('порыв объявляется заранее и раздувает только свой костёр', () => {
    const s = makeState({
      level: 3,
      fuels: [3, 3, 3, 3],
      gusts: [{ side: E, warn: 1, start: 5, end: 10, phase: 0 }],
    });
    const r = run(s, [tickA(s, 10.5)]);
    expect(types(r.events).filter((t) => t.startsWith('WIND'))).toEqual(['WIND_WARN', 'WIND_START', 'WIND_END']);
    const slotA = s.level.slotA;
    const m = s.level.wind!.mult;
    close(r.state.fires[E].fuel, 3 - (5 + 5 * m + 0.5) / slotA, 1e-6);
    close(r.state.fires[N].fuel, 3 - 10.5 / slotA, 1e-6);
  });
});

describe('действия и намерение (2.5)', () => {
  it('тап по дальнему костру: шаг, потом бросок', () => {
    const s = makeState({ pile: NW, fuels: [2, 1, 2, 2] });
    let r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: E }, correct]);
    expect(r.state.hero.cell).toBe(NE);
    expect(r.events).toContainEqual({ type: 'STEP', from: NW, to: NE });
    r = run(r.state, [correct]);
    close(r.state.fires[E].fuel, 2);
    expect(r.state.hero.intent).toBeNull();
  });

  it('«×2»: повторный тап — обе берёзы в один костёр, потом само «к поленнице»', () => {
    const s = makeState({ pile: NW, fuels: [2, 0.5, 2, 2] });
    let r = run(s, [
      { type: 'SET_INTENT', kind: 'feed', fire: E },
      { type: 'SET_INTENT', kind: 'feed', fire: E },
    ]);
    expect(r.state.hero.x2).toBe(true);
    r = run(r.state, [correct, correct, correct]);
    close(r.state.fires[E].fuel, 2.5);
    expect(r.state.hero.hands.kind).toBeNull();
    expect(r.state.hero.intent).toEqual({ kind: 'pile' });
    expect(r.state.hero.autoIntent).toBe(true);
    r = run(r.state, [correct]);
    expect(r.state.hero.cell).toBe(NW);
    expect(r.state.hero.hands).toEqual({ kind: 'birch', count: 2 });
  });

  it('«×2» недоступно, если в костре нет места на обе', () => {
    const s = makeState({ pile: NW, fuels: [2, 1.5, 2, 2] });
    const r = run(s, [
      { type: 'SET_INTENT', kind: 'feed', fire: E },
      { type: 'SET_INTENT', kind: 'feed', fire: E },
    ]);
    expect(r.state.hero.x2).toBe(false);
  });

  it('готовое действие копится, но не больше одного', () => {
    const s = makeState({ pile: NW, fuels: [1, 2, 2, 1] });
    let r = run(s, [correct]);
    expect(r.state.hero.ready).toBe(true);
    expect(types(r.events)).toContain('READY');
    r = run(r.state, [correct]);
    expect(r.state.stats.correct).toBe(1);
    r = run(r.state, [{ type: 'SET_INTENT', kind: 'feed', fire: N }]);
    expect(r.state.hero.ready).toBe(false);
    close(r.state.fires[N].fuel, 2);
    r = run(r.state, [{ type: 'SET_INTENT', kind: 'feed', fire: W }]);
    close(r.state.fires[W].fuel, 1);
    expect(r.state.hero.intent).toEqual({ kind: 'feed', fire: W });
  });

  it('неправильный ответ не выполняет действие', () => {
    const s = makeState({ pile: NW, fuels: [1, 2, 2, 2] });
    const r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: N }, wrong]);
    close(r.state.fires[N].fuel, 1);
    expect(r.state.stats.wrong).toBe(1);
    expect(r.state.hero.intent).toEqual({ kind: 'feed', fire: N });
  });

  it('«стоять» снимает намерение', () => {
    const s = makeState({ pile: NW, fuels: [1, 2, 2, 2] });
    const r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: E }, { type: 'SET_INTENT', kind: 'stay' }, correct]);
    expect(r.state.hero.cell).toBe(NW);
    expect(r.state.hero.ready).toBe(true);
  });

  it('тап по клетке — идти туда; диагональ — два шага', () => {
    const s = makeState({ pile: NW, fuels: [2, 2, 2, 2] });
    let r = run(s, [{ type: 'SET_INTENT', kind: 'move', cell: SW }, correct]);
    expect(r.state.hero.cell).toBe(SW);
    expect(r.state.hero.intent).toBeNull();
    r = run(s, [{ type: 'SET_INTENT', kind: 'move', cell: SE }, correct]);
    expect(r.state.hero.cell).toBe(NE);
    expect(r.state.hero.intent).toEqual({ kind: 'move', cell: SE });
    r = run(r.state, [correct]);
    expect(r.state.hero.cell).toBe(SE);
    expect(r.state.hero.intent).toBeNull();
  });

  it('с пустыми руками маршрут к костру идёт через поленницу', () => {
    const s = makeState({ pile: NW, fuels: [2, 1, 2, 2] });
    s.hero.cell = NE;
    s.hero.hands = { kind: null, count: 0 };
    let r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: E }, correct]);
    expect(r.state.hero.cell).toBe(NW);
    expect(r.state.hero.hands.count).toBe(2);
    r = run(r.state, [correct, correct]);
    close(r.state.fires[E].fuel, 2);
  });
});

describe('рассвет, итог и звёзды (2.6)', () => {
  it('последние 20% ночи — рассвет, в конце ночи победа', () => {
    const s = makeState({ level: 1, fuels: [3, 3, 3, 3] });
    let r = run(s, [tickA(s, s.nightA * 0.8 - 0.01)]);
    expect(types(r.events)).not.toContain('DAWN_START');
    r = run(r.state, [tickA(s, 0.02)]);
    expect(types(r.events)).toContain('DAWN_START');
    r = run(r.state, [tickA(s, s.nightA)]);
    expect(r.state.status).toBe('won');
  });

  it('★★★ — все костры ≥ 1 места; ★★ — без углей; ★ — дожил', () => {
    const s = makeState({ level: 1, fuels: [3, 3, 3, 3] });
    s.nightA = 10;
    const r = run(s, [tickA(s, 11)]);
    expect(r.state.stars).toBe(3);
    expect(r.events).toContainEqual({ type: 'DAWN', stars: 3 });

    const s2 = makeState({ level: 1, fuels: [3, 3, 3, 1.4] });
    s2.nightA = 10;
    expect(run(s2, [tickA(s2, 11)]).state.stars).toBe(2);

    const s3 = makeState({ level: 1, fuels: [3, 3, 3, 3] });
    s3.nightA = 10;
    s3.stats.everEmbers = true;
    expect(run(s3, [tickA(s3, 11)]).state.stars).toBe(1);
  });

  it('★★★ считает только горящее топливо: разгорающийся дуб не в счёт', () => {
    const s = makeState({ level: 2, fuels: [3, 3, 3, 0.9] });
    s.nightA = 1;
    s.fires[W].catching = 3;
    expect(run(s, [tickA(s, 2)]).state.stars).toBe(2);
  });

  it('ночь не длиннее nightMaxSec', () => {
    const s = makeState({ level: 4, tMed: 9 });
    expect(s.nightA * s.A).toBeLessThanOrEqual(balance.nightMaxSec + 1e-9);
    const s5 = makeState({ level: 4, tMed: 5 });
    expect(s5.nightA).toBe(s5.level.nightA);
  });
});

describe('пауза (2.7)', () => {
  it('на паузе стоят горение, дуб, угли, ветер и ночь', () => {
    const s = makeState({ level: 3, fuels: [1, 1, 1, 0] });
    s.fires[W].embers = 1;
    s.fires[N].catching = 1;
    s.gusts = [{ side: E, warn: 0.5, start: 1, end: 2, phase: 0 }];
    const r = run(s, [{ type: 'PAUSE' }, tickA(s, 5)]);
    expect(r.state.t).toBe(0);
    expect(r.state.fires[N].fuel).toBe(1);
    expect(r.state.fires[N].catching).toBe(1);
    expect(r.state.fires[W].embers).toBe(1);
    expect(r.events).toEqual([]);
    const r2 = run(r.state, [{ type: 'RESUME' }, tickA(s, 0.1)]);
    expect(r2.state.t).toBeGreaterThan(0);
  });
});

describe('редуктор', () => {
  it('не мутирует вход и детерминирован', () => {
    const s = makeState({ pile: NW, fuels: [1, 1.5, 2, 2.4] });
    const snapshot = JSON.stringify(s);
    const log = [
      { type: 'SET_INTENT' as const, kind: 'feed' as const, fire: E },
      correct,
      tickA(s, 1.3),
      wrong,
      correct,
      tickA(s, 7.7),
    ];
    const a = run(s, log);
    const b = run(s, log);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.events).toEqual(b.events);
  });

  it('действие считается в момент ответа', () => {
    const s = makeState({ pile: NW, fuels: [1, 2, 2, 2] });
    const r1 = reduce(s, { type: 'SET_INTENT', kind: 'feed', fire: N });
    const r2 = reduce(r1.state, correct);
    close(r2.state.fires[N].fuel, 2);
    expect(r2.state.t).toBe(0);
  });

  it('стоит игрок и ничего не делает — костры гаснут, волк выходит', () => {
    const s = makeState({ level: 4, pile: NW });
    const r = run(s, [tickA(s, 200)]);
    expect(r.state.status).toBe('lost');
    expect(types(r.events)).toContain('WOLF_IN');
    expect(r.state.stats.cause).not.toBeNull();
  });

  it('с юга можно кормить и юго-западный костёр', () => {
    const s = makeState({ pile: SW, fuels: [2, 2, 1, 1] });
    const r = run(s, [{ type: 'SET_INTENT', kind: 'feed', fire: S }, correct, { type: 'SET_INTENT', kind: 'feed', fire: W }, correct]);
    close(r.state.fires[S].fuel, 2);
    close(r.state.fires[W].fuel, 2);
  });
});
