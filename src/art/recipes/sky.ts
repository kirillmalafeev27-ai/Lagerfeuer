// Небо (7.5.3): ночная синева штрихами, звёзды — точки пастели, луна — бледно-лимонный круг
// с растёртым ореолом; рассвет — слоями от фиолетового к розовому и персиковому.

import { look } from '../../config/look.ts';
import { mix, palette } from '../../config/palette.ts';
import { K } from '../manifest.ts';
import {
  type Pt,
  PastelLayer,
  blob,
  chalkLine,
  crumbs,
  makePen,
  pastelFill,
  smudge,
  strip,
} from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, ellipsePts, tex } from './common.ts';

/** Ширина полосы неба, клеток (с запасом на широкие экраны). */
export const SKY_W = 12;

function skyBand(
  rc: RC,
  colors: readonly string[],
  seed: number,
  stars: boolean,
): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil(C * SKY_W);
  const H = Math.ceil(C * look.sky.max);
  const [c, x] = canvasFor(W, H);
  const pen = makePen(seed, 0, 0);
  // Горизонтальные слои штрихов: сверху вниз по списку цветов.
  const L = new PastelLayer(x, W, H);
  const bands = colors.length;
  for (let b = 0; b < bands; b++) {
    const y0 = (b / bands) * H - C * 0.06;
    const y1 = ((b + 1) / bands) * H + C * 0.08;
    L.ctx.globalAlpha = 0.85;
    L.ctx.fillStyle = colors[b];
    L.ctx.fillRect(0, Math.max(0, y0 + C * 0.06), W, y1 - y0 - C * 0.1);
    L.ctx.globalAlpha = 1;
    for (let y = y0; y < y1; y += C * 0.065) {
      let x0 = -C * 0.2 - pen.rng() * C * 0.3;
      while (x0 < W) {
        const len = C * (0.6 + pen.rng() * 1.2);
        const tone = pen.rng() < 0.25 && b + 1 < bands ? colors[b + 1] : colors[b];
        strip(
          L.ctx,
          pen,
          x0,
          y + (pen.rng() - 0.5) * 3,
          x0 + len,
          y + (pen.rng() - 0.5) * 5,
          C * 0.1,
          tone,
          0.75 + pen.rng() * 0.2,
        );
        x0 += len * (0.85 + pen.rng() * 0.2);
      }
    }
  }
  L.end(pen.rng, 0.03);
  if (stars) {
    for (let i = 0; i < 70; i++) {
      const sx = pen.rng() * W;
      const sy = pen.rng() * H * 0.7;
      crumbs(
        x,
        pen,
        { x: sx, y: sy, w: 1, h: 1 },
        palette.sky.star,
        1,
        C * (0.008 + pen.rng() * 0.012),
      );
    }
  }
  return c;
}

/** Силуэты елей по нижнему краю неба: тёмная бумага и меловые верхушки. */
function horizon(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil(C * SKY_W);
  const H = Math.ceil(C * (look.sky.horizonTrees + 0.2));
  const [c, x] = canvasFor(W, H);
  const pen = makePen(rc.seed * 139, 0, 0);
  const pts: Pt[] = [{ x: 0, y: H }];
  let px = 0;
  while (px < W) {
    const h = C * (0.18 + pen.rng() * (look.sky.horizonTrees - 0.12));
    const w = C * (0.16 + pen.rng() * 0.18);
    pts.push({ x: px, y: H - C * 0.08 - pen.rng() * C * 0.05 });
    pts.push({ x: px + w / 2, y: H - h });
    px += w;
  }
  pts.push({ x: W, y: H - C * 0.08 }, { x: W, y: H });
  pastelFill(x, pen, pts, palette.paper, -0.3, 1.3, {
    stroke: C * 0.06,
    under: 0.95,
    tones: [palette.paper, mix(palette.paper, palette.forest.fir, 0.35)],
  });
  const tops = pts.filter((p, i) => i % 2 === 0 && p.y < H - C * 0.12);
  for (const t of tops) {
    chalkLine(
      x,
      pen,
      [{ x: t.x - C * 0.04, y: t.y + C * 0.06 }, t, { x: t.x + C * 0.04, y: t.y + C * 0.06 }],
      Math.max(1, C * 0.008),
      palette.chalk,
      false,
      0.35,
    );
  }
  return c;
}

function moon(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const s = Math.ceil(C * 0.95);
  const [c, x] = canvasFor(s, s);
  const pen = makePen(rc.seed * 149, 0, 0);
  smudge(x, pen, s / 2, s / 2, s * 0.48, palette.sky.moon, 0.35);
  const disc = blob(pen.rng, C * 0.36, C * 0.36, {
    cx: s / 2,
    cy: s / 2,
    irregularity: 0.03,
    points: 14,
  });
  pastelFill(x, pen, disc, palette.sky.moon, -0.7, 1.4, {
    stroke: C * 0.04,
    under: 0.9,
    tones: [palette.sky.moon, mix(palette.sky.moon, palette.chalk, 0.4)],
  });
  for (let i = 0; i < 3; i++) {
    const cr = ellipsePts(
      s / 2 + (pen.rng() - 0.5) * C * 0.18,
      s / 2 + (pen.rng() - 0.5) * C * 0.18,
      C * 0.035,
      C * 0.03,
      8,
    );
    pastelFill(x, pen, cr, mix(palette.sky.moon, palette.stone.light, 0.6), 0, 1, {
      stroke: C * 0.02,
      under: 0.7,
    });
  }
  chalkLine(x, pen, disc, Math.max(1, C * 0.01), palette.chalk, true, 0.7);
  return c;
}

function sun(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const s = Math.ceil(C * 1.4);
  const [c, x] = canvasFor(s, s);
  const pen = makePen(rc.seed * 151, 0, 0);
  smudge(x, pen, s / 2, s / 2, s * 0.49, palette.dawn.sun, 0.6);
  const disc = blob(pen.rng, C * 0.5, C * 0.5, {
    cx: s / 2,
    cy: s / 2,
    irregularity: 0.03,
    points: 14,
  });
  pastelFill(x, pen, disc, palette.dawn.sun, -0.7, 1.4, {
    stroke: C * 0.05,
    under: 0.95,
    tones: [palette.dawn.sun, palette.dawn.peach],
  });
  return c;
}

function starTex(rc: RC, i: number): HTMLCanvasElement {
  const C = rc.C;
  const s = Math.ceil(C * (0.08 + i * 0.03));
  const [c, x] = canvasFor(s, s);
  const pen = makePen(rc.seed * 157 + i, 0, 0);
  smudge(x, pen, s / 2, s / 2, s * 0.45, palette.sky.star, 0.5);
  crumbs(x, pen, { x: s / 2 - 1, y: s / 2 - 1, w: 2, h: 2 }, palette.sky.star, 2, s * 0.15);
  return c;
}

function bird(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const [c, x] = canvasFor(C * 0.2, C * 0.12);
  const pen = makePen(rc.seed * 163, 0, 0);
  chalkLine(
    x,
    pen,
    [
      { x: C * 0.02, y: C * 0.05 },
      { x: C * 0.1, y: C * 0.08 },
      { x: C * 0.18, y: C * 0.03 },
    ],
    Math.max(1, C * 0.012),
    palette.cardInk,
    false,
    0.9,
  );
  return c;
}

export function drawSky(rc: RC): Tex[] {
  const s = palette.sky;
  const d = palette.dawn;
  return [
    tex(
      K.skyNight,
      skyBand(rc, [s.night, mix(s.night, s.high, 0.5), s.high], rc.seed * 167, true),
      0.5,
      0,
      0.025,
    ),
    tex(K.skyDawn, skyBand(rc, [d.violet, d.pink, d.peach], rc.seed * 173, false), 0.5, 0, 0.025),
    tex(K.skyHorizon, horizon(rc), 0.5, 1),
    tex(K.moon, moon(rc)),
    tex(K.sun, sun(rc)),
    tex(K.starDot(0), starTex(rc, 0)),
    tex(K.starDot(1), starTex(rc, 1)),
    tex(K.starDot(2), starTex(rc, 2)),
    tex(K.bird, bird(rc)),
  ];
}
