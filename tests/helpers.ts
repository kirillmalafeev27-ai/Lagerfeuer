import type { LevelId } from '../src/config/levels.ts';
import { type Cell, oppositeCorner } from '../src/core/clearing.ts';
import type { GameEvent } from '../src/core/events.ts';
import { eyesLevel } from '../src/core/fires.ts';
import { buildLevel } from '../src/core/levelGen.ts';
import { type Action, reduce } from '../src/core/rules.ts';
import type { GameState, Gust } from '../src/core/state.ts';

export interface MakeOpts {
  level?: LevelId;
  pile?: Cell;
  fuels?: [number, number, number, number];
  mults?: [number, number, number, number];
  tMed?: number;
  p?: number;
  gusts?: Gust[];
}

/** Детерминированное состояние с заданными топливом, множителями и поленницей. */
export function makeState(o: MakeOpts = {}): GameState {
  const s = buildLevel(o.level ?? 2, 12345, { tMed: o.tMed ?? 5, p: o.p ?? 0.8 });
  if (o.pile !== undefined) {
    s.pile = o.pile;
    s.tent = oppositeCorner(o.pile);
    s.hero.cell = o.pile;
  }
  if (o.fuels) {
    s.fires.forEach((f, i) => {
      const fuel = o.fuels![i];
      f.fuel = fuel;
      f.logs = fuel > 0 ? [{ kind: 'birch', amount: fuel }] : [];
      f.lowLevel = eyesLevel(f);
    });
  }
  if (o.mults) s.fires.forEach((f, i) => (f.mult = o.mults![i]));
  else s.fires.forEach((f) => (f.mult = 1));
  s.gusts = o.gusts ?? [];
  return s;
}

/** Применить действия по очереди, собрать все события. */
export function run(s: GameState, actions: Action[]): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** TICK на a единиц A. */
export function tickA(s: GameState, a: number): Action {
  return { type: 'TICK', dt: a * s.A };
}

export const correct: Action = { type: 'ANSWER', correct: true, timeMs: 4000 };
export const wrong: Action = { type: 'ANSWER', correct: false, timeMs: 4000 };

export function types(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}
