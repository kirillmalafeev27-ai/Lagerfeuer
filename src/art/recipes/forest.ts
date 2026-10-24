// Лес (7.5.2) и укрытия (7.5.7): ели, папоротник, кусты; валун или поваленный ствол
// за укрытым костром; просвет со штрихами ветра за открытым.

import { mix, palette } from '../../config/palette.ts';
import { K } from '../manifest.ts';
import {
  type Pen,
  type Pt,
  blob,
  chalkLine,
  makePen,
  pastelFill,
  pastelStroke,
  scratches,
  sgraffito,
  smudge,
} from '../../shared/pastelKit.ts';
import { fernFrond, grassTuft, stone } from './ground.ts';
import { type RC, type Tex, canvasFor, ellipsePts, roundRectPts, tex } from './common.ts';

const f = palette.forest;

/** Ель: ствол и ярусы свисающих лап, хвоя процарапана, меловой край со стороны света. */
function fir(pen: Pen, C: number, hCells: number, wCells: number): HTMLCanvasElement {
  const W = Math.ceil(C * wCells + C * 0.2);
  const H = Math.ceil(C * hCells + C * 0.15);
  const [c, x] = canvasFor(W, H);
  const cx = W / 2;
  const ground = H - C * 0.08;
  smudge(x, pen, cx, ground, W * 0.35, palette.paper, 0.7, 0.3);
  pastelStroke(x, pen, [{ x: cx, y: ground }, { x: cx + 1, y: ground - C * 0.5 }], C * 0.12, f.trunk, 1, { taper: 0.05 });
  const tiers = 4 + Math.floor(pen.rng() * 2);
  const top = C * 0.1;
  const span = ground - C * 0.28 - top;
  for (let i = tiers - 1; i >= 0; i--) {
    const t = i / (tiers - 1);
    const y = top + t * span;
    const half = (W / 2 - C * 0.1) * (0.25 + t * 0.75) * (0.92 + pen.rng() * 0.12);
    const drop = C * (0.14 + t * 0.12);
    const tier: Pt[] = [
      { x: cx + (pen.rng() - 0.5) * 3, y: y - C * 0.2 - (1 - t) * C * 0.08 },
      { x: cx + half * 0.55, y: y + drop * 0.35 },
      { x: cx + half, y: y + drop },
      { x: cx + half * 0.6, y: y + drop * 0.85 },
      { x: cx + half * 0.2, y: y + drop * 1.0 },
      { x: cx - half * 0.2, y: y + drop * 1.0 },
      { x: cx - half * 0.6, y: y + drop * 0.85 },
      { x: cx - half, y: y + drop },
      { x: cx - half * 0.55, y: y + drop * 0.35 },
    ];
    pastelFill(x, pen, tier, f.fir, -0.5, 1.15, { stroke: C * 0.05, under: 0.7, tones: [f.fir, f.fir, mix(f.fir, palette.paper, 0.3)] });
    const lit: Pt[] = [tier[0], tier[8], tier[7], tier[6], { x: cx - half * 0.1, y: y + drop * 0.5 }];
    pastelFill(x, pen, lit, f.firLight, -0.9, 0.9, { stroke: C * 0.045, under: 0.25, cross: 0.2, pressure: 0.85 });
    sgraffito(x, pen, scratches(pen, tier, 6 + Math.round(t * 8), C * 0.08, 0.6, 0.6), Math.max(1, C * 0.008));
    chalkLine(x, pen, [tier[0], tier[8], tier[7]], Math.max(1, C * 0.01), palette.chalk, false, 0.5);
  }
  return c;
}

function fernClump(pen: Pen, C: number): HTMLCanvasElement {
  const W = Math.ceil(C * 0.8);
  const H = Math.ceil(C * 0.5);
  const [c, x] = canvasFor(W, H);
  const k = 5 + Math.floor(pen.rng() * 3);
  for (let j = 0; j < k; j++) {
    fernFrond(x, pen, W / 2 + (pen.rng() - 0.5) * C * 0.08, H - C * 0.04, C * (0.28 + pen.rng() * 0.12), -Math.PI / 2 + (j / (k - 1) - 0.5) * 2.3, j % 2 ? f.fern : mix(f.fern, f.firLight, 0.5), f.firLight);
  }
  return c;
}

function bush(pen: Pen, C: number): HTMLCanvasElement {
  const W = Math.ceil(C * 0.9);
  const H = Math.ceil(C * 0.6);
  const [c, x] = canvasFor(W, H);
  smudge(x, pen, W / 2, H - C * 0.06, W * 0.4, palette.paper, 0.6, 0.3);
  for (let i = 0; i < 5; i++) {
    const b = blob(pen.rng, C * (0.3 + pen.rng() * 0.15), C * (0.24 + pen.rng() * 0.1), {
      cx: W / 2 + (pen.rng() - 0.5) * W * 0.45,
      cy: H - C * 0.2 - pen.rng() * C * 0.15,
      irregularity: 0.2,
    });
    pastelFill(x, pen, b, i % 2 ? f.fern : f.fir, -0.6, 1.1, { stroke: C * 0.045, under: 0.6, tones: [f.fern, f.fir, f.firLight] });
    sgraffito(x, pen, scratches(pen, b, 6, C * 0.06, 0.8, 1.5), Math.max(1, C * 0.008));
  }
  grassTuft(x, pen, W * 0.3, H - C * 0.04, C * 0.16, [f.fern, f.firLight]);
  return c;
}

function boulder(pen: Pen, C: number, big: boolean): HTMLCanvasElement {
  const W = Math.ceil(C * (big ? 1.25 : 1.0));
  const H = Math.ceil(C * (big ? 0.85 : 0.65));
  const [c, x] = canvasFor(W, H);
  smudge(x, pen, W / 2, H - C * 0.08, W * 0.45, palette.paper, 0.75, 0.25);
  stone(x, pen, W / 2, H * 0.55, W * 0.86, H * 0.82);
  // Мох сверху.
  const moss = blob(pen.rng, W * 0.5, H * 0.22, { cx: W * 0.45, cy: H * 0.24, irregularity: 0.3 });
  pastelFill(x, pen, moss, f.fern, -0.4, 1, { stroke: C * 0.04, under: 0.4, tones: [f.fern, f.firLight] });
  grassTuft(x, pen, W * 0.2, H - C * 0.06, C * 0.14, [f.fern, f.firLight]);
  grassTuft(x, pen, W * 0.8, H - C * 0.06, C * 0.12, [f.fern, f.firLight]);
  return c;
}

function fallenLog(pen: Pen, C: number): HTMLCanvasElement {
  const W = Math.ceil(C * 1.5);
  const H = Math.ceil(C * 0.55);
  const [c, x] = canvasFor(W, H);
  smudge(x, pen, W / 2, H - C * 0.08, W * 0.46, palette.paper, 0.75, 0.2);
  const body = roundRectPts(pen, C * 0.1, H * 0.3, W - C * 0.25, H * 0.48, H * 0.2);
  pastelFill(x, pen, body, f.trunk, -0.1, 1.25, { stroke: C * 0.06, under: 0.8, tones: [f.trunk, mix(f.trunk, palette.paper, 0.3)] });
  sgraffito(x, pen, scratches(pen, body, 10, C * 0.35, 0, 0.08), Math.max(1, C * 0.01));
  const end = ellipsePts(W - C * 0.17, H * 0.54, C * 0.09, H * 0.23, 12);
  pastelFill(x, pen, end, mix(f.trunk, palette.chalk, 0.3), 0.4, 1.2, { stroke: C * 0.03, under: 0.85 });
  const moss = blob(pen.rng, W * 0.4, H * 0.2, { cx: W * 0.4, cy: H * 0.32, irregularity: 0.35 });
  pastelFill(x, pen, moss, f.fern, -0.4, 1, { stroke: C * 0.04, under: 0.4, tones: [f.fern, f.firLight] });
  chalkLine(x, pen, body.filter((p) => p.y < H * 0.4).sort((a, b) => a.x - b.x), Math.max(1, C * 0.01), palette.chalk, false, 0.5);
  return c;
}

/** Штрихи ветра в просвете между деревьями. */
function windGap(pen: Pen, C: number): HTMLCanvasElement {
  const W = Math.ceil(C * 1.3);
  const H = Math.ceil(C * 0.9);
  const [c, x] = canvasFor(W, H);
  for (let i = 0; i < 6; i++) {
    const y = H * (0.18 + i * 0.13) + (pen.rng() - 0.5) * 6;
    const x0 = C * (0.05 + pen.rng() * 0.25);
    const x1 = W - C * (0.05 + pen.rng() * 0.3);
    const pts: Pt[] = [
      { x: x0, y },
      { x: (x0 + x1) / 2, y: y - C * 0.05 },
      { x: x1, y: y + (pen.rng() - 0.5) * 6 },
    ];
    if (i % 2 === 0) pts.push({ x: x1 + C * 0.06, y: y - C * 0.08 }, { x: x1, y: y - C * 0.12 });
    chalkLine(x, pen, pts, Math.max(1, C * 0.012), palette.wind, false, 0.55);
  }
  return c;
}

export function drawForest(rc: RC): Tex[] {
  const C = rc.C;
  const out: Tex[] = [];
  const shapes: Array<[number, number]> = [
    [2.1, 1.25],
    [1.75, 1.1],
    [2.4, 1.4],
    [1.5, 0.95],
  ];
  shapes.forEach(([h, w], i) => {
    const cv = fir(makePen(rc.seed * 107 + i, 0, 0), C, h, w);
    out.push(tex(K.tree(i), cv, 0.5, 1 - (C * 0.08) / cv.height));
  });
  for (let i = 0; i < 3; i++) {
    const cv = fernClump(makePen(rc.seed * 109 + i, 0, 0), C);
    out.push(tex(K.fern(i), cv, 0.5, 1 - (C * 0.04) / cv.height));
  }
  for (let i = 0; i < 2; i++) {
    const cv = bush(makePen(rc.seed * 113 + i, 0, 0), C);
    out.push(tex(K.bush(i), cv, 0.5, 1 - (C * 0.06) / cv.height));
  }
  for (let i = 0; i < 2; i++) {
    const cv = boulder(makePen(rc.seed * 127 + i, 0, 0), C, i === 0);
    out.push(tex(K.boulder(i), cv, 0.5, 1 - (C * 0.08) / cv.height));
  }
  {
    const cv = fallenLog(makePen(rc.seed * 131, 0, 0), C);
    out.push(tex(K.fallenLog, cv, 0.5, 1 - (C * 0.08) / cv.height));
  }
  out.push(tex(K.windGap, windGap(makePen(rc.seed * 137, 0, 0), C)));
  return out;
}
