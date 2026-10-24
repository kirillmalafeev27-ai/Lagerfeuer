// Скриншоты через Playwright: node tools/shots.mjs "query" prefix [WxH ...] [--wait ms] [--click selector]
//   [--eval "js"] [--dpr 2] [--clip x,y,w,h]
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const wait = Number(flag('--wait', '2500'));
const clicks = flag('--click', '');
const script = flag('--eval', '');
const dpr = Number(flag('--dpr', '1'));
const clip = flag('--clip', '');
const query = args[0] ?? '';
const prefix = args[1] ?? 'shots/game';
const sizes = (args.slice(2).length ? args.slice(2) : ['390x844', '768x1024', '1280x720']).map((s) => s.split('x').map(Number));

const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`http://localhost:${port}/?${query}`);
  await page.waitForSelector('.bf', { timeout: 60000 });
  for (const sel of clicks ? clicks.split(',') : []) {
    await page.waitForSelector(sel, { timeout: 60000 });
    await page.click(sel);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(wait);
  if (script) {
    const r = await page.evaluate(script);
    if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r));
  }
  const out = `${prefix}-${w}x${h}.png`;
  const [cx, cy, cw, ch] = clip ? clip.split(',').map(Number) : [];
  await page.screenshot({ path: out, ...(clip ? { clip: { x: cx, y: cy, width: cw, height: ch } } : {}) });
  console.log(out, errors.length ? `\n  ${errors.slice(0, 8).join('\n  ')}` : '');
  await page.close();
}
await browser.close();
await server.close();
