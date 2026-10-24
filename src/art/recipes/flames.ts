// Пламя (7.5.4): три слоя каракулевой пастели — красный снаружи, оранжевый, жёлтый в сердцевине.
// Пламя собирается из «языков»-капель со скруглённым низом и острым изогнутым кончиком;
// каждый язык кипит (3 варианта) и колышется своей фазой, высота языков следует за топливом.
// Ядро — аддитивное растёртое пятно (bloom) поверх языков.

import { look } from '../../config/look.ts';
import { mix, palette, rgba } from '../../config/palette.ts';
import { FLAME_LAYERS, FLAME_SHAPES, K, boil } from '../manifest.ts';
import {
  type Pen,
  type Pt,
  boilVariants,
  pastelFill,
  pastelStroke,
  smudge,
} from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, cubicPts, tex } from './common.ts';

/** Ширина и высота языка по слою (доли клетки) и форме. */
export function tongueSize(layer: number, shape: number): { w: number; h: number } {
  const h = [1.0, 0.76, 0.52][layer] * look.flame.h * 0.8;
  const w = [0.36, 0.29, 0.2][layer] * (shape === 0 ? 1 : 1.12);
  return { w, h };
}

/** Заливка, штрихи и светлая сердцевина каждого слоя. */
const LAYER_LOOK: ReadonlyArray<{
  base: string;
  tones: readonly string[];
  heart: string;
  lick: string;
}> = [
  {
    base: palette.fire.outer,
    tones: [palette.fire.outer, palette.fire.deep, palette.fire.outer, palette.fire.mid],
    heart: palette.fire.mid,
    lick: palette.fire.core,
  },
  {
    base: palette.fire.mid,
    tones: [palette.fire.mid, palette.fire.outer, palette.fire.mid, palette.fire.core],
    heart: palette.fire.core,
    lick: palette.fire.core,
  },
  {
    base: palette.fire.core,
    tones: [palette.fire.core, palette.fire.mid, palette.fire.core],
    heart: mix(palette.fire.core, palette.chalk, 0.6),
    lick: palette.chalk,
  },
];

/** Капля языка: скруглённый низ, бока выпуклые, кончик острый и изогнутый. */
function tonguePath(
  cx: number,
  base: number,
  w: number,
  h: number,
  lean: number,
  curl: number,
): Pt[] {
  const B = { x: cx, y: base };
  const L = { x: cx - w * 0.5, y: base - h * 0.2 };
  const T = { x: cx + lean, y: base - h };
  const R = { x: cx + w * 0.5, y: base - h * 0.17 };
  const a = cubicPts(
    B,
    { x: cx - w * 0.3, y: base },
    { x: cx - w * 0.52, y: base - h * 0.06 },
    L,
    6,
  );
  const b = cubicPts(
    L,
    { x: cx - w * 0.47, y: base - h * 0.44 },
    { x: T.x - w * 0.2 + curl, y: base - h * 0.72 },
    T,
    14,
  );
  const c = cubicPts(
    T,
    { x: T.x + w * 0.1 + curl * 0.6, y: base - h * 0.68 },
    { x: cx + w * 0.52, y: base - h * 0.46 },
    R,
    14,
  );
  const d = cubicPts(
    R,
    { x: cx + w * 0.53, y: base - h * 0.05 },
    { x: cx + w * 0.3, y: base },
    B,
    6,
  );
  return a.concat(b.slice(1), c.slice(1), d.slice(1, -1));
}

function drawTongue(pen: Pen, C: number, layer: number, shape: number): HTMLCanvasElement {
  const sz = tongueSize(layer, shape);
  const w = sz.w * C;
  const h = sz.h * C;
  const m = Math.ceil(w * 0.35) + 6;
  const [c, x] = canvasFor(w * 1.6 + m * 2, h + w * 0.3 + m * 2);
  const cx = c.width / 2;
  const base = c.height - m - w * 0.12;
  const lean = (shape === 0 ? 0.16 : -0.2) * w;
  const curl = (shape === 0 ? -0.12 : 0.16) * w;
  const lk = LAYER_LOOK[layer];
  // Мягкий отсвет вокруг языка: края светятся, а не режутся.
  smudge(
    x,
    pen,
    cx,
    base - h * 0.32,
    w * (layer === 0 ? 0.95 : 0.75),
    lk.base,
    layer === 0 ? 0.32 : 0.22,
    1.25,
  );
  const sw = Math.max(2.4, C * 0.042 * (layer === 2 ? 0.85 : 1));
  pastelFill(x, pen, tonguePath(cx, base, w, h, lean, curl), lk.base, -Math.PI / 2 + 0.1, 1.4, {
    stroke: sw,
    under: 0.82,
    cross: 0.22,
    tones: lk.tones,
    kind: 'scribble',
    len: 0.6,
    overshoot: sw * 0.4,
  });
  // Светлая сердцевина — капля поменьше, ниже и ближе к середине.
  pastelFill(
    x,
    pen,
    tonguePath(cx + lean * 0.1, base - h * 0.02, w * 0.52, h * 0.6, lean * 0.55, curl * 0.5),
    lk.heart,
    -Math.PI / 2 + 0.05,
    1.2,
    {
      stroke: sw * 0.85,
      under: 0.62,
      cross: 0.15,
      tones: [lk.heart, lk.base, lk.heart],
      kind: 'scribble',
      len: 0.55,
      pressure: 0.8,
      overshoot: sw * 0.3,
    },
  );
  // Росчерк вдоль языка к кончику.
  const lick = cubicPts(
    { x: cx, y: base - h * 0.1 },
    { x: cx - w * 0.12, y: base - h * 0.42 },
    { x: cx + lean * 0.8 + curl * 0.3, y: base - h * 0.7 },
    { x: cx + lean, y: base - h * 0.93 },
    10,
  );
  pastelStroke(x, pen, lick, sw * 0.6, lk.lick, 0.7, { kind: 'scribble', taper: 0.95 });
  return c;
}

/** Ядро пламени для аддитивного наложения: белёсо-жёлтое в середине, оранжевое к краю. */
function drawBloom(C: number): HTMLCanvasElement {
  const s = Math.ceil(C * 1.2);
  const [c, x] = canvasFor(s, s);
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, rgba(mix(palette.fire.core, palette.chalk, 0.4), 0.95));
  g.addColorStop(0.22, rgba(palette.fire.core, 0.7));
  g.addColorStop(0.5, rgba(palette.fire.mid, 0.3));
  g.addColorStop(0.78, rgba(palette.fire.outer, 0.08));
  g.addColorStop(1, rgba(palette.fire.outer, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return c;
}

export function drawFlames(rc: RC): Tex[] {
  const out: Tex[] = [];
  for (let layer = 0; layer < FLAME_LAYERS; layer++) {
    for (let shape = 0; shape < FLAME_SHAPES; shape++) {
      boilVariants(
        (pen) => drawTongue(pen, rc.C, layer, shape),
        rc.seed * 31 + layer * 101 + shape * 7,
        3,
        rc.C * 0.012,
      ).forEach((cv, v) => {
        const sz = tongueSize(layer, shape);
        const m = Math.ceil(sz.w * rc.C * 0.35) + 6;
        const baseY = cv.height - m - sz.w * rc.C * 0.12;
        out.push(tex(boil(K.tongue(layer, shape), v), cv, 0.5, baseY / cv.height, 0.015));
      });
    }
  }
  out.push(tex(K.bloom, drawBloom(rc.C), 0.5, 0.5, 0));
  return out;
}
