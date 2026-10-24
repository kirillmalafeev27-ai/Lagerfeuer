// Боты (раздел 14.3): смешанный, «только берёза», «только дуб» и планировщик.
// Боты задают намерения через тот же редуктор, что и игрок.

import { balance } from '../config/balance.ts';
import type { Side } from './clearing.ts';
import type { GameEvent } from './events.ts';
import { projectFire, timeToEmbers, timeToWolf } from './fires.ts';
import { stepsViaPile, stepsWithHands } from './intent.ts';
import { type Rng, mulberry32 } from './rng.ts';
import { apply } from './rules.ts';
import { playNight } from './simulate.ts';
import { type GameState, cloneState } from './state.ts';
import { knownGusts } from './wind.ts';
import { type WoodKind, fits } from './wood.ts';

export type BotName = 'mixed' | 'birch' | 'oak' | 'planner';

/** Бот задаёт намерения (бесплатные действия) прямо перед ответом или при готовом действии. */
export type PlanFn = (s: GameState, ev: GameEvent[]) => void;

/** τ = tauFactor × A / p — среднее время действия, в единицах A. */
export function tauOf(s: GameState): number {
  return balance.tauFactor / s.p;
}

/** Смешанный бот у поленницы: берёза, если кто-то догорит раньше, чем донесём берёзу с запасом. */
export function chooseWoodMixed(s: GameState): WoodKind {
  if (!s.level.oak) return 'birch';
  const tau = tauOf(s);
  for (const f of s.fires) {
    const n = stepsViaPile(s, f.side) + 1;
    if (timeToEmbers(s, f.side) < (n + 1) * tau) return 'birch';
  }
  const gusts = knownGusts(s);
  for (const f of s.fires) {
    if (!fits(f, 'oak')) continue;
    const n = stepsViaPile(s, f.side) + 1;
    const arrive = n * tau;
    const pr = projectFire(s, f.side, gusts);
    if (arrive < pr.tEmbers && arrive + balance.oakCatchA + tau < pr.tWolf) return 'oak';
  }
  return 'birch';
}

/** Костёр, куда влезает полено и где меньше всего времени до волка (при равенстве — ближе). */
export function targetByWolf(s: GameState, kind: WoodKind): Side | null {
  let best: Side | null = null;
  let bestT = Infinity;
  let bestSteps = Infinity;
  for (const f of s.fires) {
    if (!fits(f, kind)) continue;
    const tw = timeToWolf(s, f.side);
    const st = stepsWithHands(s, f.side);
    if (tw < bestT - 1e-9 || (Math.abs(tw - bestT) <= 1e-9 && st < bestSteps)) {
      best = f.side;
      bestT = tw;
      bestSteps = st;
    }
  }
  return best;
}

/**
 * Бот с выбором дров у поленницы. Вид выбирается «с пустыми руками»: когда руки пусты
 * (на пути к поленнице) и сразу после того, как герой набрал дрова у поленницы, —
 * у поленницы смена вида бесплатна.
 */
function makePlanWith(chooseWood: (s: GameState) => WoodKind, initialKey = -1): PlanFn {
  let decidedKey = initialKey;
  return (s, ev) => {
    const h = s.hero;
    const key = s.stats.birchFed + s.stats.oakFed;
    if (h.hands.kind === null) {
      const k = chooseWood(s);
      if (k !== s.selectedWood) apply(s, { type: 'SELECT_WOOD', kind: k }, ev);
    } else if (h.cell === s.pile && key !== decidedKey) {
      decidedKey = key;
      const k = chooseWood(s);
      if (k !== h.hands.kind || k !== s.selectedWood) apply(s, { type: 'SELECT_WOOD', kind: k }, ev);
    }
    if (h.hands.kind === null) {
      if (!h.intent || h.intent.kind !== 'pile') apply(s, { type: 'SET_INTENT', kind: 'pile' }, ev);
      return;
    }
    const target = targetByWolf(s, h.hands.kind);
    if (target === null) {
      if (h.intent) apply(s, { type: 'SET_INTENT', kind: 'stay' }, ev);
      return;
    }
    const it = h.intent;
    if (!it || it.kind !== 'feed' || it.fire !== target) {
      apply(s, { type: 'SET_INTENT', kind: 'feed', fire: target }, ev);
    }
  };
}

export const makeMixedBot = (initialKey = -1): PlanFn => makePlanWith(chooseWoodMixed, initialKey);
export const makeBirchBot = (): PlanFn => makePlanWith(() => 'birch');
export const makeOakBot = (): PlanFn => makePlanWith((s) => (s.level.oak ? 'oak' : 'birch'));

type Option = { kind: 'feed'; fire: Side } | { kind: 'pile'; wood: WoodKind };

function applyOption(s: GameState, o: Option, ev: GameEvent[]): void {
  if (o.kind === 'feed') apply(s, { type: 'SET_INTENT', kind: 'feed', fire: o.fire }, ev);
  else apply(s, { type: 'SET_INTENT', kind: 'pile', wood: o.wood }, ev);
}

function sameOption(a: Option | null, b: Option): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === 'feed' ? a.fire === (b as { fire: Side }).fire : a.wood === (b as { wood: WoodKind }).wood;
}

/** Что сделал бы смешанный бот из этого состояния. */
function mixedOption(s: GameState): Option | null {
  const h = s.hero;
  if (h.hands.kind === null) return { kind: 'pile', wood: chooseWoodMixed(s) };
  const target = targetByWolf(s, h.hands.kind);
  return target === null ? null : { kind: 'feed', fire: target };
}

/**
 * Планировщик: для каждого варианта (каждый костёр, куда влезает полено в руках, и обе
 * половины поленницы) — 12 прогонов следующих 22 единиц со случайными ответами,
 * дальше смешанным ботом; выбирается вариант с наибольшим числом прогонов без волка.
 * Варианты сравниваются на одних и тех же последовательностях ответов; при равенстве —
 * больше рассветов на ★★★ и меньше углей, затем выбор смешанного бота.
 */
export function makePlanner(rng: Rng): PlanFn {
  return (s, ev) => {
    const h = s.hero;
    if (h.intent && !h.autoIntent) return;
    const options: Option[] = [];
    if (h.hands.kind !== null) {
      for (const f of s.fires) if (fits(f, h.hands.kind)) options.push({ kind: 'feed', fire: f.side });
    }
    options.push({ kind: 'pile', wood: 'birch' });
    if (s.level.oak) options.push({ kind: 'pile', wood: 'oak' });

    const pref = mixedOption(s);
    const key = s.stats.birchFed + s.stats.oakFed;
    const seeds: number[] = [];
    for (let r = 0; r < balance.planner.rollouts; r++) seeds.push(Math.floor(rng() * 4294967296));

    let best: Option = options[0];
    let bestScore = -Infinity;
    for (const o of options) {
      let wins = 0;
      let embers = 0;
      let masters = 0;
      for (let r = 0; r < seeds.length; r++) {
        const sim = cloneState(s);
        const scratch: GameEvent[] = [];
        const embers0 = sim.stats.embersCount;
        applyOption(sim, o, scratch);
        let forced = true;
        const mixed = makeMixedBot(key);
        const cont: PlanFn = (st, e) => {
          if (forced && st.hero.intent && !st.hero.autoIntent) return;
          forced = false;
          mixed(st, e);
        };
        playNight(sim, cont, mulberry32(seeds[r]), { horizonA: balance.planner.horizonA });
        if (sim.status !== 'lost') wins++;
        if (sim.status === 'won' && sim.stars === 3) masters++;
        embers += sim.stats.embersCount - embers0;
      }
      const score = wins * 1000 + masters * 20 - embers * 10 + (sameOption(pref, o) ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    applyOption(s, best, ev);
  };
}

export function makeBot(name: BotName, rng: Rng): PlanFn {
  switch (name) {
    case 'mixed':
      return makeMixedBot();
    case 'birch':
      return makeBirchBot();
    case 'oak':
      return makeOakBot();
    case 'planner':
      return makePlanner(rng);
  }
}
