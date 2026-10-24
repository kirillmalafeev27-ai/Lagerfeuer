// Пламя (7.5.4): три слоя каракулевой пастели — красный снаружи, оранжевый, жёлтый в сердцевине.
// Пламя собирается из «языков» — каждый язык кипит (3 варианта) и колышется своей фазой;
// высота языков следует за топливом.

import { look } from '../../config/look.ts';
import { palette } from '../../config/palette.ts';
import { FLAME_LAYERS, FLAME_SHAPES, K, boil } from '../manifest.ts';
import { type Pen, type Pt, boilVariants, pastelFill, pastelStroke, smudge } from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, cubicPts, tex } from './common.ts';

/** Ширина и высота языка по слою (доли клетки) и форме. */
export function tongueSize(layer: number, shape: number): { w: number; h: number } {
  const h = [1.0, 0.72, 0.46][layer] * look.flame.h * 0.82;
  const w = [0.3, 0.24, 0.17][layer] * (shape === 0 ? 1 : 1.3);
  return { w, h };
}

const LAYER_TONES: ReadonlyArray<readonly string[]> = [
  [palette.fire.outer, palette.fire.deep, palette.fire.outer],
  [palette.fire.mid, palette.fire.outer, palette.fire.mid],
  [palette.fire.core, palette.fire.mid, palette.fire.core],
];

function tonguePath(cx: number, base: number, w: number, h: number, lean: number): Pt[] {
  const tip = { x: cx + lean, y: base - h };
  const left = cubicPts({ x: cx - w / 2, y: base }, { x: cx - w * 0.62, y: base - h * 0.3 }, { x: tip.x - w * 0.12, y: base - h * 0.66 }, tip, 12);
  const right = cubicPts(tip, { x: tip.x + w * 0.06, y: base - h * 0.62 }, { x: cx + w * 0.6, y: base - h * 0.28 }, { x: cx + w / 2, y: base }, 12);
  return left.concat(right.slice(1), [{ x: cx + w * 0.32, y: base + w * 0.16 }, { x: cx - w * 0.32, y: base + w * 0.16 }]);
}

function drawTongue(pen: Pen, C: number, layer: number, shape: number): HTMLCanvasElement {
  const sz = tongueSize(layer, shape);
  const w = sz.w * C;
  const h = sz.h * C;
  const [c, x] = canvasFor(w * 1.7, h + w * 0.5);
  const cx = c.width / 2;
  const base = c.height - w * 0.25;
  const lean = (shape === 0 ? 0.22 : -0.18) * w;
  const tones = LAYER_TONES[layer];
  if (layer === 0) smudge(x, pen, cx, base - h * 0.25, w * 0.75, palette.fire.outer, 0.35, 1.2);
  const path = tonguePath(cx, base, w, h, lean);
  const sw = Math.max(2.4, C * 0.045 * (layer === 2 ? 0.8 : 1));
  pastelFill(x, pen, path, tones[0], -Math.PI / 2 + 0.08, 1.35, { stroke: sw, under: 0.6, cross: 0.22, tones, kind: 'scribble', len: 0.7, overshoot: sw * 0.45 });
  const lick = cubicPts({ x: cx, y: base - h * 0.12 }, { x: cx - w * 0.14, y: base - h * 0.45 }, { x: cx + lean + w * 0.08, y: base - h * 0.7 }, { x: cx + lean, y: base - h * 0.95 }, 8);
  pastelStroke(x, pen, lick, sw * 0.75, layer === 2 ? palette.chalk : palette.fire.core, 0.85, { kind: 'scribble', taper: 0.9 });
  return c;
}

/** Росчерк-искорка над пламенем. */
function drawLick(pen: Pen, C: number): HTMLCanvasElement {
  const [c, x] = canvasFor(C * 0.16, C * 0.3);
  const pts = cubicPts({ x: c.width / 2, y: c.height - 3 }, { x: c.width * 0.2, y: c.height * 0.6 }, { x: c.width * 0.8, y: c.height * 0.35 }, { x: c.width / 2, y: 3 }, 8);
  pastelStroke(x, pen, pts, C * 0.035, palette.fire.mid, 1, { kind: 'scribble', taper: 0.9 });
  return c;
}

export function drawFlames(rc: RC): Tex[] {
  const out: Tex[] = [];
  for (let layer = 0; layer < FLAME_LAYERS; layer++) {
    for (let shape = 0; shape < FLAME_SHAPES; shape++) {
      boilVariants((pen) => drawTongue(pen, rc.C, layer, shape), rc.seed * 31 + layer * 101 + shape * 7, 3, rc.C * 0.012).forEach((cv, v) => {
        const sz = tongueSize(layer, shape);
        out.push(tex(boil(K.tongue(layer, shape), v), cv, 0.5, 1 - (sz.w * rc.C * 0.25) / cv.height, 0.05));
      });
    }
  }
  boilVariants((pen) => drawLick(pen, rc.C), rc.seed * 37 + 3, 1).forEach((cv) => out.push(tex(K.lick, cv, 0.5, 1, 0.05)));
  return out;
}
