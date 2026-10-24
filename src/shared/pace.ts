// Учёт темпа игрока (раздел 3), общий для серии: медиана времени ответа по последним
// 20 ответам и доля верных по последним 30. Хранится под ключом серии.

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
}

export interface PaceSnapshot {
  /** Медиана времени ответа, секунд. */
  tMed: number;
  /** Доля верных ответов. */
  p: number;
}

interface PaceData {
  times: number[];
  results: number[];
}

export const SERIES_PACE_KEY = 'series:pace';

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
        this.data.times = Array.isArray(d.times) ? d.times.filter((x) => typeof x === 'number') : [];
        this.data.results = Array.isArray(d.results) ? d.results.filter((x) => x === 0 || x === 1) : [];
      }
    } catch {
      /* битые данные — начинаем заново */
    }
  }

  /** Записать ответ: время от появления вопроса до клика и верность. */
  record(timeMs: number, correct: boolean): void {
    this.data.times.push(Math.max(0, timeMs) / 1000);
    this.data.results.push(correct ? 1 : 0);
    if (this.data.times.length > this.cfg.timeWindow) this.data.times.splice(0, this.data.times.length - this.cfg.timeWindow);
    if (this.data.results.length > this.cfg.accWindow) this.data.results.splice(0, this.data.results.length - this.cfg.accWindow);
    this.storage.set(this.key, JSON.stringify(this.data));
  }

  /** Снимок темпа — фиксируется на старте раунда. */
  snapshot(): PaceSnapshot {
    const c = this.cfg;
    const times = this.data.times.slice(-c.timeWindow);
    const results = this.data.results.slice(-c.accWindow);
    const tMed = times.length >= c.minTimeSamples ? median(times) : c.defaultTMed;
    const p = results.length >= c.minAccSamples ? results.reduce((a, b) => a + b, 0) / results.length : c.defaultP;
    return {
      tMed: Math.min(c.maxTMed, Math.max(c.minTMed, tMed)),
      p: Math.min(c.maxP, Math.max(c.minP, p)),
    };
  }
}
