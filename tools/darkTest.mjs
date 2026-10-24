// Тест темноты (раздел 8.6): сцена ?scene=dark&fires=embers|low|full|mixed фотографируется,
// контрасты считаются по формуле WCAG, усредняя пиксели в центре каждой области.
// node tools/darkTest.mjs [--size 1280x720] [--out shots/dark]
// Требования:
//   1. клетка поляны к чёрной бумаге — не меньше 2:1 даже при всех кострах на углях;
//   2. глаза к окружению — не меньше 7:1;
//   3. шкала к своей подложке — не меньше 4.5:1;
//   4. освещённая земля у полного костра к лесу за погасшим — не меньше 5:1.
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const sizes = arg('--size', '1280x720,390x844')
  .split(',')
  .map((s) => s.split('x').map(Number));
const out = arg('--out', 'shots/dark');
const qualities = arg('--quality', 'high,low').split(',');

const server = await createServer({ server: { port: 5193, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/** Замер внутри страницы: снимок канвы и средние яркости областей. */
async function measure(page) {
  return page.evaluate(async () => {
    const b = window.__bonfires;
    const sc = b.scene();
    const game = b.game();
    const WV = await import('/src/render/WorldView.ts');
    const HV = await import('/src/render/HeroView.ts');
    const LK = await import('/src/config/look.ts');
    const PAL = await import('/src/config/palette.ts');
    const CELL = LK.look.cell;
    const img = await new Promise((r) => game.renderer.snapshot((im) => r(im)));
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const data = x.getImageData(0, 0, cv.width, cv.height).data;
    const k = cv.width / sc.cameras.main.width; // снимок — в пикселях канвы
    const lin = (v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const L = (r, g, bl) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
    const toPx = (wx, wy) => {
      const p = sc.worldToCss(wx, wy);
      return { x: p.x * sc.host.dpr * k, y: p.y * sc.host.dpr * k };
    };
    const cellPx = (CELL * sc.cameras.main.zoom * k) / 1;
    /** Яркости пикселей в кольце r0…r (доли клетки) вокруг точки мира; r0 = 0 — круг. */
    const sample = (wx, wy, r, r0 = 0) => {
      const c = toPx(wx, wy);
      const R = Math.max(1, r * cellPx);
      const R0 = r0 * cellPx;
      const vals = [];
      for (let yy = Math.floor(c.y - R); yy <= c.y + R; yy++) {
        for (let xx = Math.floor(c.x - R); xx <= c.x + R; xx++) {
          if (xx < 0 || yy < 0 || xx >= cv.width || yy >= cv.height) continue;
          const d2 = (xx - c.x) ** 2 + (yy - c.y) ** 2;
          if (d2 > R * R || d2 < R0 * R0) continue;
          const i = (yy * cv.width + xx) * 4;
          vals.push(L(data[i], data[i + 1], data[i + 2]));
        }
      }
      return vals;
    };
    const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const pct = (a, q) => {
      const s = [...a].sort((p, q2) => p - q2);
      return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] ?? 0;
    };
    const [pr, pg, pb] = PAL.rgb(PAL.palette.paper);
    const paper = L(pr, pg, pb);
    // Клетка — медиана круга чуть ниже середины: там нет героя и мелочей.
    const cells = [0, 1, 2, 3].map((c) => {
      const p = HV.cellCenter(c);
      return pct(sample(p.x, p.y + 0.22 * CELL, 0.13), 0.5);
    });
    // Глаза: тело каждого глаза (без зрачка) против леса сразу за ореолом.
    const eyes = [];
    for (const f of sc.fires) {
      for (const e of f.eyePositions()) {
        if (e.a < 0.9 || !e.open) continue;
        const body = [-1, 1].flatMap((k) => sample(e.x + k * 0.1 * CELL, e.y, 0.045));
        const ring = sample(e.x, e.y, 0.45, 0.3);
        if (!body.length || !ring.length) continue; // пара за краем снимка
        eyes.push({ eye: pct(body, 0.75), around: pct(ring, 0.5), at: toPx(e.x, e.y) });
      }
    }
    const gauges = [0, 1, 2, 3].map((side) => {
      const p = WV.pitWorld(side);
      const a = sample(p.x, p.y + LK.look.gaugeBelow * CELL, 0.4);
      return { icon: pct(a, 0.92), plate: pct(a, 0.1) };
    });
    // Освещённая земля у полного костра (С) и лес за погасшим.
    const pN = WV.pitWorld(0);
    const lit = mean(sample(pN.x + 0.55 * CELL, pN.y + 0.15 * CELL, 0.1));
    // Лес за восточным костром на углях: у правого края видимой области.
    const pE = WV.pitWorld(1);
    const view = sc.cameras.main.worldView;
    const forest = mean(
      sample(Math.min(pE.x + 1.2 * CELL, view.right - 0.18 * CELL), pE.y - 0.2 * CELL, 0.12),
    );
    const eyeRaw = sc.fires.map((f) => f.eyePositions().map((e) => +e.a.toFixed(2)));
    return { paper, cells, eyes, gauges, lit, forest, eyeRaw };
  });
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

try {
  for (const [W, H] of sizes) {
    console.log(`\n${W}×${H}`);
    for (const quality of qualities)
      for (const fires of ['embers', 'full', 'mixed']) {
        const page = await browser.newPage({
          viewport: { width: W, height: H },
          deviceScaleFactor: 1,
        });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://localhost:${port}/?scene=dark&fires=${fires}&quality=${quality}`);
        if (fires === 'embers') console.log(`  качество: ${quality}`);
        await page.waitForSelector('.bf[data-dark-ready="1"]', { timeout: 120000 });
        // Ждём время сцены, а не стенные часы: на программной видеокарте кадров мало.
        await page.waitForFunction(() => window.__bonfires.scene().timeMs > 2500, null, {
          timeout: 180000,
          polling: 250,
        });
        const m = await measure(page);
        await page.screenshot({ path: `${out}-${fires}-${quality}-${W}x${H}.png` });
        if (fires === 'embers') {
          const worst = Math.min(...m.cells.map((c) => contrast(c, m.paper)));
          check(
            worst >= 2,
            `все на углях: клетка к чёрной бумаге ${worst.toFixed(2)}:1 (нужно ≥ 2; L клеток ${m.cells.map((c) => c.toFixed(3)).join(' ')})`,
          );
          const eyeC = m.eyes.map((e) => contrast(e.eye, e.around));
          check(
            eyeC.length > 0,
            `глаза видны (${eyeC.length} пар; альфы ${JSON.stringify(m.eyeRaw)})`,
          );
          if (eyeC.length) {
            const w = m.eyes[eyeC.indexOf(Math.min(...eyeC))];
            check(
              Math.min(...eyeC) >= 7,
              `глаза к окружению ${Math.min(...eyeC).toFixed(1)}:1 (нужно ≥ 7; L глаз ${w.eye.toFixed(3)}, вокруг ${w.around.toFixed(3)})`,
            );
          }
        }
        if (fires === 'full') {
          const g = Math.min(...m.gauges.map((q) => contrast(q.icon, q.plate)));
          check(g >= 4.5, `шкала к подложке ${g.toFixed(1)}:1 (нужно ≥ 4.5)`);
        }
        if (fires === 'mixed') {
          const c = contrast(m.lit, m.forest);
          check(
            c >= 5,
            `освещённая земля к лесу за погасшим костром ${c.toFixed(1)}:1 (нужно ≥ 5; L ${m.lit.toFixed(3)} / ${m.forest.toFixed(3)})`,
          );
        }
        check(
          errors.length === 0,
          `${fires}: нет ошибок страницы${errors.length ? ': ' + errors[0] : ''}`,
        );
        await page.close();
      }
  }
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.log(`\nТест темноты: ${failures.length} провал(ов)`);
  process.exit(1);
}
console.log('\nТест темноты: всё прошло');
