// Темп ночи по виду вопросов (раздел 3): банк — общий учёт серии, задания генератора — свой
// учёт на каждый уровень A1–C1, со своими значениями по умолчанию и разбросом. Этим пользуются
// и игра (App), и симуляция (tools/sim.ts) — чтобы считали одинаково.

import { balance } from '../config/balance.ts';
import { type PaceConfig, SERIES_PACE_KEY } from '../shared/pace.ts';

export type QuestionKind = 'bank' | 'generated';

/** Настройки учёта темпа для вида вопросов. */
export function paceConfigFor(kind: QuestionKind, cefr = 'B1'): PaceConfig {
  if (kind === 'bank') return balance.pace;
  const { defaultTMedByLevel, ...gen } = balance.paceGenerated;
  return { ...balance.pace, ...gen, defaultTMed: defaultTMedByLevel[cefr] ?? gen.defaultTMed };
}

/** Ключ хранения: банк — общий ключ серии, генератор — свой на каждый уровень A1–C1. */
export function paceKeyFor(kind: QuestionKind, cefr = 'B1'): string {
  return kind === 'bank' ? SERIES_PACE_KEY : `${SERIES_PACE_KEY}:gen:${cefr}`;
}
