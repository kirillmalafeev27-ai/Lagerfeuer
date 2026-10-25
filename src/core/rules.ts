// Редуктор правил (раздел 13.3): reduce(state, action) → новое состояние и события.

import { balance } from '../config/balance.ts';
import { type Cell, type Side, isNearFire } from './clearing.ts';
import type { DenyReason, GameEvent } from './events.ts';
import { burnRate, eyesLevel, integrateFire } from './fires.ts';
import { plannedAction } from './intent.ts';
import { type GameState, cloneState } from './state.ts';
import { EPS, type WoodKind, carryMax, fitCheck, fits, freeSlots } from './wood.ts';

export type Action =
  | { type: 'TICK'; dt: number }
  | { type: 'ANSWER'; correct: boolean; timeMs: number }
  | { type: 'SET_INTENT'; kind: 'feed'; fire: Side }
  | { type: 'SET_INTENT'; kind: 'move'; cell: Cell }
  | { type: 'SET_INTENT'; kind: 'pile'; wood?: WoodKind }
  | { type: 'SET_INTENT'; kind: 'stay' }
  | { type: 'SELECT_WOOD'; kind: WoodKind }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

/** Чистый редуктор: вход не мутируется. */
export function reduce(state: GameState, action: Action): ReduceResult {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  apply(s, action, events);
  return { state: s, events };
}

/** Мутирующая версия редуктора — для симуляции, ботов и номинального прогона. */
export function apply(s: GameState, action: Action, ev: GameEvent[]): void {
  switch (action.type) {
    case 'TICK':
      if (s.paused || s.status !== 'playing') return;
      advance(s, Math.max(0, action.dt) / s.A, ev);
      return;
    case 'ANSWER':
      answer(s, action.correct, action.timeMs, ev);
      return;
    case 'SET_INTENT':
      if (s.status !== 'playing') return;
      setIntent(s, action, ev);
      return;
    case 'SELECT_WOOD':
      if (s.status !== 'playing') return;
      selectWood(s, action.kind, ev);
      return;
    case 'PAUSE':
      s.paused = true;
      return;
    case 'RESUME':
      s.paused = false;
      return;
  }
}

// ── Ответы и действия ──────────────────────────────────────────────

function answer(s: GameState, correct: boolean, timeMs: number, ev: GameEvent[]): void {
  if (s.status !== 'playing' || s.paused) return;
  if (s.hero.ready) return; // кнопки неактивны, пока ждёт готовое действие
  if (correct) s.stats.correct++;
  else s.stats.wrong++;
  s.stats.times.push(timeMs);
  if (!correct) return;
  doAction(s, ev);
}

function doAction(s: GameState, ev: GameEvent[]): void {
  const h = s.hero;
  if (h.intent) {
    const plan = plannedAction(s);
    if (plan.type !== 'none') {
      execute(s, plan, ev);
      return;
    }
    clearIntent(s);
  }
  if (!h.ready) {
    h.ready = true;
    ev.push({ type: 'READY' });
  }
}

function execute(
  s: GameState,
  plan: { type: 'step'; to: Cell } | { type: 'feed'; fire: Side },
  ev: GameEvent[],
): void {
  const h = s.hero;
  if (plan.type === 'step') {
    const from = h.cell;
    h.cell = plan.to;
    s.stats.steps++;
    ev.push({ type: 'STEP', from, to: plan.to });
    if (h.cell === s.pile) pileService(s, ev, h.intent?.kind === 'pile' ? 'explicit' : 'arrive');
    const it = h.intent;
    if (it && it.kind === 'move' && h.cell === it.cell) clearIntent(s);
    else if (it && it.kind === 'pile' && h.cell === s.pile) clearIntent(s);
    return;
  }
  feed(s, plan.fire, ev);
}

function feed(s: GameState, side: Side, ev: GameEvent[]): void {
  const h = s.hero;
  const f = s.fires[side];
  const kind = h.hands.kind;
  if (kind === null) return;
  const check = fitCheck(f, kind);
  if (check !== 'ok') {
    // Ответ не пропадает: действие становится готовым.
    ev.push({ type: 'DENIED', reason: check, fire: side });
    clearIntent(s);
    if (!h.ready) {
      h.ready = true;
      ev.push({ type: 'READY' });
    }
    return;
  }
  let relit = false;
  if (kind === 'birch') {
    if (f.embers !== null) {
      f.embers = null;
      f.fuel = balance.relightFuel;
      f.logs = [{ kind: 'birch', amount: balance.relightFuel }];
      f.countdown = 99;
      relit = true;
      s.stats.relights++;
    } else {
      f.fuel += balance.birchSize;
      f.logs.push({ kind: 'birch', amount: balance.birchSize });
    }
    s.stats.birchFed++;
  } else {
    f.catching = balance.oakCatchA;
    s.stats.oakFed++;
  }
  f.lowLevel = eyesLevel(f);
  h.hands.count--;
  if (h.hands.count <= 0) {
    h.hands.count = 0;
    h.hands.kind = null;
  }
  ev.push({ type: 'FED', fire: side, kind, relit });
  if (relit) ev.push({ type: 'RELIT', fire: side, by: 'birch' });

  if (h.cell === s.pile) pileService(s, ev, 'stand');

  const it = h.intent;
  if (h.hands.kind === null) {
    setAutoPile(s, ev);
  } else if (h.x2 && it && it.kind === 'feed' && it.fire === side && fits(f, h.hands.kind)) {
    h.x2 = false;
    ev.push({ type: 'X2', on: false });
  } else {
    clearIntent(s);
  }
}

// ── Поленница ──────────────────────────────────────────────────────

function availableKind(s: GameState, kind: WoodKind): WoodKind {
  return kind === 'oak' && !s.level.oak ? 'birch' : kind;
}

/**
 * Всё у поленницы бесплатно (2.2.7). Режимы:
 * - 'arrive' — пришёл на клетку: с пустыми руками берёт выбранный вид, с неполными добирает тот же;
 * - 'explicit' — явный выбор вида, стоя у поленницы: дрова в руках меняются на выбранный вид;
 * - 'stand' — стоит у поленницы и руки опустели: берёт выбранный вид.
 */
type PileMode = 'arrive' | 'explicit' | 'stand';

function pileService(s: GameState, ev: GameEvent[], mode: PileMode): void {
  const h = s.hero;
  if (h.cell !== s.pile) return;
  const sel = availableKind(s, s.selectedWood);
  const hk = h.hands.kind;
  if (hk === null) {
    h.hands.kind = sel;
    h.hands.count = carryMax(sel);
    ev.push({ type: 'PICKUP', kind: sel, n: h.hands.count });
    return;
  }
  if (mode === 'stand') return;
  if (hk !== sel && mode === 'explicit') {
    h.hands.kind = sel;
    h.hands.count = carryMax(sel);
    ev.push({ type: 'SWAP', kind: sel });
    if (h.x2) {
      h.x2 = false;
      ev.push({ type: 'X2', on: false });
    }
    const it = h.intent;
    if (it && it.kind === 'feed') {
      const check = fitCheck(s.fires[it.fire], sel);
      if (check !== 'ok') {
        ev.push({ type: 'DENIED', reason: check, fire: it.fire });
        clearIntent(s);
      }
    }
    return;
  }
  if (h.hands.count < carryMax(hk)) {
    const n = carryMax(hk) - h.hands.count;
    h.hands.count = carryMax(hk);
    ev.push({ type: 'PICKUP', kind: hk, n });
  }
}

function selectWood(s: GameState, kind: WoodKind, ev: GameEvent[]): boolean {
  if (kind === 'oak' && !s.level.oak) {
    ev.push({ type: 'DENIED', reason: 'noWood' });
    return false;
  }
  s.selectedWood = kind;
  if (s.hero.cell === s.pile) pileService(s, ev, 'explicit');
  return true;
}

// ── Намерения ──────────────────────────────────────────────────────

function clearIntent(s: GameState): void {
  s.hero.intent = null;
  s.hero.autoIntent = false;
  s.hero.x2 = false;
}

function setAutoPile(s: GameState, ev: GameEvent[]): void {
  s.hero.intent = { kind: 'pile' };
  s.hero.autoIntent = true;
  s.hero.x2 = false;
  ev.push({ type: 'INTENT', auto: true });
}

function consumeReady(s: GameState, ev: GameEvent[]): void {
  const h = s.hero;
  if (!h.ready || !h.intent) return;
  const plan = plannedAction(s);
  if (plan.type === 'none') return;
  h.ready = false;
  execute(s, plan, ev);
}

function setIntent(
  s: GameState,
  a: Extract<Action, { type: 'SET_INTENT' }>,
  ev: GameEvent[],
): void {
  const h = s.hero;
  switch (a.kind) {
    case 'feed': {
      const f = s.fires[a.fire];
      const kind = h.hands.kind ?? availableKind(s, s.selectedWood);
      const check = fitCheck(f, kind);
      if (check !== 'ok') {
        ev.push({ type: 'DENIED', reason: check, fire: a.fire });
        return;
      }
      const it = h.intent;
      if (it && it.kind === 'feed' && it.fire === a.fire) {
        if (
          h.hands.kind === 'birch' &&
          h.hands.count >= 2 &&
          freeSlots(f) + EPS >= 2 * balance.birchSize
        ) {
          h.x2 = !h.x2;
          h.autoIntent = false;
          ev.push({ type: 'X2', on: h.x2 });
        }
      } else {
        h.intent = { kind: 'feed', fire: a.fire };
        h.autoIntent = false;
        h.x2 = false;
        ev.push({ type: 'INTENT', auto: false });
      }
      consumeReady(s, ev);
      return;
    }
    case 'move': {
      if (a.cell === h.cell) {
        clearIntent(s);
        ev.push({ type: 'INTENT', auto: false });
        return;
      }
      h.intent = { kind: 'move', cell: a.cell };
      h.autoIntent = false;
      h.x2 = false;
      ev.push({ type: 'INTENT', auto: false });
      consumeReady(s, ev);
      return;
    }
    case 'pile': {
      if (a.wood !== undefined) {
        if (a.wood === 'oak' && !s.level.oak) {
          ev.push({ type: 'DENIED', reason: 'noWood' });
          return;
        }
        s.selectedWood = a.wood;
      }
      if (h.cell === s.pile) {
        clearIntent(s);
        pileService(s, ev, 'explicit');
        ev.push({ type: 'INTENT', auto: false });
        return;
      }
      h.intent = { kind: 'pile' };
      h.autoIntent = false;
      h.x2 = false;
      ev.push({ type: 'INTENT', auto: false });
      consumeReady(s, ev);
      return;
    }
    case 'stay':
      clearIntent(s);
      ev.push({ type: 'INTENT', auto: false });
      return;
  }
}

// ── Время: горение, ветер, угли, рассвет ───────────────────────────

const OVERSHOOT = 1e-7;

/** Продвинуть ночь на dtA единиц с точной обработкой всех событий внутри шага. */
export function advance(s: GameState, dtA: number, ev: GameEvent[]): void {
  let remaining = dtA;
  for (let guard = 0; guard < 100000 && s.status === 'playing'; guard++) {
    processDue(s, ev);
    if (s.status !== 'playing' || remaining <= 0) break;
    const d = Math.min(remaining, nextEventDelta(s));
    integrate(s, d);
    remaining -= d;
  }
}

function integrate(s: GameState, d: number): void {
  if (d <= 0) return;
  const rates = s.fires.map((f) => burnRate(s, f.side));
  for (let i = 0; i < s.fires.length; i++) integrateFire(s.fires[i], rates[i], d);
  s.t += d;
}

function nextEventDelta(s: GameState): number {
  let best = Infinity;
  const c = (d: number) => {
    if (d > 0 && d < best) best = d;
  };
  const dawnAt = s.nightA * (1 - balance.dawnShare);
  if (!s.dawnStarted) c(dawnAt - s.t);
  c(s.nightA - s.t);
  for (const g of s.gusts) {
    if (g.phase === 0) c(g.warn - s.t);
    else if (g.phase === 1) c(g.start - s.t);
    else if (g.phase === 2) c(g.end - s.t);
  }
  for (const f of s.fires) {
    if (f.embers === null) {
      const rate = burnRate(s, f.side);
      if (rate > 0 && f.fuel > 0) {
        if (f.lowLevel < 1) c((f.fuel - balance.eyesOneBelow) / rate + OVERSHOOT);
        if (f.lowLevel < 2) c((f.fuel - balance.eyesThreeBelow) / rate + OVERSHOOT);
        c(f.fuel / rate);
      }
    } else {
      c(f.embers);
      for (let k = 1; k <= balance.countdownSec; k++) {
        if (f.countdown > k) c(f.embers - k / s.A + OVERSHOOT);
      }
    }
    if (f.catching !== null) c(f.catching);
  }
  return best;
}

function processDue(s: GameState, ev: GameEvent[]): void {
  const dawnAt = s.nightA * (1 - balance.dawnShare);
  if (!s.dawnStarted && s.t >= dawnAt - EPS) {
    s.dawnStarted = true;
    ev.push({ type: 'DAWN_START' });
  }
  if (s.t >= s.nightA - EPS) {
    win(s, ev);
    return;
  }

  for (const g of s.gusts) {
    if (g.phase === 0 && s.t >= g.warn - EPS) {
      g.phase = 1;
      s.stats.gusts++;
      ev.push({ type: 'WIND_WARN', side: g.side });
    }
    if (g.phase === 1 && s.t >= g.start - EPS) {
      g.phase = 2;
      ev.push({ type: 'WIND_START', side: g.side });
    }
    if (g.phase === 2 && s.t >= g.end - EPS) {
      g.phase = 3;
      ev.push({ type: 'WIND_END', side: g.side });
    }
  }

  for (const f of s.fires) {
    if (f.catching !== null && f.catching <= EPS) {
      f.catching = null;
      let relit = false;
      if (f.embers !== null) {
        f.embers = null;
        f.fuel = balance.oakSize;
        f.logs = [{ kind: 'oak', amount: balance.oakSize }];
        f.countdown = 99;
        relit = true;
        s.stats.relights++;
      } else {
        f.fuel += balance.oakSize;
        f.logs.push({ kind: 'oak', amount: balance.oakSize });
      }
      f.lowLevel = eyesLevel(f);
      ev.push({ type: 'OAK_CAUGHT', fire: f.side, relit });
      if (relit) ev.push({ type: 'RELIT', fire: f.side, by: 'oak' });
    }

    if (f.embers === null) {
      if (f.fuel <= EPS) {
        f.fuel = 0;
        f.logs = [];
        f.embers = s.emberA;
        f.lowLevel = 2;
        f.countdown = 99;
        s.stats.embersCount++;
        s.stats.everEmbers = true;
        ev.push({ type: 'EMBERS', fire: f.side });
      } else {
        const lvl = eyesLevel(f);
        if (lvl > f.lowLevel) {
          f.lowLevel = lvl;
          ev.push({ type: 'FIRE_LOW', fire: f.side, level: lvl as 1 | 2 });
        } else if (lvl < f.lowLevel) {
          f.lowLevel = lvl;
        }
      }
    }

    if (f.embers !== null) {
      if (f.embers <= EPS) {
        lose(s, f.side, ev);
        return;
      }
      const sec = f.embers * s.A;
      for (let k = balance.countdownSec; k >= 1; k--) {
        if (sec < k + 1e-6 && f.countdown > k) {
          f.countdown = k;
          ev.push({ type: 'EMBER_COUNTDOWN', fire: f.side, n: k });
        }
      }
    }
  }
}

function win(s: GameState, ev: GameEvent[]): void {
  s.status = 'won';
  let stars: 1 | 2 | 3 = 1;
  if (!s.stats.everEmbers) {
    stars = 2;
    if (s.fires.every((f) => f.embers === null && f.fuel >= balance.eyesOneBelow - EPS)) stars = 3;
  }
  s.stars = stars;
  ev.push({ type: 'DAWN', stars });
}

function lose(s: GameState, side: Side, ev: GameEvent[]): void {
  s.status = 'lost';
  s.stars = 0;
  const wind = s.level.wind;
  const recent = wind ? 2 * wind.dur + s.emberA : 0;
  const gust = s.gusts.some(
    (g) => g.side === side && g.phase >= 2 && g.start <= s.t && g.end >= s.t - recent,
  );
  s.stats.cause = { fire: side, near: isNearFire(s.pile, side), gust };
  ev.push({ type: 'WOLF_IN', fire: side });
}

export type { DenyReason };
