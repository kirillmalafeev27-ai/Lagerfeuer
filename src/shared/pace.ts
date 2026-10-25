// Учёт темпа игрока (раздел 3), общий для серии: медиана времени ответа по последним
// 20 ответам и доля верных по последним 30. Хранится под ключом серии; у заданий генератора —
// свой ключ на каждый уровень (`series:pace:gen:B1`): предложения читаются в разы дольше слов,
// и общий учёт делал бы игру то непосильной, то пустой.
//
// Поправка на разброс. Пороги подсказок и баланс ночей откалиброваны для логнормального
// времени ответа с σ = 0.5. Если ответы игрока разбросаны сильнее (задания разной длины),
// хвост долгих ответов толще, и костры гасли бы чаще задуманного. Поэтому правила получают
// T_эфф = T_med · e^(k·(σ − σ₀)) · запас: σ оценивается по тем же ответам (устойчиво к
// выбросам) и подтягивается к априорной оценке, пока ответов мало.

import type { KeyValueStorage } from './storage.ts';

export interface PaceConfig {
  defaultTMed: number;
  minTMed: number;
  maxTMed: number;
  defaultP: number;
  minP: number;
  maxP: number;
  timeWindow: number;
  accWindow: number;
  minTimeSamples: number;
  minAccSamples: number;
  /** σ логнормали времени ответа, под которую откалиброваны подсказки и уровни. */
  refSigma: number;
  /** Разброс, пока ответов мало, — априорная оценка для этого вида вопросов. */
  defaultSigma: number;
  /** Вес априорной оценки разброса: столько «воображаемых» ответов. */
  sigmaPriorWeight: number;
  minSigma: number;
  maxSigma: number;
  /** k в поправке на разброс T_эфф = T_med · e^(k·(σ − refSigma)). */
  spreadGain: number;
  /**
   * Запас на трудность вопросов этого вида: 1 — уровни как откалиброваны (банк). Задания
   * генератора нарочно трудные (их не угадать), и верных ответов у того же ученика меньше.
   */
  allowance: number;
}

export interface PaceSnapshot {
  /** Темп для правил, секунд: медиана с поправкой на разброс и запасом (T_эфф). */
  tMed: number;
  /** Доля верных ответов. */
  p: number;
  /** Медиана ответов как есть, в пределах диапазона, секунд. */
  median: number;
  /** Оценка разброса σ. */
  sigma: number;
}

interface PaceData {
  times: number[];
  results: number[];
}

export const SERIES_PACE_KEY = 'series:pace';
/** Отклонения логарифма времени от медианы обрезаются: одна долгая задумчивость не раздувает σ. */
const LOG_CLIP = 1.5;

export function median(xs: readonly number[]): number {
  const a = xs.slice().sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return NaN;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export class PaceTracker {
  private data: PaceData;
  private readonly storage: KeyValueStorage;
  private readonly cfg: PaceConfig;
  private readonly key: string;

  constructor(storage: KeyValueStorage, cfg: PaceConfig, key = SERIES_PACE_KEY) {
    this.storage = storage;
    this.cfg = cfg;
    this.key = key;
    this.data = { times: [], results: [] };
    try {
      const raw = storage.get(key);
      if (raw) {
        const d = JSON.parse(raw) as Partial<PaceData>;
        this.data.times = Array.isArray(d.times)
          ? d.times.filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)
          : [];
        this.data.results = Array.isArray(d.results)
          ? d.results.filter((x) => x === 0 || x === 1)
          : [];
      }
    } catch {
      /* битые данные — начинаем заново */
    }
  }

  /** Записать ответ: время от появления вопроса до клика и верность. */
  record(timeMs: number, correct: boolean): void {
    this.data.times.push(Math.max(1, timeMs) / 1000);
    this.data.results.push(correct ? 1 : 0);
    if (this.data.times.length > this.cfg.timeWindow)
      this.data.times.splice(0, this.data.times.length - this.cfg.timeWindow);
    if (this.data.results.length > this.cfg.accWindow)
      this.data.results.splice(0, this.data.results.length - this.cfg.accWindow);
    this.storage.set(this.key, JSON.stringify(this.data));
  }

  /** Снимок темпа — фиксируется на старте раунда. */
  snapshot(): PaceSnapshot {
    const c = this.cfg;
    const times = this.data.times.slice(-c.timeWindow);
    const results = this.data.results.slice(-c.accWindow);
    let med = c.defaultTMed;
    let sigma = c.defaultSigma;
    // Пока ответов мало, медиана шумит: до minTimeSamples ответов действуют значения по умолчанию.
    if (times.length >= c.minTimeSamples) {
      med = median(times);
      sigma = shrunkSigma(times, med, c);
    }
    const p =
      results.length >= c.minAccSamples
        ? results.reduce((a, b) => a + b, 0) / results.length
        : c.defaultP;
    const m = Math.min(c.maxTMed, Math.max(c.minTMed, med));
    const s = Math.min(c.maxSigma, Math.max(c.minSigma, sigma));
    return {
      tMed: m * spreadFactor(s, c) * c.allowance,
      p: Math.min(c.maxP, Math.max(c.minP, p)),
      median: m,
      sigma: s,
    };
  }
}

/** Множитель T_эфф / T_med при разбросе σ. */
export function spreadFactor(
  sigma: number,
  c: Pick<PaceConfig, 'refSigma' | 'spreadGain'>,
): number {
  return Math.exp(c.spreadGain * (sigma - c.refSigma));
}

/**
 * σ по ответам: среднеквадратичное отклонение логарифма времени от логарифма медианы (с
 * обрезанными выбросами), подтянутое к априорной оценке весом sigmaPriorWeight ответов.
 */
export function shrunkSigma(
  times: readonly number[],
  med: number,
  c: Pick<PaceConfig, 'defaultSigma' | 'sigmaPriorWeight'>,
): number {
  const n = times.length;
  if (n < 2) return c.defaultSigma;
  const lm = Math.log(med);
  let sum = 0;
  for (const t of times) {
    const d = Math.max(-LOG_CLIP, Math.min(LOG_CLIP, Math.log(t) - lm));
    sum += d * d;
  }
  const sample = sum / (n - 1);
  const w = c.sigmaPriorWeight;
  return Math.sqrt((n * sample + w * c.defaultSigma ** 2) / (n + w));
}
