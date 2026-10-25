import { describe, expect, it } from 'vitest';
import {
  AiQuestionProvider,
  type AiProviderOptions,
  isConfigurable,
} from '../src/shared/questions/AiQuestionProvider.ts';
import { LocalBankProvider } from '../src/shared/questions/LocalBankProvider.ts';
import { type QuizConfig, sanitizeQuizConfig } from '../src/shared/questions/topics.ts';
import type { Question, QuestionProvider } from '../src/shared/questions/types.ts';

/** Запасной источник: нумерованные вопросы, отчёты копятся. */
function bank(): QuestionProvider & { reports: { id: string; correct: boolean }[] } {
  let n = 0;
  const reports: { id: string; correct: boolean }[] = [];
  return {
    reports,
    async next(): Promise<Question> {
      n++;
      return {
        id: `bank-${n}`,
        prompt: `___ Tisch ${n}`,
        promptLang: 'de',
        options: ['der', 'die', 'das'],
        optionsLang: 'de',
        correctIndex: 0,
      };
    },
    report: (r) => reports.push(r),
  };
}

interface Req {
  path: string;
  body: Record<string, unknown>;
}

/** Сервер генерации: на каждый запрос — блок заданий по теме из тела запроса. */
function api(opts: { status?: number; delayMs?: number; size?: number } = {}) {
  const requests: Req[] = [];
  let n = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://game/', '');
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    requests.push({ path, body });
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (path === 'api/quiz/status')
      return Response.json({
        ok: true,
        generationConfigured: opts.status !== 503,
        ttsConfigured: false,
      });
    if (opts.status && opts.status !== 200)
      return Response.json({ error: 'nope' }, { status: opts.status });
    const questions = Array.from({ length: opts.size ?? 10 }, () => {
      n++;
      if (path === 'api/generate-audio-questions')
        return {
          mode: 'audio',
          text: 'Прослушай немецкое предложение и выбери точный русский перевод.',
          display: 'Немецкая фраза звучит вслух. Выбери точный перевод.',
          audioText: `Satz ${n}.`,
          options: [`Фраза ${n}.`, 'Другое.', 'Третье.', 'Четвёртое.'],
          correct: 0,
        };
      return {
        format: 'satzvarianten',
        text: 'Выбери грамматически правильный вариант.',
        display: `${body.grammarTopic}${body.isWortstellung ? ' W' : ''} #${n}`,
        options: [`Richtig ${n}.`, `Falsch A ${n}.`, `Falsch B ${n}.`, `Falsch C ${n}.`],
        correct: 0,
      };
    });
    return Response.json({ questions });
  }) as typeof fetch;
  return { requests, fetchImpl };
}

function provider(
  fetchImpl: typeof fetch,
  fallback = bank(),
  over: Partial<AiProviderOptions> = {},
) {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return new AiQuestionProvider({
    fallback,
    batchSize: 10,
    refillAt: 3,
    firstWaitMs: 2000,
    nextWaitMs: 30,
    requestTimeoutMs: 5000,
    retryWrongMin: 4,
    retryWrongMax: 6,
    baseUrl: 'http://game/',
    fetch: fetchImpl,
    random,
    ...over,
  });
}

const SASCHA = 'Wortschatz für Sascha und Präpositionen';

const B1: QuizConfig = {
  level: 'B1',
  lexicalTopic: 'Reisen und Urlaub',
  grammarTopics: ['Dativ', 'Perfekt'],
  wortstellung: false,
  listening: false,
};

describe('ИИ-провайдер вопросов', () => {
  it('без выбранных тем отдаёт встроенный банк', async () => {
    const fb = bank();
    const p = provider(api().fetchImpl, fb);
    expect(isConfigurable(p)).toBe(true);
    const one: Question = {
      id: 'art-001',
      prompt: '___ Tisch',
      promptLang: 'de',
      options: ['der', 'die', 'das'],
      optionsLang: 'de',
      correctIndex: 0,
    };
    expect(isConfigurable(new LocalBankProvider([one]))).toBe(false);
    const q = await p.next();
    expect(q.id).toBe('bank-1');
    p.report({ id: q.id, correct: false, timeMs: 1000 });
    expect(fb.reports).toEqual([{ id: 'bank-1', correct: false, timeMs: 1000 }]);
  });

  it('чередует темы, переводит формат Morskoy в вопрос серии и перемешивает варианты', async () => {
    const server = api();
    const p = provider(server.fetchImpl);
    p.configure(B1);
    const got: Question[] = [];
    for (let i = 0; i < 6; i++) got.push(await p.next());
    expect(got.map((q) => q.prompt.split(' ')[0])).toEqual([
      'Dativ',
      'Perfekt',
      'Dativ',
      'Perfekt',
      'Dativ',
      'Perfekt',
    ]);
    for (const q of got) {
      expect(q).toMatchObject({ promptLang: 'de', optionsLang: 'de', format: 'satzvarianten' });
      expect(q.instruction).toBe('Выбери грамматически правильный вариант.');
      expect(q.options[q.correctIndex]).toMatch(/^Richtig/);
      expect(q.id).toMatch(/^ai-/);
    }
    expect(got.some((q) => q.correctIndex !== 0)).toBe(true);
    const first = server.requests.filter((r) => r.path === 'api/generate-questions');
    expect(first.map((r) => r.body.grammarTopic)).toEqual(['Dativ', 'Perfekt']);
    expect(first[0].body).toMatchObject({
      level: 'B1',
      lexicalTopic: 'Reisen und Urlaub',
      count: 10,
      exclude: [],
    });
  });

  it('заранее запрашивает следующий блок и передаёт показанные и ждущие в очереди задания', async () => {
    const server = api();
    const p = provider(server.fetchImpl);
    p.configure({ ...B1, grammarTopics: ['Dativ'] });
    const shown: string[] = [];
    for (let i = 0; i < 7; i++) shown.push((await p.next()).prompt);
    // Осталось 3 из 10 — пора за следующим блоком.
    await new Promise((r) => setTimeout(r, 10));
    const calls = server.requests.filter((r) => r.path === 'api/generate-questions');
    expect(calls).toHaveLength(2);
    const exclude = calls[1].body.exclude as string[];
    expect(exclude).toHaveLength(10);
    expect(exclude.slice(0, 7)).toEqual(shown);
    const queued = exclude.slice(7);
    for (let i = 0; i < 3; i++) expect(queued).toContain((await p.next()).prompt);
    for (let i = 0; i < 7; i++) expect((await p.next()).prompt).toMatch(/^Dativ #/);
  });

  it('неверный ответ возвращается через 4–6 вопросов', async () => {
    const p = provider(api().fetchImpl);
    p.configure(B1);
    const first = await p.next();
    p.report({ id: first.id, correct: false, timeMs: 3000 });
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await p.next()).id);
    const at = ids.indexOf(first.id);
    expect(at).toBeGreaterThanOrEqual(3);
    expect(at).toBeLessThanOrEqual(5);
    expect(ids.filter((id) => id === first.id)).toHaveLength(1);
  });

  it('если генерации на сервере нет (503), сразу берёт банк и не повторяет запросы', async () => {
    const server = api({ status: 503 });
    const p = provider(server.fetchImpl);
    p.configure(B1);
    const q = await p.next();
    expect(q.id).toMatch(/^bank-/);
    await p.next();
    expect(server.requests.filter((r) => r.path === 'api/generate-questions')).toHaveLength(2);
    expect(p.debugInfo().disabled).toBe(true);
    expect(await p.status()).toMatchObject({ available: true, generationConfigured: false });
  });

  it('без ключа генерации свой набор слов приходит дальше, а грамматика замолкает', async () => {
    const server = api();
    const requests: string[] = [];
    // Сервер без ключа: грамматика — 503, свой набор слов он отдаёт и так.
    const noKey = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      requests.push(String(body.grammarTopic ?? ''));
      if (String(url).endsWith('api/generate-questions') && body.grammarTopic !== SASCHA)
        return Response.json({ error: 'AITUNNEL_API_KEY is not configured' }, { status: 503 });
      return server.fetchImpl(url, init);
    }) as typeof fetch;
    const p = provider(noKey);
    p.configure({ ...B1, grammarTopics: [SASCHA, 'Dativ'], wortstellung: true });
    const got = [];
    for (let i = 0; i < 6; i++) got.push(await p.next());
    expect(got.every((q) => q.prompt.startsWith(SASCHA))).toBe(true);
    expect(p.debugInfo().disabled).toBe(false);
    // Мёртвые потоки больше не запрашиваются: Dativ и Wortstellung — по одному разу.
    expect(requests.filter((t) => t === 'Dativ')).toHaveLength(2);
  });

  it('API нет совсем — статус «недоступен»', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const p = provider(offline);
    expect(await p.status()).toEqual({
      available: false,
      generationConfigured: false,
      ttsConfigured: false,
    });
    p.configure(B1);
    expect((await p.next()).id).toMatch(/^bank-/);
  });

  it('первый вопрос ждёт генерацию, но не дольше firstWaitMs', async () => {
    const slow = api({ delayMs: 200 });
    const p = provider(slow.fetchImpl, bank(), { firstWaitMs: 1000 });
    p.configure(B1);
    expect((await p.next()).id).toMatch(/^ai-/);

    const never = api({ delayMs: 5000 });
    const q = provider(never.fetchImpl, bank(), { firstWaitMs: 50 });
    q.configure(B1);
    expect((await q.next()).id).toMatch(/^bank-/);
  });

  it('новые темы сбрасывают очереди и повторы; поздний ответ по старым темам не попадает в игру', async () => {
    const server = api({ delayMs: 30 });
    const p = provider(server.fetchImpl);
    p.configure(B1);
    const wrong = await p.next();
    p.report({ id: wrong.id, correct: false, timeMs: 1000 });
    p.configure({ ...B1, grammarTopics: ['Passiv'] });
    for (let i = 0; i < 8; i++) {
      const q = await p.next();
      expect(q.prompt).toMatch(/^Passiv/);
      expect(q.id).not.toBe(wrong.id);
    }
  });

  it('Wortstellung и аудирование — отдельные потоки', async () => {
    const server = api();
    const p = provider(server.fetchImpl);
    p.configure({ ...B1, grammarTopics: ['Dativ'], wortstellung: true, listening: true });
    const qs: Question[] = [];
    for (let i = 0; i < 3; i++) qs.push(await p.next());
    expect(qs[0].prompt).toMatch(/^Dativ #/);
    expect(qs[1].prompt).toMatch(/^Dativ W #/);
    expect(qs[2]).toMatchObject({ promptLang: 'ru', optionsLang: 'ru', format: 'audio' });
    expect(qs[2].audioText).toMatch(/^Satz/);
    expect(qs[2].options[qs[2].correctIndex]).toMatch(/^Фраза/);
    const word = server.requests.find((r) => r.body.isWortstellung === true);
    expect(word?.body.grammarTopic).toBe('Dativ');
    expect(server.requests.some((r) => r.path === 'api/generate-audio-questions')).toBe(true);
  });

  it('свой набор слов: Wortstellung — на материале первой грамматической темы, перевод — русская фраза', async () => {
    const server = api();
    const p = provider(server.fetchImpl);
    p.configure({ ...B1, grammarTopics: [SASCHA, 'Dativ'], wortstellung: true });
    for (let i = 0; i < 3; i++) await p.next();
    const word = server.requests.filter((r) => r.body.isWortstellung === true);
    expect(word.map((r) => r.body.grammarTopic)).toEqual(['Dativ']);

    const ru = (async () =>
      Response.json({
        questions: [
          {
            format: 'uebersetzung',
            text: 'Как сказать это по-немецки?',
            display: 'Я горжусь своим рисунком.',
            displayLang: 'ru',
            options: ['Ich bin stolz auf mein Bild.', 'b', 'c', 'd'],
            correct: 0,
          },
        ],
      })) as unknown as typeof fetch;
    const q2 = provider(ru);
    q2.configure({ ...B1, grammarTopics: [SASCHA] });
    expect(await q2.next()).toMatchObject({
      promptLang: 'ru',
      optionsLang: 'de',
      format: 'uebersetzung',
    });
  });

  it('битые задания из ответа отбрасываются', async () => {
    const broken = (async () =>
      Response.json({
        questions: [
          { text: 'x', display: 'ok', options: ['a', 'b', 'c', 'd'], correct: 2 },
          { text: 'x', display: 'no', options: ['a', 'a', 'c', 'd'], correct: 0 },
          { text: 'x', display: 'no', options: ['a', 'b'], correct: 5 },
          { text: 'x', display: '', options: ['a', 'b', 'c', 'd'], correct: 0 },
          'мусор',
        ],
      })) as unknown as typeof fetch;
    const p = provider(broken);
    p.configure(B1);
    const q = await p.next();
    expect(q.prompt).toBe('ok');
    expect(q.options[q.correctIndex]).toBe('c');
  });
});

describe('сохранённый выбор тем', () => {
  it('чинится и отбрасывает неизвестное', () => {
    expect(sanitizeQuizConfig(null)).toBeNull();
    expect(sanitizeQuizConfig({ level: 'Z9', grammarTopics: ['Dativ'] })).toBeNull();
    expect(sanitizeQuizConfig({ level: 'B1', grammarTopics: [] })).toBeNull();
    expect(
      sanitizeQuizConfig({
        level: 'B1',
        lexicalTopic: 'Mars',
        grammarTopics: [
          'Dativ',
          'Dativ',
          'Quatsch',
          'Perfekt',
          'Passiv',
          'Genitiv',
          'Negation',
          'Lassen',
        ],
        wortstellung: true,
      }),
    ).toEqual({
      level: 'B1',
      lexicalTopic: null,
      grammarTopics: ['Dativ', 'Perfekt', 'Passiv', 'Genitiv', 'Negation'],
      wortstellung: true,
      listening: false,
    });
    // Свой набор слов — тоже тема; порядку слов на нём не тренироваться.
    expect(
      sanitizeQuizConfig({ level: 'A2', grammarTopics: [SASCHA], wortstellung: true }),
    ).toEqual({
      level: 'A2',
      lexicalTopic: null,
      grammarTopics: [SASCHA],
      wortstellung: false,
      listening: false,
    });
    expect(
      sanitizeQuizConfig({ level: 'A1', grammarTopics: [], listening: true, wortstellung: true }),
    ).toEqual({
      level: 'A1',
      lexicalTopic: null,
      grammarTopics: [],
      wortstellung: false,
      listening: true,
    });
  });
});
