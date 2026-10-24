// Волки (7.5.11): в темноте — только глаза; на углях у края света стоит силуэт волка —
// серо-синяя шерсть с процарапанными штрихами и красный контровой свет от углей.

import { look } from '../../config/look.ts';
import { mix, palette } from '../../config/palette.ts';
import { K, boil } from '../manifest.ts';
import {
  type Pen,
  type Pt,
  blob,
  boilVariants,
  chalkLine,
  crumbs,
  makePen,
  pastelFill,
  pastelStroke,
  scratches,
  sgraffito,
  smudge,
} from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, cubicPts, tex } from './common.ts';

const w = palette.wolf;

/** Волк в профиль мордой вправо. pose: стоит, бежит (два кадра), сидит и оглядывается. */
function drawWolf(pen: Pen, C: number, pose: 'stand' | 'run0' | 'run1' | 'sit'): HTMLCanvasElement {
  const W = Math.ceil(C * look.wolf.w * 1.25);
  const H = Math.ceil(C * look.wolf.h * 1.15);
  const [c, x] = canvasFor(W, H);
  const ground = H - C * 0.05;
  const s = C * look.wolf.h;
  const bx = W * 0.47;
  const sit = pose === 'sit';
  const by = ground - s * (sit ? 0.5 : 0.52);
  smudge(x, pen, bx, ground - 2, W * 0.36, palette.paper, 0.7, 0.25);
  // Ноги.
  const legW = s * 0.11;
  const legs: Array<[Pt, Pt]> =
    pose === 'stand'
      ? [
          [
            { x: bx - s * 0.36, y: by + s * 0.05 },
            { x: bx - s * 0.42, y: ground },
          ],
          [
            { x: bx - s * 0.22, y: by + s * 0.08 },
            { x: bx - s * 0.2, y: ground },
          ],
          [
            { x: bx + s * 0.28, y: by + s * 0.08 },
            { x: bx + s * 0.26, y: ground },
          ],
          [
            { x: bx + s * 0.4, y: by + s * 0.06 },
            { x: bx + s * 0.46, y: ground },
          ],
        ]
      : pose === 'run0'
        ? [
            [
              { x: bx - s * 0.36, y: by + s * 0.05 },
              { x: bx - s * 0.7, y: ground - s * 0.12 },
            ],
            [
              { x: bx - s * 0.22, y: by + s * 0.08 },
              { x: bx - s * 0.5, y: ground - s * 0.05 },
            ],
            [
              { x: bx + s * 0.28, y: by + s * 0.08 },
              { x: bx + s * 0.62, y: ground - s * 0.1 },
            ],
            [
              { x: bx + s * 0.4, y: by + s * 0.06 },
              { x: bx + s * 0.75, y: ground - s * 0.18 },
            ],
          ]
        : pose === 'run1'
          ? [
              [
                { x: bx - s * 0.36, y: by + s * 0.05 },
                { x: bx - s * 0.12, y: ground - s * 0.06 },
              ],
              [
                { x: bx - s * 0.22, y: by + s * 0.08 },
                { x: bx - s * 0.02, y: ground },
              ],
              [
                { x: bx + s * 0.28, y: by + s * 0.08 },
                { x: bx + s * 0.08, y: ground - s * 0.04 },
              ],
              [
                { x: bx + s * 0.4, y: by + s * 0.06 },
                { x: bx + s * 0.2, y: ground },
              ],
            ]
          : [
              [
                { x: bx - s * 0.3, y: by + s * 0.1 },
                { x: bx - s * 0.48, y: ground },
              ],
              [
                { x: bx + s * 0.24, y: by + s * 0.05 },
                { x: bx + s * 0.28, y: ground },
              ],
              [
                { x: bx + s * 0.36, y: by + s * 0.04 },
                { x: bx + s * 0.42, y: ground },
              ],
            ];
  legs.forEach(([a, b], i) => {
    const back = i === 1 || i === 2;
    pastelStroke(
      x,
      pen,
      [a, { x: (a.x + b.x) / 2 + s * 0.02, y: (a.y + b.y) / 2 }, b],
      legW,
      back ? w.furDark : w.fur,
      1,
      { taper: 0.25 },
    );
  });
  // Хвост — пушистый, низко.
  const tail = cubicPts(
    { x: bx - s * 0.48, y: by - s * 0.06 },
    { x: bx - s * 0.7, y: by + s * 0.0 },
    { x: bx - s * 0.82, y: by + s * 0.2 },
    { x: bx - s * (sit ? 0.6 : 0.9), y: by + s * (sit ? 0.45 : 0.32) },
    8,
  );
  pastelStroke(x, pen, tail, s * 0.17, w.fur, 1, { taper: 0.6 });
  // Туловище.
  const body = sit
    ? blob(pen.rng, s * 0.95, s * 0.7, {
        cx: bx - s * 0.02,
        cy: by - s * 0.06,
        irregularity: 0.07,
        points: 12,
        rot: -0.5,
      })
    : blob(pen.rng, s * 1.15, s * 0.5, {
        cx: bx,
        cy: by - s * 0.05,
        irregularity: 0.06,
        points: 12,
      });
  pastelFill(x, pen, body, w.fur, -0.3, 1.35, {
    stroke: s * 0.07,
    under: 0.85,
    tones: [w.fur, w.furDark, w.fur],
  });
  const belly = blob(pen.rng, s * 0.8, s * 0.2, { cx: bx, cy: by + s * 0.1, irregularity: 0.1 });
  pastelFill(x, pen, belly, w.furDark, -0.2, 1, { stroke: s * 0.05, under: 0.5 });
  // Голова и морда.
  const look2 = sit ? -1 : 1;
  const hx = bx + s * 0.55 * (sit ? 0.55 : 1);
  const hy = by - s * (sit ? 0.48 : 0.26);
  const head = blob(pen.rng, s * 0.42, s * 0.36, { cx: hx, cy: hy, irregularity: 0.06 });
  pastelFill(x, pen, head, w.fur, -0.4, 1.35, { stroke: s * 0.06, under: 0.85 });
  const snout: Pt[] = [
    { x: hx + look2 * s * 0.1, y: hy - s * 0.06 },
    { x: hx + look2 * s * 0.38, y: hy + s * 0.02 },
    { x: hx + look2 * s * 0.36, y: hy + s * 0.1 },
    { x: hx + look2 * s * 0.08, y: hy + s * 0.12 },
  ];
  pastelFill(x, pen, snout, w.fur, 0, 1.3, {
    stroke: s * 0.05,
    under: 0.85,
    tones: [w.fur, mix(w.fur, palette.chalk, 0.15)],
  });
  pastelFill(
    x,
    pen,
    blob(pen.rng, s * 0.07, s * 0.06, { cx: hx + look2 * s * 0.37, cy: hy + s * 0.03 }),
    palette.cardInk,
    0,
    1.4,
    { stroke: 2, under: 1 },
  );
  // Уши.
  for (const k of [-0.08, 0.06]) {
    const ear: Pt[] = [
      { x: hx + k * s - s * 0.05, y: hy - s * 0.12 },
      { x: hx + k * s + s * 0.0, y: hy - s * 0.34 },
      { x: hx + k * s + s * 0.07, y: hy - s * 0.1 },
    ];
    pastelFill(x, pen, ear, k < 0 ? w.furDark : w.fur, -1.4, 1.3, {
      stroke: s * 0.04,
      under: 0.85,
    });
  }
  // Шерсть процарапана.
  sgraffito(x, pen, scratches(pen, body, 26, s * 0.12, Math.PI * 0.9, 0.5), Math.max(1, C * 0.009));
  sgraffito(x, pen, scratches(pen, head, 6, s * 0.07, Math.PI, 0.5), Math.max(1, C * 0.008));
  // Глаз — кислотно-салатовый.
  pastelFill(
    x,
    pen,
    blob(pen.rng, s * 0.08, s * 0.05, { cx: hx + look2 * s * 0.1, cy: hy - s * 0.04 }),
    w.eyes,
    0,
    1.4,
    { stroke: 2, under: 1 },
  );
  // Контровой свет от углей — по переднему краю.
  const rim = body
    .filter((p) => p.x > bx + s * 0.1 && p.y < by + s * 0.05)
    .sort((a, b) => a.y - b.y);
  if (!sit && rim.length > 2)
    pastelStroke(x, pen, rim, Math.max(2, s * 0.05), w.rim, 0.9, { taper: 0.5 });
  const headRim = head.filter((p) => (p.x - hx) * look2 > 0).sort((a, b) => a.y - b.y);
  if (headRim.length > 2)
    pastelStroke(x, pen, headRim, Math.max(1.6, s * 0.035), w.rim, 0.8, { taper: 0.5 });
  chalkLine(
    x,
    pen,
    body.filter((p) => p.y < by - s * 0.15).sort((a, b) => a.x - b.x),
    Math.max(1, C * 0.009),
    palette.chalk,
    false,
    0.45,
  );
  return c;
}

function eyesTex(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil(C * look.eyes.w * 1.5);
  const H = Math.ceil(C * look.eyes.h * 2.6);
  const [c, x] = canvasFor(W, H);
  const pen = makePen(rc.seed * 97 + 1, 0, 0);
  const ew = C * 0.1;
  const eh = C * 0.055;
  for (const k of [-1, 1]) {
    const cx = W / 2 + k * C * 0.1;
    const cy = H / 2;
    smudge(x, pen, cx, cy, ew * 0.9, w.eyes, 0.45, 0.7);
    const eye: Pt[] = [
      { x: cx - ew / 2, y: cy + eh * 0.1 },
      { x: cx - ew * 0.15, y: cy - eh / 2 },
      { x: cx + ew / 2, y: cy - eh * 0.15 },
      { x: cx + ew * 0.15, y: cy + eh / 2 },
    ];
    pastelFill(x, pen, eye, w.eyes, k * 0.3, 1.4, {
      stroke: Math.max(2, C * 0.02),
      under: 1,
      tones: [w.eyes, mix(w.eyes, palette.chalk, 0.4)],
    });
    pastelStroke(
      x,
      pen,
      [
        { x: cx + k * 1, y: cy - eh * 0.4 },
        { x: cx, y: cy + eh * 0.4 },
      ],
      Math.max(1.6, C * 0.014),
      palette.paper,
      1,
      { taper: 0.4 },
    );
    crumbs(
      x,
      pen,
      { x: cx - ew * 0.25, y: cy - eh * 0.25, w: 1, h: 1 },
      palette.chalk,
      1,
      Math.max(1, C * 0.008),
    );
  }
  return c;
}

function eyeGlowTex(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const s = Math.ceil(C * 0.6);
  const [c, x] = canvasFor(s, s);
  smudge(x, makePen(rc.seed * 101, 0, 0), s / 2, s / 2, s * 0.45, w.eyes, 0.5, 0.55);
  return c;
}

export function drawWolves(rc: RC): Tex[] {
  const out: Tex[] = [];
  const C = rc.C;
  const groundOy = (cv: HTMLCanvasElement) => 1 - (C * 0.05) / cv.height;
  const poses: Array<[string, 'stand' | 'run0' | 'run1' | 'sit', number]> = [
    [K.wolfStand, 'stand', 1],
    [K.wolfRun(0), 'run0', 2],
    [K.wolfRun(1), 'run1', 2],
    [K.wolfSit, 'sit', 3],
  ];
  for (const [key, pose, seedK] of poses) {
    boilVariants((pen) => drawWolf(pen, C, pose), rc.seed * 103 + seedK, 3, C * 0.008).forEach(
      (cv, v) => out.push(tex(boil(key, v), cv, 0.47, groundOy(cv))),
    );
  }
  out.push(tex(K.eyes, eyesTex(rc)));
  out.push(tex(K.eyeGlow, eyeGlowTex(rc)));
  return out;
}
