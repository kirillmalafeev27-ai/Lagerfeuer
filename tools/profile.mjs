// Профиль кадров в браузере: длинные задачи и самые затратные функции за 25 с игры.
// node tools/profile.mjs
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5195, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${port}/?level=1&speed=2&seed=4242`);
await page.waitForFunction(
  () => window.__bonfires && window.__bonfires.screen() !== 'loading',
  null,
  { timeout: 120000 },
);
await page.evaluate(() => {
  window.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      window.__long.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
});
const client = await page.context().newCDPSession(page);
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 500 });
await client.send('Profiler.start');
const t0 = Date.now();
while (Date.now() - t0 < 25000) {
  const st = await page.evaluate(() => ({
    bubble: !!document.querySelector('.bf-bubble'),
    c: window.__bonfires.correct(),
    screen: window.__bonfires.screen(),
  }));
  if (st.bubble) {
    await page.waitForTimeout(950);
    await page.click('.bf-bubble .bf-btn').catch(() => {});
    continue;
  }
  if (st.screen === 'play') {
    await page.evaluate(() => window.__bonfires.botStep());
    if (st.c !== null) await page.keyboard.press(String(st.c + 1));
  }
  await page.waitForTimeout(100);
}
const { profile } = await client.send('Profiler.stop');
const long = await page.evaluate(() => window.__long);
console.log('long tasks (start, ms):', JSON.stringify(long.filter(([, d]) => d > 300)));
// self time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas;
const samples = profile.samples;
for (let i = 0; i < samples.length; i++) {
  const n = byId.get(samples[i]);
  const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(k, (self.get(k) || 0) + (dts[i] || 0));
}
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const callers = new Map();
for (let i = 0; i < samples.length; i++) {
  const n = byId.get(samples[i]);
  if (!['toDataURL', 'getImageData'].includes(n.callFrame.functionName)) continue;
  const chain = [];
  for (let id = parent.get(n.id), d = 0; id && d < 6; id = parent.get(id), d++) {
    const q = byId.get(id);
    chain.push(
      `${q.callFrame.functionName || '(anon)'}@${q.callFrame.url.split('/').pop()}:${q.callFrame.lineNumber}`,
    );
  }
  const k = n.callFrame.functionName + ' <- ' + chain.join(' <- ');
  callers.set(k, (callers.get(k) || 0) + (dts[i] || 0));
}
for (const [k, v] of [...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
  console.log((v / 1000).toFixed(0), 'ms', k);
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
for (const [k, v] of top) console.log((v / 1000).toFixed(0).padStart(7), 'ms', k);
await browser.close();
await server.close();
