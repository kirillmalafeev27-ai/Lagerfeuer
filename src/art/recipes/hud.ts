// Шкалы (7.5.12), подсказки (7.5.13) и кисти света (8.3). Ничто здесь не кипит.

import { look } from '../../config/look.ts';
import { mix, palette } from '../../config/palette.ts';
import { K } from '../manifest.ts';
import { type Pt, chalkLine, crumbs, lightBrush, makePen, mulberry32, pastelFill, pastelStroke, smudge } from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, ellipsePts, roundRectPts, tex } from './common.ts';

const g = look.gauge;

export function gaugeSize(C: number): { w: number; h: number; slotW: number; slotH: number; gap: number; padX: number; padY: number } {
  const slotW = C * g.slotW;
  const slotH = C * g.slotH;
  const gap = C * g.gap;
  const padX = C * g.padX;
  const padY = C * g.padY;
  return { w: slotW * 3 + gap * 2 + padX * 2, h: slotH + padY * 2, slotW, slotH, gap, padX, padY };
}

function plate(rc: RC): HTMLCanvasElement {
  const gs = gaugeSize(rc.C);
  const m = rc.C * 0.04;
  const [c, x] = canvasFor(gs.w + m * 2, gs.h + m * 2);
  const pen = makePen(rc.seed * 181, 0, 0);
  const body = roundRectPts(pen, m, m, gs.w, gs.h, gs.h * 0.35);
  x.save();
  x.beginPath();
  body.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  x.closePath();
  x.fillStyle = palette.paper;
  x.globalAlpha = 0.92;
  x.fill();
  x.restore();
  for (let i = 0; i < 3; i++) {
    const sx = m + gs.padX + i * (gs.slotW + gs.gap);
    const slot = roundRectPts(pen, sx, m + gs.padY, gs.slotW, gs.slotH, gs.slotH * 0.4);
    chalkLine(x, pen, slot, Math.max(1, rc.C * 0.006), mix(palette.chalk, palette.paper, 0.55), true, 0.6);
  }
  chalkLine(x, pen, body, Math.max(1.4, rc.C * 0.014), palette.chalk, true, 0.95);
  return c;
}

function birchIcon(rc: RC): HTMLCanvasElement {
  const gs = gaugeSize(rc.C);
  const [c, x] = canvasFor(gs.slotW, gs.slotH);
  const pen = makePen(rc.seed * 191, 0, 0);
  const b = palette.birch;
  const body = roundRectPts(pen, 0.5, 0.5, gs.slotW - 1, gs.slotH - 1, gs.slotH * 0.4);
  pastelFill(x, pen, body, b.bark, 0, 1.4, { stroke: Math.max(2, gs.slotH * 0.3), under: 1, cross: 0.2, grain: false });
  for (let i = 0; i < 3; i++) {
    const mx = gs.slotW * (0.25 + i * 0.25) + (pen.rng() - 0.5) * 2;
    const my = gs.slotH * (0.35 + pen.rng() * 0.3);
    pastelStroke(x, pen, [{ x: mx - gs.slotH * 0.25, y: my }, { x: mx + gs.slotH * 0.25, y: my }], Math.max(1.4, gs.slotH * 0.16), b.mark, 1, { taper: 0.3, grain: false });
  }
  return c;
}

function oakIcon(rc: RC): HTMLCanvasElement {
  const gs = gaugeSize(rc.C);
  const W = gs.slotW * 2 + gs.gap;
  const [c, x] = canvasFor(W, gs.slotH);
  const pen = makePen(rc.seed * 193, 0, 0);
  const o = palette.oak;
  const body = roundRectPts(pen, 0.5, 0.5, W - 1, gs.slotH - 1, gs.slotH * 0.4);
  pastelFill(x, pen, body, o.light, 0, 1.4, { stroke: Math.max(2, gs.slotH * 0.3), under: 1, cross: 0.2, tones: [o.light, mix(o.light, o.end, 0.5)], grain: false });
  const ex = W - gs.slotH * 0.45;
  const end = ellipsePts(ex, gs.slotH / 2, gs.slotH * 0.3, gs.slotH * 0.42, 12);
  pastelFill(x, pen, end, o.end, 0, 1.4, { stroke: Math.max(1.5, gs.slotH * 0.2), under: 1, grain: false });
  for (let k = 1; k <= 2; k++) {
    const r = ellipsePts(ex, gs.slotH / 2, gs.slotH * 0.3 * (k / 3), gs.slotH * 0.42 * (k / 3), 10);
    pastelStroke(x, pen, r.concat([r[0]]), Math.max(1, gs.slotH * 0.06), o.ring, 1, { taper: 0, grain: false });
  }
  return c;
}

function hatchIcon(rc: RC): HTMLCanvasElement {
  const gs = gaugeSize(rc.C);
  const W = gs.slotW * 2 + gs.gap;
  const [c, x] = canvasFor(W, gs.slotH);
  const pen = makePen(rc.seed * 197, 0, 0);
  const body = roundRectPts(pen, 0.5, 0.5, W - 1, gs.slotH - 1, gs.slotH * 0.4);
  x.save();
  x.beginPath();
  body.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  x.closePath();
  x.clip();
  x.strokeStyle = palette.oak.end;
  x.lineWidth = Math.max(1.4, gs.slotH * 0.14);
  for (let d = -gs.slotH; d < W + gs.slotH; d += gs.slotH * 0.42) {
    x.beginPath();
    x.moveTo(d, gs.slotH + 1);
    x.lineTo(d + gs.slotH, -1);
    x.stroke();
  }
  x.restore();
  chalkLine(x, pen, body, Math.max(1, rc.C * 0.007), palette.oak.end, true, 0.9);
  return c;
}

function fireStrip(rc: RC): HTMLCanvasElement {
  const gs = gaugeSize(rc.C);
  const w = Math.ceil(gs.slotH * 0.55);
  const [c, x] = canvasFor(w, gs.slotH + 2);
  const pen = makePen(rc.seed * 199, 0, 0);
  pastelStroke(x, pen, [{ x: w / 2, y: gs.slotH }, { x: w / 2, y: 1 }], w * 0.85, palette.fire.mid, 1, { taper: 0.2, grain: false });
  pastelStroke(x, pen, [{ x: w / 2, y: gs.slotH * 0.85 }, { x: w / 2, y: gs.slotH * 0.25 }], w * 0.4, palette.fire.core, 1, { taper: 0.3, grain: false });
  return c;
}

function ghostIcon(rc: RC): HTMLCanvasElement {
  const gs = gaugeSize(rc.C);
  const W = gs.slotW * 2 + gs.gap;
  const [c, x] = canvasFor(W, gs.slotH);
  const pen = makePen(rc.seed * 211, 0, 0);
  const body = roundRectPts(pen, 1, 1, W - 2, gs.slotH - 2, gs.slotH * 0.4);
  // Пунктир: каждый второй отрезок контура.
  const closed = body.concat([body[0]]);
  const dash = Math.max(3, gs.slotH * 0.35);
  let acc = 0;
  let on = true;
  let cur: Pt[] = [closed[0]];
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1];
    const b = closed[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    let t = 0;
    while (t < l) {
      const step = Math.min(dash - acc, l - t);
      t += step;
      acc += step;
      const p = { x: a.x + ((b.x - a.x) * t) / l, y: a.y + ((b.y - a.y) * t) / l };
      if (on) cur.push(p);
      if (acc >= dash - 1e-6) {
        if (on && cur.length > 1) chalkLine(x, pen, cur, Math.max(1.4, gs.slotH * 0.12), palette.chalk, false, 1);
        on = !on;
        acc = 0;
        cur = [p];
      }
    }
  }
  const ex = W - gs.slotH * 0.45;
  const end = ellipsePts(ex, gs.slotH / 2, gs.slotH * 0.28, gs.slotH * 0.38, 10);
  for (let i = 0; i < end.length; i += 2) chalkLine(x, pen, [end[i], end[(i + 1) % end.length]], Math.max(1.2, gs.slotH * 0.1), palette.chalk, false, 1);
  return c;
}

/** Кольцо срочности: сплошное, пунктирное или зигзагом. */
function ring(rc: RC, kind: 'solid' | 'dashed' | 'zigzag', color: string): HTMLCanvasElement {
  const C = rc.C;
  const rx = C * look.ring.r;
  const ry = rx * look.ring.squash;
  const m = C * 0.08;
  const [c, x] = canvasFor(rx * 2 + m * 2, ry * 2 + m * 2);
  const pen = makePen(rc.seed * 223 + kind.length, 0, 0);
  const cx = c.width / 2;
  const cy = c.height / 2;
  const w = Math.max(2, C * 0.028);
  const pts = ellipsePts(cx, cy, rx, ry, 64, -Math.PI / 2);
  if (kind === 'solid') {
    chalkLine(x, pen, pts, w, color, true, 1);
  } else if (kind === 'dashed') {
    for (let i = 0; i < 64; i += 8) chalkLine(x, pen, pts.slice(i, i + 5), w, color, false, 1);
  } else {
    const zz: Pt[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = -Math.PI / 2 + (i / 64) * Math.PI * 2;
      const k = i % 2 ? 1.12 : 0.9;
      zz.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    chalkLine(x, pen, zz, w * 0.9, color, false, 1);
  }
  return c;
}

function routeDot(rc: RC): HTMLCanvasElement {
  const s = Math.ceil(rc.C * 0.09);
  const [c, x] = canvasFor(s, s);
  const pen = makePen(rc.seed * 227, 0, 0);
  crumbs(x, pen, { x: s * 0.35, y: s * 0.35, w: s * 0.3, h: s * 0.3 }, palette.hints.route, 3, s * 0.22);
  return c;
}

function x2Badge(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const s = Math.ceil(C * 0.36);
  const [c, x] = canvasFor(s, s);
  const pen = makePen(rc.seed * 229, 0, 0);
  const disc = ellipsePts(s / 2, s / 2, s * 0.42, s * 0.42, 16);
  x.fillStyle = palette.paper;
  x.beginPath();
  disc.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  x.closePath();
  x.fill();
  chalkLine(x, pen, disc, Math.max(1.4, C * 0.012), palette.caption, true, 1);
  x.font = `${Math.round(s * 0.42)}px "Rubik Scribble", "Rubik", sans-serif`;
  x.fillStyle = palette.caption;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('×2', s / 2, s / 2 + 1);
  return c;
}

function windIcon(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil(C * 0.5);
  const H = Math.ceil(C * 0.36);
  const [c, x] = canvasFor(W, H);
  const pen = makePen(rc.seed * 233, 0, 0);
  for (let i = 0; i < 3; i++) {
    const y = H * (0.25 + i * 0.25);
    const x0 = W * (0.08 + (i % 2) * 0.12);
    const x1 = W * (0.75 - (i % 2) * 0.1);
    const curl: Pt[] = [
      { x: x0, y },
      { x: x1, y },
      { x: x1 + W * 0.1, y: y - H * 0.12 },
      { x: x1 + W * 0.02, y: y - H * 0.2 },
      { x: x1 - W * 0.06, y: y - H * 0.12 },
    ];
    chalkLine(x, pen, i === 1 ? curl.slice(0, 2) : curl, Math.max(1.4, C * 0.016), palette.wind, false, 1);
  }
  return c;
}

function hintStar(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const s = Math.ceil(C * 0.22);
  const [c, x] = canvasFor(s, s);
  const pen = makePen(rc.seed * 239, 0, 0);
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = (i % 2 ? 0.2 : 0.46) * s;
    pts.push({ x: s / 2 + Math.cos(a) * r, y: s / 2 + Math.sin(a) * r });
  }
  smudge(x, pen, s / 2, s / 2, s * 0.45, palette.chalk, 0.3);
  chalkLine(x, pen, pts, Math.max(1.2, s * 0.07), palette.chalk, true, 1);
  return c;
}

export function drawHud(rc: RC): Tex[] {
  const gs = gaugeSize(rc.C);
  void gs;
  return [
    tex(K.gaugePlate, plate(rc)),
    tex(K.gaugeBirch, birchIcon(rc), 0, 0.5),
    tex(K.gaugeOak, oakIcon(rc), 0, 0.5),
    tex(K.gaugeHatch, hatchIcon(rc), 0, 0.5),
    tex(K.gaugeStrip, fireStrip(rc), 0.5, 0.5),
    tex(K.gaugeGhost, ghostIcon(rc), 0, 0.5),
    tex(K.ringCalm, ring(rc, 'solid', palette.hints.calm)),
    tex(K.ringSoon, ring(rc, 'dashed', palette.hints.soon)),
    tex(K.ringLate, ring(rc, 'zigzag', palette.hints.late)),
    tex(K.routeDot, routeDot(rc)),
    tex(K.x2, x2Badge(rc)),
    tex(K.windIcon, windIcon(rc)),
    tex(K.star, hintStar(rc)),
  ];
}

/** Кисти света: радиальная прозрачность с зернистым краем, по 3 варианта под кипение. */
export function drawBrushes(rc: RC): Tex[] {
  const size = rc.C >= 128 ? 256 : 192;
  const out: Tex[] = [];
  for (let i = 0; i < 3; i++) out.push(tex(K.brush(i), lightBrush(mulberry32(rc.seed * 241 + i), size)));
  out.push(tex(K.brushSoft, lightBrush(mulberry32(rc.seed * 251), size, 0.15, 0.3)));
  {
    // Маска неба: сверху полная, к низу полосы зернисто сходит на нет.
    const [c, x] = canvasFor(64, 64);
    const img = x.createImageData(64, 64);
    const rng = mulberry32(rc.seed * 257);
    for (let yy = 0; yy < 64; yy++) {
      for (let xx = 0; xx < 64; xx++) {
        const t = yy / 63;
        const base = t < 0.62 ? 1 : Math.max(0, 1 - (t - 0.62) / 0.38);
        const a = base > rng() * 0.6 + 0.2 ? 1 : base * 0.5;
        const k = (yy * 64 + xx) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        img.data[k + 3] = Math.round(Math.min(1, a) * 255);
      }
    }
    x.putImageData(img, 0, 0);
    out.push(tex(K.skyMask, c, 0, 0));
  }
  {
    // Виньетка запасного пути (8.5): к краю — чёрная бумага.
    const [c, x] = canvasFor(256, 256);
    const g = x.createRadialGradient(128, 128, 30, 128, 128, 128);
    g.addColorStop(0, rgbaPaper(0));
    g.addColorStop(0.5, rgbaPaper(0.55));
    g.addColorStop(1, rgbaPaper(0.9));
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    out.push(tex(K.vignette, c));
  }
  {
    const [c, x] = canvasFor(8, 8);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 8, 8);
    out.push(tex(K.white, c, 0, 0));
  }
  return out;
}

function rgbaPaper(a: number): string {
  const n = parseInt(palette.paper.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
