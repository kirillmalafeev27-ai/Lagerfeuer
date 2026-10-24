// Номинальный прогон (раздел 5.5): смешанный бот, каждое действие — ровно τ.

import { makeMixedBot } from './bots.ts';
import { playNominal } from './simulate.ts';
import { type GameState, cloneState } from './state.ts';

/** Дожил ли смешанный бот до рассвета при детерминированном темпе τ = tauFactor × A / p. */
export function nominalSurvives(s: GameState): boolean {
  return playNominal(cloneState(s), makeMixedBot());
}
