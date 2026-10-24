// Скриншот лаборатории арта: node tools/lab.mjs "only=bg&scale=0.5" out.png [width]
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const query = process.argv[2] ?? '';
const out = process.argv[3] ?? 'shots/lab.png';
const width = Number(process.argv[4] ?? 1400);
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port ?? 5199;
const url = `http://localhost:${server.httpServer.address().port}/lab.html?${query}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text());
});
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
const times = await page.textContent('#times');
console.log(times);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
await server.close();
void port;
