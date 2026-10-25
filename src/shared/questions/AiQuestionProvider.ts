import { type QuizConfig, isVocabTopic } from './topics.ts';
import type { Question, QuestionProvider } from './types.ts';

/**
 * Вопросы от ИИ-генератора (движок вопросов Morskoy, public/js/questions.js → QuestionManager):
 * задания приходят блоками по теме с сервера игры (/api/generate-questions), лежат в очереди
 * своего потока и чередуются между темами. Поток пополняется заранее, когда в нём остаётся
 * мало заданий. Неверно решённое задание возвращается через 4–6 вопросов (12.3), варианты
 * перемешиваются при каждом показе (12.2).
 *
 * Пока генерации нет (ключ не задан, сервер недоступен, модель ответила браком), вопросы
 * берутся из запасного источника — встроенного банка, так что игра не встаёт.
 */

export interface AiStatus {
  /** Сервер игры ответил на /api/quiz/status. */
  available: boolean;
  generationConfigured: boolean;
  ttsConfigured: boolean;
}

export interface AiProviderOptions {
  fallback: QuestionProvider;
  /** Сколько заданий просить за раз (в Morskoy — 10). */
  batchSize: number;
  /** Запросить следующий блок, когда в потоке осталось столько заданий. */
  refillAt: number;
  /** Первый вопрос после выбора тем: сколько ждать генерации, прежде чем взять из банка. */
  firstWaitMs: number;
  /** Дальше: очередь пуста — столько ждать нового блока. Следующий вопрос грузится заранее. */
  nextWaitMs: number;
  requestTimeoutMs: number;
  retryWrongMin: number;
  retryWrongMax: number;
  /** Префикс адресов API; по умолчанию — относительно страницы (игра и API на одном сервере). */
  baseUrl?: string;
  fetch?: typeof fetch;
  random?: () => number;
}

/** Источник, которому игрок сам выбирает темы. */
export interface ConfigurableQuestionProvider extends QuestionProvider {
  config(): QuizConfig | null;
  configure(config: QuizConfig | null): void;
  status(): Promise<AiStatus>;
}

export function isConfigurable(p: QuestionProvider): p is ConfigurableQuestionProvider {
  const c = p as Partial<ConfigurableQuestionProvider>;
  return (
    typeof c.configure === 'function' &&
    typeof c.config === 'function' &&
    typeof c.status === 'function'
  );
}

interface Stream {
  key: string;
  kind: 'grammar' | 'audio';
  grammarTopic: string | null;
  isWortstellung: boolean;
  pool: Question[];
  inflight: boolean;
  failures: number;
  retryAt: number;
  /** Уже показанные задания потока — уходят в exclude, чтобы модель их не повторяла. */
  used: string[];
  /** Своего набора слов: сервер отдаёт его и без ключа генерации. */
  vocab: boolean;
  /** Сервер ответил, что генерации нет: поток больше не запрашивается. */
  dead: boolean;
}

/** Ответ сервера, который означает «генерации здесь нет» — повторять бессмысленно. */
const UNAVAILABLE = new Set([404, 405, 501, 503]);
const EXCLUDE_LAST = 12;

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class AiQuestionProvider implements ConfigurableQuestionProvider {
  private cfg: QuizConfig | null = null;
  private streams: Stream[] = [];
  private cursor = 0;
  private epoch = 0;
  private shown = 0;
  private seq = 0;
  private retries: { q: Question; at: number }[] = [];
  private readonly known = new Map<string, Question>();
  private readonly fromBank = new Set<string>();
  private waiters: (() => void)[] = [];
  private servedAi = false;
  private disabled = false;
  private statusPromise: Promise<AiStatus> | null = null;
  private readonly opts: AiProviderOptions;
  private readonly rand: () => number;
  private readonly fetchImpl: typeof fetch;
  /** Последняя ошибка генерации — для экрана тем и отладки. */
  lastError: string | null = null;

  constructor(opts: AiProviderOptions) {
    this.opts = opts;
    this.rand = opts.random ?? Math.random;
    this.fetchImpl = opts.fetch ?? ((input, init) => window.fetch(input, init));
  }

  config(): QuizConfig | null {
    return this.cfg;
  }

  /** Новые темы: старые очереди и повторы сбрасываются, генерация начинается сразу. */
  configure(config: QuizConfig | null): void {
    this.epoch++;
    this.cfg = config;
    this.disabled = false;
    this.servedAi = false;
    this.lastError = null;
    this.retries = [];
    this.cursor = 0;
    this.streams = config ? buildStreams(config) : [];
    this.notify();
    for (const s of this.streams) this.fill(s);
  }

  /** Состояние сервера генерации (один запрос за сессию). */
  status(): Promise<AiStatus> {
    this.statusPromise ??= this.request('api/quiz/status')
      .then((raw) => {
        const r = (raw ?? {}) as Partial<AiStatus>;
        return {
          available: true,
          generationConfigured: r.generationConfigured === true,
          ttsConfigured: r.ttsConfigured === true,
        };
      })
      .catch(() => ({ available: false, generationConfigured: false, ttsConfigured: false }));
    return this.statusPromise;
  }

  /** Идёт ли сейчас генерация (для подписи «Готовлю вопросы…»). */
  pending(): boolean {
    return this.streams.some((s) => s.inflight);
  }

  /** Для отладки и тестов: размеры очередей. */
  debugInfo() {
    return {
      disabled: this.disabled,
      lastError: this.lastError,
      streams: this.streams.map((s) => ({ key: s.key, size: s.pool.length, inflight: s.inflight })),
    };
  }

  async next(): Promise<Question> {
    this.shown++;
    const due = this.retries.findIndex((r) => r.at <= this.shown);
    if (due >= 0) {
      const [r] = this.retries.splice(due, 1);
      return this.shuffled(r.q);
    }
    if (!this.cfg || this.disabled || !this.streams.length) return this.bank();
    const ready = this.take();
    if (ready) return ready;
    for (const s of this.streams) this.fill(s);
    const waited = await this.waitForQuestion(
      this.servedAi ? this.opts.nextWaitMs : this.opts.firstWaitMs,
    );
    return waited ?? this.bank();
  }

  report(r: { id: string; correct: boolean; timeMs: number }): void {
    if (this.fromBank.has(r.id)) {
      this.opts.fallback.report(r);
      return;
    }
    const q = this.known.get(r.id);
    if (!q || r.correct) return;
    const gap =
      this.opts.retryWrongMin +
      Math.floor(this.rand() * (this.opts.retryWrongMax - this.opts.retryWrongMin + 1));
    this.retries.push({ q, at: this.shown + gap });
  }

  // ───────────────────────────── внутреннее ─────────────────────────────

  private async bank(): Promise<Question> {
    const q = await this.opts.fallback.next();
    this.fromBank.add(q.id);
    return q;
  }

  /** Следующее задание по кругу тем; пустые потоки пропускаются. */
  private take(): Question | null {
    const n = this.streams.length;
    for (let i = 0; i < n; i++) {
      const s = this.streams[(this.cursor + i) % n];
      const q = s.dead ? undefined : s.pool.shift();
      if (!q) continue;
      this.cursor = (this.cursor + i + 1) % n;
      this.servedAi = true;
      // Сначала — в список показанных: если сейчас уйдёт запрос нового блока, это задание
      // тоже должно попасть в exclude.
      s.used.push(q.audioText ?? q.prompt);
      if (s.used.length > EXCLUDE_LAST * 2) s.used.splice(0, s.used.length - EXCLUDE_LAST);
      if (s.pool.length <= this.opts.refillAt) this.fill(s);
      return this.shuffled(q);
    }
    return null;
  }

  private async waitForQuestion(ms: number): Promise<Question | null> {
    const epoch = this.epoch;
    const deadline = performance.now() + ms;
    for (;;) {
      if (epoch !== this.epoch || this.disabled) return null;
      const q = this.take();
      if (q) return q;
      if (!this.pending()) return null;
      const left = deadline - performance.now();
      if (left <= 0) return null;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, left);
        this.waiters.push(done);
      });
    }
  }

  private notify(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  /** Запросить следующий блок для потока, если он ещё не запрошен и не на паузе после ошибки. */
  private fill(s: Stream): void {
    const cfg = this.cfg;
    if (!cfg || this.disabled || s.dead || s.inflight || performance.now() < s.retryAt) return;
    if (s.pool.length > this.opts.refillAt) return;
    const epoch = this.epoch;
    s.inflight = true;
    // Показанные задания и те, что ещё ждут в очереди: новый блок не должен их повторять.
    const exclude = [...s.used.slice(-EXCLUDE_LAST), ...s.pool.map((q) => q.audioText ?? q.prompt)];
    const body =
      s.kind === 'audio'
        ? { level: cfg.level, lexicalTopic: cfg.lexicalTopic, count: this.opts.batchSize, exclude }
        : {
            level: cfg.level,
            lexicalTopic: cfg.lexicalTopic,
            grammarTopic: s.grammarTopic,
            isWortstellung: s.isWortstellung,
            count: this.opts.batchSize,
            exclude,
          };
    const path = s.kind === 'audio' ? 'api/generate-audio-questions' : 'api/generate-questions';
    this.request(path, body)
      .then((raw) => {
        if (epoch !== this.epoch) return;
        const list = (raw as { questions?: unknown } | null)?.questions;
        const got = (Array.isArray(list) ? list : [])
          .map((item) => this.fromApi(item, s))
          .filter((q): q is Question => q !== null);
        if (!got.length) throw new ApiError(502, 'пустой блок заданий');
        s.pool.push(...shuffle(got, this.rand));
        s.failures = 0;
      })
      .catch((error: unknown) => {
        if (epoch !== this.epoch) return;
        this.lastError = error instanceof Error ? error.message : String(error);
        if (error instanceof ApiError && UNAVAILABLE.has(error.status)) {
          // 503 — на сервере нет ключа генерации: свои наборы слов он отдаёт и без него, так что
          // замолкают только потоки генератора. API нет вовсе (статическая раздача) — все.
          for (const x of this.streams) if (error.status !== 503 || !x.vocab) x.dead = true;
          if (this.streams.every((x) => x.dead)) this.disabled = true;
          return;
        }
        s.failures++;
        s.retryAt = performance.now() + Math.min(120_000, 5000 * 3 ** (s.failures - 1));
      })
      .finally(() => {
        if (epoch !== this.epoch) return;
        s.inflight = false;
        this.notify();
      });
  }

  /** Задание из ответа API → вопрос серии. Ответу сервера не доверяем: форма проверяется. */
  private fromApi(raw: unknown, s: Stream): Question | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const options = Array.isArray(r.options)
      ? r.options
          .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
          .map((o) => o.trim())
      : [];
    const correct = typeof r.correct === 'number' ? r.correct : -1;
    if (
      options.length < 2 ||
      options.length > 4 ||
      !Number.isInteger(correct) ||
      correct >= options.length
    )
      return null;
    if (correct < 0 || new Set(options).size !== options.length) return null;
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    const display = typeof r.display === 'string' ? r.display.trim() : '';
    const id = `ai-${this.epoch}-${++this.seq}`;
    let q: Question;
    if (s.kind === 'audio') {
      const audioText = typeof r.audioText === 'string' ? r.audioText.trim() : '';
      if (!audioText) return null;
      q = {
        id,
        prompt: display || text,
        promptLang: 'ru',
        instruction: text || undefined,
        options,
        optionsLang: 'ru',
        correctIndex: correct,
        format: 'audio',
        audioText,
      };
    } else {
      if (!display) return null;
      q = {
        id,
        prompt: display,
        // Материал по-немецки; у заданий на перевод из своих наборов слов — русская фраза.
        promptLang: r.displayLang === 'ru' ? 'ru' : 'de',
        instruction: text || undefined,
        options,
        optionsLang: 'de',
        correctIndex: correct,
        format: typeof r.format === 'string' ? r.format : undefined,
        topic: s.grammarTopic ?? undefined,
      };
    }
    this.known.set(id, q);
    return q;
  }

  private shuffled(q: Question): Question {
    const order = shuffle(
      q.options.map((_, i) => i),
      this.rand,
    );
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  }

  private async request(path: string, body?: unknown): Promise<unknown> {
    const url =
      this.opts.baseUrl !== undefined
        ? this.opts.baseUrl + path
        : new URL(path, document.baseURI).href;
    const res = await this.fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.opts.requestTimeoutMs),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const data = (await res.json()) as { error?: string };
        detail = data.error ?? '';
      } catch {
        /* тело не JSON — хватит кода */
      }
      throw new ApiError(res.status, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.json();
  }
}

function buildStreams(cfg: QuizConfig): Stream[] {
  const make = (
    kind: Stream['kind'],
    grammarTopic: string | null,
    isWortstellung: boolean,
  ): Stream => ({
    key: kind === 'audio' ? 'audio' : `${grammarTopic}${isWortstellung ? ':wortstellung' : ''}`,
    kind,
    grammarTopic,
    isWortstellung,
    pool: [],
    inflight: false,
    failures: 0,
    retryAt: 0,
    used: [],
    vocab: kind === 'grammar' && grammarTopic !== null && isVocabTopic(grammarTopic),
    dead: false,
  });
  const streams = cfg.grammarTopics.map((t) => make('grammar', t, false));
  // Слот Wortstellung из Morskoy: порядок слов на материале первой грамматической темы
  // (у своих наборов слов заданий на порядок слов нет).
  const firstGrammar = cfg.grammarTopics.find((t) => !isVocabTopic(t));
  if (cfg.wortstellung && firstGrammar) streams.push(make('grammar', firstGrammar, true));
  if (cfg.listening) streams.push(make('audio', null, false));
  return streams;
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
