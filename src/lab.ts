// Лаборатория арта (только для разработки): ?only=рецепт,рецепт  ?keys=префикс,префикс  ?scale=0.5  ?low=1
import '@fontsource/rubik/400.css';
import '@fontsource/rubik-scribble/400.css';
import { configureKit } from './shared/pastelKit.ts';
import { palette } from './config/palette.ts';
import { look } from './config/look.ts';
import { RECIPES, finalizeTex } from './art/ArtFactory.ts';
import type { RC } from './art/recipes/common.ts';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const only = q.get('only')?.split(',') ?? null;
  const keys = q.get('keys')?.split(',') ?? null;
  const scale = Number(q.get('scale') ?? 1);
  const low = q.get('low') === '1';
  const bg = q.get('bg');
  await Promise.all([document.fonts.load('64px "Rubik Scribble"'), document.fonts.load('20px Rubik')]);
  const C = low ? look.texCell.low : look.texCell.high;
  configureKit({ paper: palette.paper, res: C / look.cell });
  const rc: RC = { C, res: C / look.cell, seed: Number(q.get('seed') ?? 7) };
  const root = document.getElementById('lab')!;
  if (bg) document.body.style.background = bg;
  const times: string[] = [];
  for (const r of RECIPES) {
    if (only && !only.some((o) => r.name.startsWith(o))) continue;
    const t0 = performance.now();
    const out = r.run(rc);
    out.forEach((t, i) => finalizeTex(r.name, t, i, rc.seed));
    const dt = performance.now() - t0;
    times.push(`${r.name}: ${dt.toFixed(0)} ms (${out.length})`);
    for (const t of out) {
      if (keys && !keys.some((k) => t.key.startsWith(k))) continue;
      const fig = document.createElement('figure');
      const cv = t.canvas;
      cv.style.width = `${cv.width * scale}px`;
      cv.style.height = `${cv.height * scale}px`;
      fig.appendChild(cv);
      const cap = document.createElement('figcaption');
      cap.textContent = `${t.key} ${cv.width}×${cv.height}`;
      fig.appendChild(cap);
      root.appendChild(fig);
    }
  }
  const pre = document.createElement('pre');
  pre.id = 'times';
  pre.textContent = times.join('\n');
  document.body.prepend(pre);
  document.body.dataset.ready = '1';
}

void main();
