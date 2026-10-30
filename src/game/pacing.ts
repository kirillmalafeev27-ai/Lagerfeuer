// Темп ночи по виду вопросов (раздел 3): банк — общий учёт серии, задания генератора — свой
// учёт на каждый уровень A1–C1, свои наборы слов — свой, со своими значениями по умолчанию и
// разбросом. Этим пользуются и игра (App), и симуляция (tools/sim.ts) — чтобы считали одинаково.

import { balance } from '../config/balance.ts';
import { type PaceConfig, SERIES_PACE_KEY } from '../shared/pace.ts';

export type QuestionKind = 'bank' | 'generated';

/** Настройки учёта темпа для вида вопросов; vocab — выбраны только свои наборы слов. */
export function paceConfigFor(kind: QuestionKind, cefr = 'B1', vocab = false): PaceConfig {
  if (kind === 'bank') return balance.pace;
  const g = balance.paceGenerated;
  return {
    ...balance.pace,
    defaultTMed: vocab ? g.defaultTMedVocab : (g.defaultTMedByLevel[cefr] ?? g.defaultTMed),
    minTMed: g.minTMed,
    maxTMed: g.maxTMed,
    defaultP: g.defaultP,
    defaultSigma: g.defaultSigma,
    allowance: g.allowance,
  };
}

/**
 * Ключ хранения: банк — общий ключ серии, генератор — свой на каждый уровень A1–C1, свои наборы
 * слов — свой: их задания вдвое короче предложений генератора и от уровня не зависят. С общим
 * учётом первая ночь после смены была бы то пустой, то непосильной (игра думает 7 с, а ученик
 * читает предложение 12 с).
 */
export function paceKeyFor(kind: QuestionKind, cefr = 'B1', vocab = false): string {
  if (kind === 'bank') return SERIES_PACE_KEY;
  return `${SERIES_PACE_KEY}:gen:${vocab ? 'vocab' : cefr}`;
}
