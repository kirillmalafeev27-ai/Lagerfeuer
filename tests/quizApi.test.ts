import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../server/ai.ts';
import { QuizService, createQuizHandler } from '../server/api.ts';

/** Ответ модели в текстовом формате: n заданий, одно из них — запрещённое «служебное слово». */
function modelAnswer(n: number): string {
  const tasks: string[] = [];
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) {
    tasks.push(`${i}. Format: satzvarianten
Anweisung: Выбери грамматически правильный вариант.
Aufgabe: Situation ${i}: Sein Zug fährt um sechs. (vorhaben – früh aufstehen)
A) Er hat vor, am ${i}. Mai früh aufzustehen.
B) Er hat vor, am ${i}. Mai früh zu aufstehen.
C) Er hat vor, am ${i}. Mai früh aufstehen zu.
D) Er hat vor, am ${i}. Mai früh aufstehen.`);
    keys.push(`${i}: A = Er hat vor, am ${i}. Mai früh aufzustehen.`);
  }
  tasks.push(`${n + 1}. Format: luecke
Anweisung: Выбери правильный вариант.
Aufgabe: Er versucht, den Bahnhof ___ finden.
A) zu
B) –
C) zum
D) um zu`);
  keys.push(`${n + 1}: A = zu`);
  return `AUFGABEN\n${tasks.join('\n\n')}\n\nLÖSUNGEN\n${keys.join('\n')}`;
}

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function fakeAi(
  reply: (body: Record<string, unknown>) => { status: number; content?: string; raw?: string },
) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    const r = reply(body);
    const text = r.raw ?? JSON.stringify({ choices: [{ message: { content: r.content ?? '' } }] });
    return new Response(text, { status: r.status });
  };
  return { calls, fetchImpl };
}

const quiet = { log: () => {}, warn: () => {} };
const ENV = { AITUNNEL_API_KEY: 'test-key', AITUNNEL_MODELS: 'm1,m2' };

describe('генерация заданий', () => {
  it('отдаёт проверенный блок и отсеивает задание на служебное слово', async () => {
    const ai = fakeAi(() => ({ status: 200, content: modelAnswer(6) }));
    const service = new QuizService({ env: ENV, fetch: ai.fetchImpl, log: quiet });
    const { questions } = await service.generateQuestions({
      level: 'B1',
      grammarTopic: 'Infinitiv mit zu',
      lexicalTopic: 'Reisen und Urlaub',
      count: 4,
    });
    expect(questions).toHaveLength(4);
    expect(questions[0]).toMatchObject({ format: 'satzvarianten', correct: 0 });
    expect(questions.some((q) => q.options.includes('zum'))).toBe(false);
    // Просим на четыре больше, чем нужно, — с запасом на брак.
    const prompt = String((ai.calls[0].body.messages as { content: string }[]).at(-1)?.content);
    expect(prompt).toMatch(/Erstelle genau 8 Multiple-Choice-Aufgaben/);
    expect(prompt).toMatch(/WORTSCHATZTHEMA: Reisen und Urlaub/);
    expect(ai.calls[0].url).toBe('https://api.aitunnel.ru/v1/chat/completions');
  });

  it('лишние задания ждут в пуле и выдаются без нового запроса', async () => {
    const ai = fakeAi(() => ({ status: 200, content: modelAnswer(8) }));
    const service = new QuizService({ env: ENV, fetch: ai.fetchImpl, log: quiet });
    const body = { level: 'B1', grammarTopic: 'Infinitiv mit zu', count: 4 };
    const first = await service.generateQuestions(body);
    const second = await service.generateQuestions({ ...body, grammarTopic: 'Infinitiv mit zu' });
    expect(ai.calls).toHaveLength(1);
    expect(second.questions).toHaveLength(4);
    expect(second.questions[0].display).not.toBe(first.questions[0].display);
  });

  it('модели перебираются; на «max_completion_tokens» та же модель повторяется', async () => {
    const ai = fakeAi((body) => {
      if (body.model === 'm1') return { status: 500, raw: 'boom' };
      if ('max_tokens' in body)
        return { status: 400, raw: '{"error":"Use max_completion_tokens instead of max_tokens"}' };
      return { status: 200, content: modelAnswer(3) };
    });
    const service = new QuizService({ env: ENV, fetch: ai.fetchImpl, log: quiet });
    const { questions } = await service.generateQuestions({
      level: 'A2',
      grammarTopic: 'Dativ',
      count: 2,
    });
    expect(questions).toHaveLength(2);
    expect(ai.calls.map((c) => [c.body.model, 'max_tokens' in c.body])).toEqual([
      ['m1', true],
      ['m2', true],
      ['m2', false],
    ]);
  });

  it('без ключа — 503, тема не из каталога — 400, все модели упали — 502', async () => {
    const none = new QuizService({ env: {}, log: quiet });
    await expect(
      none.generateQuestions({ level: 'A1', grammarTopic: 'Dativ' }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
    const ai = fakeAi(() => ({ status: 500, raw: 'down' }));
    const service = new QuizService({ env: ENV, fetch: ai.fetchImpl, log: quiet });
    await expect(
      service.generateQuestions({ level: 'A1', grammarTopic: 'Schreib ein Gedicht' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.generateQuestions({ level: 'A1' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.generateQuestions({ level: 'A1', grammarTopic: 'Dativ' }),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('аудирование: JSON модели превращается в задания с русскими вариантами', async () => {
    const items = [
      {
        audioText: 'Ich hole das Rezept in der Apotheke ab.',
        options: [
          'Я забираю рецепт в аптеке.',
          'Я отдаю рецепт в аптеке.',
          'Я забираю чек в аптеке.',
          'Я забираю рецепт у врача.',
        ],
        correct: 0,
      },
    ];
    const ai = fakeAi(() => ({ status: 200, content: JSON.stringify(items) }));
    const service = new QuizService({ env: ENV, fetch: ai.fetchImpl, log: quiet });
    const { questions } = await service.generateAudioQuestions({
      level: 'A2',
      lexicalTopic: 'Einkaufen',
      count: 1,
    });
    expect(questions[0]).toMatchObject({
      mode: 'audio',
      audioText: items[0].audioText,
      correct: 0,
    });
    const prompt = String((ai.calls[0].body.messages as { content: string }[]).at(-1)?.content);
    expect(prompt).toMatch(/Lexical topic: Einkaufen/);
  });
});

describe('HTTP-обработчик', () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function serve(env: Record<string, string>, fetchImpl?: FetchLike) {
    const handler = createQuizHandler(new QuizService({ env, fetch: fetchImpl, log: quiet }));
    const server = createServer((req, res) => handler(req, res, () => res.end('next')));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    close = () => new Promise((r) => server.close(() => r()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('статус, здоровье, ошибки и передача дальше', async () => {
    const base = await serve({});
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ ok: true });
    const status = await (await fetch(`${base}/api/quiz/status`)).json();
    expect(status).toMatchObject({ ok: true, generationConfigured: false, ttsConfigured: false });
    const post = (path: string, body: string) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    expect(
      (await post('/api/generate-questions', '{"level":"A1","grammarTopic":"Dativ"}')).status,
    ).toBe(503);
    expect((await post('/api/generate-questions', '{oops')).status).toBe(400);
    expect((await post('/api/tts', '{"text":"Hallo"}')).status).toBe(503);
    expect((await fetch(`${base}/api/generate-questions`)).status).toBe(405);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect(await (await fetch(`${base}/index.html`)).text()).toBe('next');
  });

  it('свой набор слов отдаётся без ключа генерации и без обращения к модели', async () => {
    const ai = fakeAi(() => ({ status: 500 }));
    const base = await serve({}, ai.fetchImpl);
    const res = await fetch(`${base}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'A2',
        grammarTopic: 'Wortschatz für Sascha und Präpositionen',
        count: 10,
        exclude: ['Я горжусь своим рисунком.'],
      }),
    });
    expect(res.status).toBe(200);
    const { questions } = (await res.json()) as { questions: Record<string, unknown>[] };
    expect(questions).toHaveLength(10);
    expect(questions.map((q) => q.display)).not.toContain('Я горжусь своим рисунком.');
    for (const q of questions) {
      expect(['wortwahl', 'uebersetzung', 'praeposition', 'kasus']).toContain(q.format);
      expect(q.options).toHaveLength(4);
    }
    expect(ai.calls).toEqual([]);
  });

  it('генерация через HTTP отдаёт задания в формате Morskoy', async () => {
    const ai = fakeAi(() => ({ status: 200, content: modelAnswer(3) }));
    const base = await serve(ENV, ai.fetchImpl);
    const res = await fetch(`${base}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'B1', grammarTopic: 'Infinitiv mit zu', count: 2 }),
    });
    expect(res.status).toBe(200);
    const { questions } = (await res.json()) as { questions: Record<string, unknown>[] };
    expect(questions).toHaveLength(2);
    expect(Object.keys(questions[0]).sort()).toEqual([
      'correct',
      'display',
      'format',
      'options',
      'text',
    ]);
  });
});
