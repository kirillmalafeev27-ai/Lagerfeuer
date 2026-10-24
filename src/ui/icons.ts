// Нарисованные пастелью значки для DOM: шапка панели вопроса, плашка снаряжения, итоги.

import { mix, palette } from '../config/palette.ts';
import { drawLogShape } from '../art/recipes/firePit.ts';
import {
  blob,
  chalkLine,
  ctx2d,
  makeCanvas,
  makePen,
  pastelFill,
  pastelWord,
  smudge,
  type Pt,
} from '../shared/pastelKit.ts';

const cache = new Map<string, string>();

function memo(key: string, draw: () => HTMLCanvasElement): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = draw().toDataURL();
  cache.set(key, url);
  return url;
}

const S = 96;

/**
 * Нарисовать все значки заранее, пока идёт загрузка: toDataURL посреди ночи подвешивает
 * кадр (браузер ждёт видеокарту).
 */
export function warmIcons(words: readonly string[]): void {
  iconStep();
  iconReady();
  iconHands();
  for (const k of ['birch', 'oak'] as const) for (const n of [1, 2]) iconLog(k, n);
  for (let i = 0; i <= 20; i++) moonProgress(i / 20);
  iconStar(true);
  iconStar(false);
  for (const w of words) wordImage(w);
}

/** Шаг: два следа сапог. */
export function iconStep(): string {
  return memo('step', () => {
    const c = makeCanvas(S, S);
    const x = ctx2d(c);
    const pen = makePen(3, 0, 0);
    for (const [cx, cy, r] of [
      [34, 58, -0.3],
      [60, 36, -0.2],
    ] as const) {
      const sole = blob(pen.rng, 18, 32, { cx, cy, rot: r, irregularity: 0.08 });
      pastelFill(x, pen, sole, palette.chalk, -0.6, 1.3, { stroke: 5, under: 0.85 });
      const heel = blob(pen.rng, 14, 11, {
        cx: cx - Math.sin(r) * 22,
        cy: cy + Math.cos(r) * 22,
        irregularity: 0.1,
      });
      pastelFill(x, pen, heel, palette.chalk, -0.6, 1.3, { stroke: 5, under: 0.85 });
    }
    return c;
  });
}

export function iconLog(kind: 'birch' | 'oak', count = 1): string {
  return memo(`log:${kind}:${count}`, () => {
    const c = makeCanvas(S, S);
    const x = ctx2d(c);
    const pen = makePen(kind === 'birch' ? 5 : 6, 0, 0);
    if (count === 2) {
      drawLogShape(x, pen, S / 2 - 4, S / 2 - 12, 66, 20, kind, { chalk: true });
      drawLogShape(x, pen, S / 2 + 4, S / 2 + 12, 66, 20, kind, { chalk: true });
    } else drawLogShape(x, pen, S / 2, S / 2, 70, kind === 'oak' ? 30 : 22, kind, { chalk: true });
    return c;
  });
}

/** Готовность: поднятая варежка. */
export function iconReady(): string {
  return memo('ready', () => {
    const c = makeCanvas(S, S);
    const x = ctx2d(c);
    const pen = makePen(7, 0, 0);
    smudge(x, pen, S / 2, S / 2, 40, palette.caption, 0.35);
    const mitt = blob(pen.rng, 40, 50, { cx: S / 2, cy: S / 2 + 4, irregularity: 0.08 });
    pastelFill(x, pen, mitt, palette.hero.hat, -0.6, 1.3, { stroke: 6, under: 0.85 });
    const thumb = blob(pen.rng, 14, 22, {
      cx: S / 2 + 22,
      cy: S / 2 + 2,
      rot: 0.6,
      irregularity: 0.1,
    });
    pastelFill(x, pen, thumb, palette.hero.hat, -0.6, 1.3, { stroke: 5, under: 0.85 });
    chalkLine(x, pen, mitt, 2.4, palette.chalk, true, 0.9);
    return c;
  });
}

/** Пустые руки / «про запас». */
export function iconHands(): string {
  return memo('hands', () => {
    const c = makeCanvas(S, S);
    const x = ctx2d(c);
    const pen = makePen(9, 0, 0);
    for (const cx of [30, 66]) {
      const m = blob(pen.rng, 26, 32, { cx, cy: S / 2 + 6, irregularity: 0.08 });
      pastelFill(x, pen, m, palette.hero.hat, -0.6, 1.3, { stroke: 5, under: 0.85 });
      chalkLine(x, pen, m, 2, palette.chalk, true, 0.8);
    }
    return c;
  });
}

/** Полумесяц-прогресс ночи: луна постепенно превращается в солнце. */
export function moonProgress(share: number): string {
  const step = Math.round(share * 20) / 20;
  return memo(`moon:${step}`, () => {
    const c = makeCanvas(S, S);
    const x = ctx2d(c);
    const pen = makePen(11, 0, 0);
    const R = 34;
    const cx = S / 2;
    const cy = S / 2;
    const sun = step >= 1;
    const col = mix(palette.sky.moon, palette.dawn.sun, Math.max(0, (step - 0.6) / 0.4));
    smudge(x, pen, cx, cy, R + 10, col, sun ? 0.55 : 0.25);
    const disc: Pt[] = [];
    for (let i = 0; i < 24; i++)
      disc.push({
        x: cx + Math.cos((i / 24) * Math.PI * 2) * R,
        y: cy + Math.sin((i / 24) * Math.PI * 2) * R,
      });
    pastelFill(x, pen, disc, col, -0.6, 1.3, { stroke: 7, under: 0.9 });
    if (!sun) {
      // Тень наползает справа налево: от полумесяца к полной луне-солнцу.
      const off = R * 2 * (1 - step) * 0.9;
      x.save();
      x.globalCompositeOperation = 'destination-out';
      x.beginPath();
      x.arc(cx + off * 0.9 + 4, cy - 2, R * 0.98, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    chalkLine(x, pen, disc, 2, palette.chalk, true, 0.5);
    return c;
  });
}

/** Слово-звук для DOM («HOPPLA!» в углу панели). */
export function wordImage(text: string): string {
  return memo(`word:${text}`, () =>
    pastelWord(text, { fill: palette.caption, shade: palette.chalk, chalk: palette.chalk }, 56),
  );
}

/** Звезда для итогов. */
export function iconStar(on: boolean): string {
  return memo(`star:${on}`, () => {
    const c = makeCanvas(S, S);
    const x = ctx2d(c);
    const pen = makePen(13, 0, 0);
    const pts: Pt[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 17 : 40;
      pts.push({ x: S / 2 + Math.cos(a) * r, y: S / 2 + 4 + Math.sin(a) * r });
    }
    if (on) {
      smudge(x, pen, S / 2, S / 2, 44, palette.caption, 0.35);
      pastelFill(x, pen, pts, palette.caption, -0.6, 1.3, { stroke: 6, under: 0.9 });
    }
    chalkLine(x, pen, pts, on ? 2.6 : 2, palette.chalk, true, on ? 0.9 : 0.45);
    return c;
  });
}
