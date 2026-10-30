// Сквозной тест вопросов от ИИ (движок Morskoy) в браузере: формат заданий в панели на разных
// экранах, выбор тем от «Играть», ожидание первого задания в интро, долгий показ ошибки, свой
// набор слов без ключа генерации, помощь после неудач.
// node tools/quizE2e.mjs [--out shots/quiz]
// Сервер генерации подменяется через page.route; набор слов и «нет ключа» — настоящий API
// dev-сервера (ключа генерации в окружении теста нет).
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const out = arg('--out', 'shots/quiz');
await mkdir(out, { recursive: true });

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const base = `http://localhost:${port}/`;
const { EXERCISE_FORMATS } = await server.ssrLoadModule('/server/generation/exerciseFormats.ts');
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/** Примеры каталога форматов — как вопросы серии; плюс аудирование. */
const examples = Object.entries(EXERCISE_FORMATS).map(([id, f]) => ({
  id: `ex-${id}`,
  prompt: f.example.display,
  promptLang: 'de',
  instruction: f.example.text,
  options: f.example.options,
  optionsLang: 'de',
  correctIndex: f.example.correct,
  format: id,
}));
examples.push({
  id: 'ex-audio',
  prompt: 'Немецкая фраза звучит вслух. Выбери точный перевод.',
  promptLang: 'ru',
  instruction: 'Прослушай немецкое предложение и выбери точный русский перевод.',
  options: [
    'Я забираю рецепт в аптеке.',
    'Я отдаю рецепт в аптеке.',
    'Я забираю чек в аптеке.',
    'Я забираю рецепт у врача.',
  ],
  optionsLang: 'ru',
  correctIndex: 0,
  format: 'audio',
  audioText: 'Ich hole das Rezept in der Apotheke ab.',
});

/** Ответ подменённого сервера: задания каталога в формате API (как у Morskoy). */
const apiQuestions = (n) =>
  Array.from({ length: n }, (_, i) => {
    const f = Object.values(EXERCISE_FORMATS)[i % 9].example;
    return {
      format: Object.keys(EXERCISE_FORMATS)[i % 9],
      text: f.text,
      display: f.display,
      options: f.options,
      correct: f.correct,
    };
  });

const TUTORIAL_DONE = JSON.stringify({
  start: true,
  eyes: true,
  oak: true,
  embers: true,
  wind: true,
});

async function openPage(size, storage = {}) {
  const [width, height] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      errors.push(`console: ${m.text()}`);
  });
  await page.addInitScript((items) => {
    if (sessionStorage.getItem('e2e-init')) return;
    sessionStorage.setItem('e2e-init', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, storage);
  return { page, errors };
}

const screenIs = (page, name, timeout = 60000) =>
  page.waitForFunction((n) => window.__bonfires && window.__bonfires.screen() === n, name, {
    timeout,
  });

/** Задание генератора в панели: всё ли встаёт, какой шрифт, нужна ли прокрутка. */
async function measure(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.bf-question');
    const sheet = panel.querySelector('.bf-qsheet');
    const pr = panel.getBoundingClientRect();
    const sr = sheet.getBoundingClientRect();
    const opts = [...panel.querySelectorAll('.bf-option')];
    const text = panel.querySelector('.bf-option .bf-text');
    const scroll = sheet.classList.contains('is-scroll');
    return {
      font: parseFloat(getComputedStyle(text).fontSize),
      scroll,
      inside: opts.every((o) => {
        const r = o.getBoundingClientRect();
        return r.left >= pr.left - 1 && r.right <= pr.right + 1;
      }),
      visible: scroll || opts.every((o) => o.getBoundingClientRect().bottom <= sr.bottom + 1),
      minH: Math.min(...opts.map((o) => o.getBoundingClientRect().height)),
      lines: panel.querySelector('.bf-material').hidden
        ? 0
        : panel.querySelectorAll('.bf-material .bf-pline').length,
      instruction: !panel.querySelector('.bf-instruction').hidden,
      listen: !panel.querySelector('.bf-listen').hidden,
      column: panel.querySelector('.bf-options').classList.contains('is-column'),
      pageScroll: document.scrollingElement.scrollHeight > innerHeight + 1,
    };
  });
}

try {
  // ── 1. Формат заданий в панели ───────────────────────────────────────
  for (const size of ['360x640', '390x844', '412x915', '844x390', '1280x720', '1920x1080']) {
    const { page, errors } = await openPage(size, {
      'bonfires:quiz': JSON.stringify({
        chosen: true,
        config: {
          level: 'B1',
          lexicalTopic: null,
          grammarTopics: ['Dativ'],
          wortstellung: false,
          listening: false,
        },
      }),
      'bonfires:tutorial': TUTORIAL_DONE,
    });
    await page.route('**/api/quiz/status', (r) =>
      r.fulfill({ json: { ok: true, generationConfigured: true, ttsConfigured: false } }),
    );
    await page.route('**/api/generate-questions', (r) =>
      r.fulfill({ json: { questions: apiQuestions(10) } }),
    );
    await page.goto(`${base}?level=4&seed=4242`);
    await screenIs(page, 'play');
    const gen = await page.evaluate(() =>
      document.querySelector('.bf').classList.contains('is-gen'),
    );
    check(gen, `${size}: ночь с заданиями генератора — панель вопроса больше`);
    const scrolled = [];
    let minFont = 99;
    for (const q of examples) {
      await page.evaluate((x) => window.__bonfires.showQuestion(x), q);
      await page.waitForTimeout(40);
      const m = await measure(page);
      minFont = Math.min(minFont, m.font);
      if (m.scroll) scrolled.push(q.format);
      const tag = `${size} ${q.format}`;
      if (!(
        m.inside &&
        m.visible &&
        m.font >= 12 &&
        m.minH >= 48 &&
        m.instruction &&
        !m.pageScroll
      ))
        check(false, `${tag}: раскладка ${JSON.stringify(m)}`);
      if (q.format === 'dialog')
        check(m.lines >= 2, `${tag}: реплики диалога — отдельными строками`);
      if (q.format === 'audio')
        check(m.listen && m.lines === 0, `${tag}: кнопка «Слушать», фразы на экране нет`);
      if (q.format === 'satzvarianten') check(m.column, `${tag}: варианты-предложения — столбиком`);
      if (['satzvarianten', 'dialog', 'audio'].includes(q.format))
        await page.screenshot({ path: `${out}/${size}-${q.format}.png` });
    }
    check(
      true,
      `${size}: все ${examples.length} форматов встают, шрифт вариантов от ${minFont} px${scrolled.length ? `, прокрутка: ${scrolled.join(', ')}` : ', без прокрутки'}`,
    );
    check(errors.length === 0, `${size}: нет ошибок страницы ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // ── 2. Выбор тем от «Играть», ожидание первого задания, долгий показ ошибки ──
  {
    const { page, errors } = await openPage('390x844', { 'bonfires:tutorial': TUTORIAL_DONE });
    const requests = [];
    await page.route('**/api/quiz/status', (r) =>
      r.fulfill({ json: { ok: true, generationConfigured: true, ttsConfigured: false } }),
    );
    await page.route('**/api/generate-questions', async (r) => {
      requests.push(JSON.parse(r.request().postData() || '{}'));
      // Первый блок «генерируется» 4 с: интро должно ждать.
      if (requests.length === 1) await new Promise((res) => setTimeout(res, 4000));
      await r.fulfill({ json: { questions: apiQuestions(10) } });
    });
    await page.goto(base);
    await screenIs(page, 'menu');
    const summary = await page.textContent('.bf-quiz-summary');
    check(/встроенный набор/.test(summary ?? ''), `меню: подпись «${summary}»`);
    await page.click('.bf-menu .bf-btn.is-primary');
    await page.waitForSelector('.bf-quiz', { timeout: 10000 });
    check(true, 'первое «Играть» с генерацией на сервере открывает выбор тем');
    await page.screenshot({ path: `${out}/quiz-screen.png` });
    await page.click('.bf-quiz .bf-tag:has-text("B1")');
    await page.click('.bf-quiz .bf-tag:text-is("Dativ")');
    await page.click('.bf-quiz .bf-btn.is-primary');
    await screenIs(page, 'levels', 10000);
    check(true, 'после «Готово» — выбор ночи');
    await page.click('.bf-level:not([disabled])');
    await screenIs(page, 'intro', 10000);
    const t0 = Date.now();
    await page.waitForTimeout(3200);
    const wait = await page.evaluate(() => ({
      screen: window.__bonfires.screen(),
      t: window.__bonfires.state().t,
      card: document.querySelector('.bf-prompt.is-waiting')?.textContent ?? '',
      intro: !!document.querySelector('.bf-world > .bf-intro'),
    }));
    check(
      wait.screen === 'intro' && wait.t === 0 && /Готовлю/.test(wait.card) && wait.intro,
      `интро ждёт первое задание: ночь стоит (${JSON.stringify(wait)})`,
    );
    await page.screenshot({ path: `${out}/intro-waiting.png` });
    await screenIs(page, 'play', 20000);
    check(Date.now() - t0 >= 3500, `ночь началась, когда пришло задание (${Date.now() - t0} мс)`);
    const body = requests[0] ?? {};
    check(
      body.level === 'B1' && body.grammarTopic === 'Dativ' && body.count === 10,
      `запрос генерации: ${JSON.stringify(body)}`,
    );
    const shown = await page.evaluate(() => ({
      instruction: document.querySelector('.bf-instruction').textContent,
      n: document.querySelectorAll('.bf-option').length,
      generated: window.__bonfires.state().generated,
    }));
    check(
      shown.n === 4 && shown.instruction.length > 5 && shown.generated,
      `в ночи — задание генератора (${JSON.stringify(shown)})`,
    );
    const answer = async (right) => {
      await page.waitForFunction(() => window.__bonfires.correct() !== null, null, {
        timeout: 10000,
      });
      // Как человек: не раньше защиты от двойного тапа (doubleTapGuardMs).
      await page.waitForTimeout(250);
      const c = await page.evaluate(() => window.__bonfires.correct());
      await page.evaluate((i) => window.__bonfires.answer(i), right ? c : (c + 1) % 4);
      const t = Date.now();
      await page.waitForFunction(() => window.__bonfires.correct() !== null, null, {
        timeout: 10000,
      });
      return Date.now() - t;
    };
    for (let i = 0; i < 3; i++) {
      // Цель выбирает смешанный бот (как в tools/e2e.mjs): без цели верный ответ — «про запас».
      await page.evaluate(() => window.__bonfires.botStep());
      await answer(true);
    }
    await page.evaluate(() => window.__bonfires.botStep());
    const wrongMs = await answer(false);
    check(wrongMs >= 1700, `после ошибки верный вариант виден ~1,8 с (${wrongMs} мс)`);
    const pace = await page.evaluate(() => ({
      gen: JSON.parse(localStorage.getItem('series:pace:gen:B1') ?? '{"times":[]}').times.length,
      bank: localStorage.getItem('series:pace'),
    }));
    check(
      pace.gen === 4 && pace.bank === null,
      `темп заданий генератора — под своим ключом уровня B1 (${JSON.stringify(pace)})`,
    );
    await page.screenshot({ path: `${out}/night-generated.png` });
    check(errors.length === 0, `выбор тем: нет ошибок страницы ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // ── 3. Свой набор слов без ключа генерации (настоящий API dev-сервера) ──
  {
    const { page, errors } = await openPage('390x844', { 'bonfires:tutorial': TUTORIAL_DONE });
    await page.goto(base);
    await screenIs(page, 'menu');
    await page.click('.bf-menu-row .bf-btn:first-child');
    await page.waitForSelector('.bf-quiz');
    await page.waitForFunction(
      () => /ключ генерации/.test(document.querySelector('.bf-quiz-status')?.textContent ?? ''),
      null,
      { timeout: 10000 },
    );
    check(true, 'без ключа выбор тем предупреждает: пока встроенный набор');
    await page.click('.bf-quiz .bf-tag:text-is("Wortschatz für Sascha und Präpositionen")');
    await page.click('.bf-quiz .bf-btn.is-primary');
    await page.waitForFunction(
      () => /Sascha/.test(document.querySelector('.bf-quiz-summary')?.textContent ?? ''),
      null,
      { timeout: 5000 },
    );
    check(true, 'подпись в меню показывает выбранную тему');
    await page.click('.bf-menu .bf-btn.is-primary');
    await screenIs(page, 'levels', 10000);
    await page.click('.bf-level:not([disabled])');
    await screenIs(page, 'play', 20000);
    let vocab = 0;
    for (let i = 0; i < 5; i++) {
      await page.waitForFunction(() => window.__bonfires.correct() !== null, null, {
        timeout: 10000,
      });
      const q = await page.evaluate(() => ({
        instruction: !document.querySelector('.bf-instruction').hidden,
        prompt: document.querySelector('.bf-material').textContent,
      }));
      if (q.instruction && (/___/.test(q.prompt) || /[А-Яа-я]/.test(q.prompt))) vocab++;
      await page.evaluate(() => window.__bonfires.botStep());
      await page.waitForTimeout(250);
      const c = await page.evaluate(() => window.__bonfires.correct());
      await page.evaluate((i) => window.__bonfires.answer(i), c);
    }
    check(vocab === 5, `в ночи — задания своего набора слов (${vocab} из 5)`);
    const st = await page.evaluate(() => ({
      generated: window.__bonfires.state().generated,
      gen: document.querySelector('.bf').classList.contains('is-gen'),
    }));
    check(
      st.generated && st.gen,
      `набор слов играется как ночь с заданиями (${JSON.stringify(st)})`,
    );
    const pace = await page.evaluate(() => ({
      vocab: JSON.parse(localStorage.getItem('series:pace:gen:vocab') ?? '{"times":[]}').times
        .length,
      level: localStorage.getItem('series:pace:gen:B1'),
    }));
    check(
      pace.vocab === 5 && pace.level === null,
      `темп своего набора слов — под своим ключом, а не уровня B1 (${JSON.stringify(pace)})`,
    );
    await page.screenshot({ path: `${out}/night-vocab.png` });
    check(errors.length === 0, `набор слов: нет ошибок страницы ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // ── 4. Помощь после неудач: угли тлеют дольше ───────────────────────
  {
    const { page, errors } = await openPage('1280x720', {
      'bonfires:tutorial': TUTORIAL_DONE,
      'bonfires:progress': JSON.stringify({ unlocked: ['1', '2'], best: {}, streak: { 2: 2 } }),
    });
    await page.goto(`${base}?level=2&seed=4242`);
    await screenIs(page, 'intro');
    const note = await page.textContent('.bf-intro .bf-assist-note').catch(() => '');
    const emberA = await page.evaluate(() => window.__bonfires.state().emberA);
    check(
      /Сухой мох/.test(note ?? '') && Math.abs(emberA - 4.2) < 1e-9,
      `после двух неудач подряд — сухой мох: «${note}», угли ${emberA} A`,
    );
    await page.screenshot({ path: `${out}/assist-intro.png` });
    await page.close();
    if (errors.length) check(false, `помощь: ошибки страницы ${errors.slice(0, 3).join(' | ')}`);

    const second = await openPage('1280x720', {
      'bonfires:tutorial': TUTORIAL_DONE,
      'bonfires:progress': JSON.stringify({ unlocked: ['1'], best: {}, streak: { 1: 1 } }),
    });
    const p2 = second.page;
    await p2.goto(`${base}?level=1&seed=4242&speed=16`);
    await screenIs(p2, 'play');
    // Все костры — почти без дров: волк выйдет, это второе поражение подряд.
    await p2.evaluate(() => {
      for (const f of window.__bonfires.state().fires) {
        f.fuel = 0.001;
        f.logs = [{ kind: 'birch', amount: 0.001 }];
      }
    });
    await screenIs(p2, 'results', 60000);
    await p2.waitForTimeout(1500);
    const next = await p2.textContent('.bf-assist-next').catch(() => '');
    check(/В следующий раз — сухой мох/.test(next ?? ''), `итоги второго поражения: «${next}»`);
    await p2.screenshot({ path: `${out}/assist-results.png` });
    check(
      second.errors.length === 0,
      `итоги: нет ошибок страницы ${second.errors.slice(0, 3).join(' | ')}`,
    );
    await p2.close();
  }
} catch (e) {
  failures.push(String(e));
  console.log('✗', e);
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.log(`\nВопросы: ${failures.length} провал(ов)`);
  process.exit(1);
}
console.log('\nВопросы: всё прошло');
