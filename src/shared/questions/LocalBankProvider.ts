// Локальный банк вопросов для разработки (раздел 12): перемешивание вариантов,
// без повторов раньше чем через 10 показов, ошибочные возвращаются через 4–6 вопросов.

import { type Rng, mulberry32, randInt, shuffle } from '../rng.ts';
import type { AnswerReport, Question, QuestionProvider } from './types.ts';

export interface LocalBankOptions {
  seed?: number;
  /** Не повторять вопрос раньше чем через столько показов. */
  noRepeatWithin?: number;
  /** Ошибочный вопрос возвращается через столько вопросов (диапазон). */
  retryAfter?: readonly [number, number];
}

export class LocalBankProvider implements QuestionProvider {
  private readonly bank: Question[];
  private readonly rng: Rng;
  private readonly noRepeat: number;
  private readonly retry: readonly [number, number];
  private readonly recent: string[] = [];
  private readonly retryQueue: Array<{ id: string; due: number }> = [];
  private shown = 0;

  constructor(bank: readonly Question[], opts: LocalBankOptions = {}) {
    if (bank.length === 0) throw new Error('empty question bank');
    this.bank = bank.map((q) => ({ ...q, options: q.options.slice() }));
    this.rng = mulberry32(opts.seed ?? Date.now() & 0x7fffffff);
    this.noRepeat = Math.min(opts.noRepeatWithin ?? 10, Math.max(0, bank.length - 1));
    this.retry = opts.retryAfter ?? [4, 6];
  }

  next(): Promise<Question> {
    return Promise.resolve(this.pick());
  }

  report(r: AnswerReport): void {
    if (r.correct) return;
    const gap = this.retry[0] + randInt(this.rng, this.retry[1] - this.retry[0] + 1);
    if (!this.retryQueue.some((x) => x.id === r.id))
      this.retryQueue.push({ id: r.id, due: this.shown + gap });
  }

  private pick(): Question {
    let q: Question | undefined;
    const dueIdx = this.retryQueue.findIndex((x) => x.due <= this.shown);
    if (dueIdx >= 0) {
      const id = this.retryQueue.splice(dueIdx, 1)[0].id;
      q = this.bank.find((b) => b.id === id);
    }
    if (!q) {
      const blocked = new Set(this.recent.slice(-this.noRepeat));
      for (const x of this.retryQueue) blocked.add(x.id);
      const pool = this.bank.filter((b) => !blocked.has(b.id));
      const from = pool.length > 0 ? pool : this.bank;
      q = from[randInt(this.rng, from.length)];
    }
    this.shown++;
    this.recent.push(q.id);
    if (this.recent.length > 50) this.recent.shift();
    return shuffleOptions(q, this.rng);
  }
}

/** Перемешать варианты и пересчитать correctIndex. */
export function shuffleOptions(q: Question, rng: Rng): Question {
  const order = shuffle(
    rng,
    q.options.map((_, i) => i),
  );
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}
