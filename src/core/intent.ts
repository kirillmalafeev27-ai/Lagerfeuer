// Намерение (раздел 2.5): что сделает следующий верный ответ и каким путём пойдёт герой.

import {
  type Cell,
  type Side,
  isFireAdjacent,
  nearestFireCell,
  pathBetween,
  stepDist,
  stepToward,
  stepsToFire,
} from './clearing.ts';
import type { GameState, Intent } from './state.ts';
import { carryMax } from './wood.ts';

export type Planned =
  | { type: 'step'; to: Cell }
  | { type: 'feed'; fire: Side }
  | { type: 'none' };

function handsFull(s: GameState): boolean {
  const h = s.hero.hands;
  return h.kind !== null && h.count >= carryMax(h.kind);
}

/** Действие, которое выполнит следующий верный ответ при текущем намерении. */
export function plannedAction(s: GameState): Planned {
  const h = s.hero;
  const it = h.intent;
  if (!it) return { type: 'none' };
  switch (it.kind) {
    case 'feed': {
      if (h.hands.kind === null) {
        if (h.cell === s.pile) return { type: 'none' };
        return { type: 'step', to: stepToward(h.cell, s.pile) };
      }
      if (isFireAdjacent(h.cell, it.fire)) return { type: 'feed', fire: it.fire };
      return { type: 'step', to: stepToward(h.cell, nearestFireCell(h.cell, it.fire)) };
    }
    case 'pile':
      if (h.cell === s.pile) return { type: 'none' };
      return { type: 'step', to: stepToward(h.cell, s.pile) };
    case 'move':
      if (h.cell === it.cell) return { type: 'none' };
      return { type: 'step', to: stepToward(h.cell, it.cell, handsFull(s) ? undefined : s.pile) };
  }
}

/**
 * Маршрут героя к цели намерения — клетки после стартовой, с заходом к поленнице,
 * если он нужен (13.3.6). Для подбрасывания последняя клетка — та, откуда бросают.
 */
export function route(s: GameState, intent: Intent | null = s.hero.intent): Cell[] {
  const h = s.hero;
  if (!intent) return [];
  switch (intent.kind) {
    case 'feed': {
      if (h.hands.kind === null) {
        const toPile = pathBetween(h.cell, s.pile);
        return toPile.concat(pathBetween(s.pile, nearestFireCell(s.pile, intent.fire)));
      }
      return pathBetween(h.cell, nearestFireCell(h.cell, intent.fire));
    }
    case 'pile':
      return pathBetween(h.cell, s.pile);
    case 'move':
      return pathBetween(h.cell, intent.cell, handsFull(s) ? undefined : s.pile);
  }
}

/** Шагов до костра с поленом в руках (без подкладывания). */
export function stepsWithHands(s: GameState, fire: Side): number {
  return stepsToFire(s.hero.cell, fire);
}

/** Шагов до костра через поленницу. */
export function stepsViaPile(s: GameState, fire: Side): number {
  return stepDist(s.hero.cell, s.pile) + stepsToFire(s.pile, fire);
}
