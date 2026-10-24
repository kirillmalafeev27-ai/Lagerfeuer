// Модель ответов и прогон ночи без графики (разделы 5.5 и 14).

import { balance } from '../config/balance.ts';
import type { GameEvent } from './events.ts';
import { type Rng, logNormal } from './rng.ts';
import { advance, apply } from './rules.ts';
import type { GameState } from './state.ts';

type PlanFn = (s: GameState, ev: GameEvent[]) => void;

/** Время ответа, секунд: логнормальное с медианой T_med и σ = answerSigma. */
export function sampleAnswerSec(rng: Rng, tMed: number): number {
  return logNormal(rng, tMed, balance.answerSigma);
}

export interface PlayOptions {
  /** Остановиться через столько единиц (для прогонов планировщика). */
  horizonA?: number;
  onEvents?: (events: GameEvent[]) => void;
}

/**
 * Проиграть ночь (или её часть) со случайными ответами: доля верных p, время логнормальное,
 * показ ошибки и смена вопроса — фиксированные секунды. Мутирует состояние.
 */
export function playNight(s: GameState, plan: PlanFn, rng: Rng, opts: PlayOptions = {}): void {
  const A = s.A;
  const tEnd = opts.horizonA !== undefined ? s.t + opts.horizonA : Infinity;
  const swapA = balance.questionSwapMs / 1000 / A;
  const wrongA = balance.wrongFeedbackMs / 1000 / A;
  const ev: GameEvent[] = [];
  const flush = () => {
    if (opts.onEvents && ev.length) opts.onEvents(ev.splice(0));
    else ev.length = 0;
  };
  let answerSec = sampleAnswerSec(rng, s.tMed);
  let nextAt = s.t + answerSec / A;
  for (let guard = 0; guard < 100000 && s.status === 'playing' && s.t < tEnd; guard++) {
    if (s.hero.ready) {
      plan(s, ev);
      if (s.hero.ready) {
        advance(s, Math.min(balance.botIdleStepA, tEnd - s.t), ev);
        flush();
        continue;
      }
      answerSec = sampleAnswerSec(rng, s.tMed);
      nextAt = s.t + swapA + answerSec / A;
      flush();
      continue;
    }
    advance(s, Math.min(nextAt, tEnd) - s.t, ev);
    if (s.status !== 'playing' || s.t >= tEnd - 1e-12) {
      flush();
      break;
    }
    const correct = rng() < s.p;
    plan(s, ev);
    apply(s, { type: 'ANSWER', correct, timeMs: answerSec * 1000 }, ev);
    answerSec = sampleAnswerSec(rng, s.tMed);
    nextAt = s.t + (correct ? swapA : wrongA + swapA) + answerSec / A;
    flush();
  }
}

/**
 * Номинальный прогон (5.5): каждое действие занимает ровно τ = tauFactor × A / p,
 * все ответы верные. Возвращает true, если бот дожил до рассвета.
 */
export function playNominal(s: GameState, plan: PlanFn): boolean {
  const tau = balance.tauFactor / s.p;
  const ev: GameEvent[] = [];
  let nextAt = s.t + tau;
  for (let guard = 0; guard < 100000 && s.status === 'playing'; guard++) {
    if (s.t > balance.nominalSafetyCapA) break;
    if (s.hero.ready) {
      plan(s, ev);
      if (s.hero.ready) {
        advance(s, balance.botIdleStepA, ev);
        ev.length = 0;
        continue;
      }
      nextAt = s.t + tau;
      ev.length = 0;
      continue;
    }
    advance(s, nextAt - s.t, ev);
    if (s.status !== 'playing') break;
    plan(s, ev);
    apply(s, { type: 'ANSWER', correct: true, timeMs: 0 }, ev);
    nextAt = s.t + tau;
    ev.length = 0;
  }
  return s.status === 'won';
}

/**
 * Время до n-го верного ответа, секунд, по модели ответа (14.2): ответ логнормальный,
 * ошибка показывается wrongFeedbackMs, смена вопроса — questionSwapMs.
 * Используется для калибровки порогов подсказок (2.8).
 */
export function timeForCorrect(rng: Rng, n: number, tMed: number, p: number, limitSec = Infinity): number {
  const swap = balance.questionSwapMs / 1000;
  const wrong = balance.wrongFeedbackMs / 1000;
  let t = 0;
  let got = 0;
  while (got < n && t <= limitSec) {
    t += sampleAnswerSec(rng, tMed);
    if (rng() < p) {
      got++;
      if (got < n) t += swap;
    } else {
      t += wrong + swap;
    }
  }
  return t;
}

/** Доля опозданий: n действий при r = need / доступное, need = n × A / p. */
export function lateShare(rng: Rng, n: number, r: number, tMed: number, p: number, runs: number): number {
  const A = tMed + balance.unitOverheadSec;
  const avail = (n * A) / (p * r);
  let late = 0;
  for (let i = 0; i < runs; i++) if (timeForCorrect(rng, n, tMed, p, avail) > avail) late++;
  return late / runs;
}
