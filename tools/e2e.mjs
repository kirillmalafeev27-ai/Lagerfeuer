// Сквозной тест в браузере: целая ночь глазами игрока.
// node tools/e2e.mjs [--level 1] [--speed 6] [--accuracy 0.92] [--size 1280x720] [--seed 4242] [--out shots/e2e]
// Игрок — смешанный бот (через dev-хук window.__bonfires): выбирает цель тапами, отвечает
// клавишами 1–4 с заданной точностью. Проверяет паузу, обучение, итоги и переход на следующий уровень.
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const level = Number(arg('--level', '1'));
const speed = Number(arg('--speed', '6'));
const accuracy = Number(arg('--accuracy', '0.92'));
const seed = Number(arg('--seed', '4242'));
const [W, H] = arg('--size', '1280x720').split('x').map(Number);
const out = arg('--out', 'shots/e2e');
const budgetMs = Number(arg('--budget', String(8 * 60 * 1000)));

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

let rng = seed >>> 0;
const rand = () => {
  rng = (rng + 0x6d2b79f5) >>> 0;
  let t = rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const snap = () =>
  page.evaluate(() => {
    const b = window.__bonfires;
    const s = b.state();
    return {
      screen: b.screen(),
      correct: b.correct(),
      n: b.options(),
      status: s ? s.status : null,
      share: s ? s.t / s.nightA : 0,
      embers: s ? s.fires.filter((f) => f.embers !== null).length : 0,
      bubble: !!document.querySelector('.bf-bubble'),
    };
  });

/** Пройти ночь: бот-игрок выбирает цель, ответы клавишами. */
async function playNight(tag) {
  const t0 = Date.now();
  let answered = 0;
  let right = 0;
  let bubbles = 0;
  let pauseChecked = false;
  let maxEmbers = 0;
  let last = null;
  while (Date.now() - t0 < budgetMs) {
    const st = await snap();
    last = st;
    maxEmbers = Math.max(maxEmbers, st.embers);
    if (st.screen === 'results') break;
    if (st.bubble) {
      await page.waitForTimeout(950);
      await page.click('.bf-bubble .bf-btn').catch(() => {});
      bubbles++;
      continue;
    }
    if (st.screen === 'play') {
      await page.evaluate(() => window.__bonfires.botStep());
      if (st.correct !== null) {
        const ok = rand() < accuracy;
        const i = ok ? st.correct : (st.correct + 1 + Math.floor(rand() * (st.n - 1))) % st.n;
        await page.keyboard.press(String(i + 1));
        answered++;
        if (ok) right++;
      }
      if (!pauseChecked && answered === 12) {
        pauseChecked = true;
        await page.keyboard.press('p');
        await page.waitForTimeout(300);
        const p = await snap();
        check(p.screen === 'paused', `${tag}: пауза по P (экран ${p.screen})`);
        await page.screenshot({ path: `${out}-${tag}-pause.png` });
        const before = await page.evaluate(() => window.__bonfires.state().t);
        await page.waitForTimeout(700);
        const after = await page.evaluate(() => window.__bonfires.state().t);
        check(after === before, `${tag}: на паузе время ночи стоит`);
        await page.keyboard.press('p');
        await page.waitForTimeout(250);
        check((await snap()).screen === 'play', `${tag}: продолжение по P`);
      }
      if (answered === 30) await page.screenshot({ path: `${out}-${tag}-mid.png` });
    }
    await page.waitForTimeout(90);
  }
  return { answered, right, bubbles, maxEmbers, last, ms: Date.now() - t0 };
}

try {
  await page.goto(`http://localhost:${port}/?level=${level}&speed=${speed}&seed=${seed}`);
  await page.waitForFunction(
    () => window.__bonfires && window.__bonfires.screen() !== 'loading',
    null,
    { timeout: 120000 },
  );
  check(true, 'игра загрузилась');
  const r1 = await playNight(`l${level}`);
  console.log(
    `  ответов ${r1.answered}, верных ${r1.right}, пузырей ${r1.bubbles}, макс. углей ${r1.maxEmbers}, ${Math.round(r1.ms / 1000)} с`,
  );
  check(
    r1.last && r1.last.screen === 'results',
    `ночь закончилась экраном итогов (экран ${r1.last && r1.last.screen})`,
  );
  check(r1.bubbles >= 1, 'обучение показало хотя бы один пузырь');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}-results.png` });
  const res = await page.evaluate(() => {
    const st = window.__bonfires.state();
    return {
      status: st.status,
      stars: st.stars ?? null,
      text: document.querySelector('.bf-results')?.textContent ?? '',
    };
  });
  check(res.text.length > 0, 'карточки итогов на месте');
  console.log(`  итог: ${res.status}`);
  if (res.status === 'won') {
    const next = await page.$('.bf-screen .bf-row .bf-btn:nth-child(2)');
    check(!!next, 'есть кнопка «Дальше»');
    if (next) {
      await next.click();
      await page.waitForTimeout(3500);
      const st = await page.evaluate(() => ({
        screen: window.__bonfires.screen(),
        level: window.__bonfires.state()?.levelId,
      }));
      check(
        st.level === level + 1,
        `следующий уровень открылся (уровень ${st.level}, экран ${st.screen})`,
      );
      await page.screenshot({ path: `${out}-next.png` });
    }
  }
  check(
    errors.length === 0,
    `нет ошибок страницы${errors.length ? ':\n    ' + errors.slice(0, 6).join('\n    ') : ''}`,
  );
} catch (e) {
  failures.push(String(e));
  console.log('✗', e);
  await page.screenshot({ path: `${out}-crash.png` }).catch(() => {});
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.log(`\nE2E: ${failures.length} провал(ов)`);
  process.exit(1);
}
console.log('\nE2E: всё прошло');
