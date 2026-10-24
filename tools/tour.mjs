// Снимки ключевых моментов ночи: порыв ветра, разгорающийся дуб, угли и волк, рассвет, финал.
// node tools/tour.mjs [--level 3] [--seed 99] [--speed 3] [--size 1280x720] [--out shots/tour]
// Игрок — бот через dev-хук; ненадолго «задумывается», чтобы костёр ушёл в угли.
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const level = Number(arg('--level', '3'));
const seed = Number(arg('--seed', '99'));
const speed = Number(arg('--speed', '3'));
const [W, H] = arg('--size', '1280x720').split('x').map(Number);
const out = arg('--out', 'shots/tour');

const server = await createServer({ server: { port: 5191, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(
  `http://localhost:${port}/?level=${level}&seed=${seed}&speed=${speed}&quality=high`,
);
await page.waitForFunction(
  () => window.__bonfires && window.__bonfires.screen() !== 'loading',
  null,
  { timeout: 120000 },
);

const taken = new Set();
const shot = async (name) => {
  if (taken.has(name)) return;
  taken.add(name);
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('снимок:', name);
};

let idleUntil = 0;
const t0 = Date.now();
while (Date.now() - t0 < 9 * 60 * 1000) {
  const st = await page.evaluate(() => {
    const b = window.__bonfires;
    const s = b.state();
    return {
      screen: b.screen(),
      correct: b.correct(),
      bubble: !!document.querySelector('.bf-bubble'),
      share: s ? s.t / s.nightA : 0,
      status: s ? s.status : null,
      gust: s ? s.gusts.some((g) => g.phase === 2) : false,
      warned: s ? s.gusts.some((g) => g.phase === 1) : false,
      catching: s ? s.fires.some((f) => f.catching !== null) : false,
      embers: s ? s.fires.filter((f) => f.embers !== null).length : 0,
      eyes: s ? Math.max(...s.fires.map((f) => f.lowLevel)) : 0,
    };
  });
  if (st.screen === 'results') {
    await page.waitForTimeout(1500);
    await shot('results');
    break;
  }
  if (st.screen === 'over') {
    await page.waitForTimeout(st.status === 'won' ? 900 : 600);
    await shot(`finale-${st.status}`);
    await page.waitForTimeout(300);
    continue;
  }
  if (st.bubble) {
    await page.waitForTimeout(950);
    await page.click('.bf-bubble .bf-btn').catch(() => {});
    continue;
  }
  if (st.warned) await shot('wind-warning');
  if (st.gust) await shot('gust');
  if (st.catching) await shot('oak-catching');
  if (st.eyes >= 2 && st.embers === 0) await shot('eyes');
  if (st.embers > 0) await shot('embers');
  if (st.share > 0.86) await shot('dawn');
  // Один раз «задуматься», чтобы увидеть угли и волка.
  if (!taken.has('embers') && st.share > 0.35 && idleUntil === 0) idleUntil = Date.now() + 25000;
  const idle = idleUntil > Date.now() && !taken.has('embers');
  if (st.screen === 'play' && !idle) {
    await page.evaluate(() => window.__bonfires.botStep());
    if (st.correct !== null) await page.keyboard.press(String(st.correct + 1));
  }
  await page.waitForTimeout(90);
}
await browser.close();
await server.close();
