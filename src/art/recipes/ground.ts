// Поляна и лесная подстилка (7.5.1): клетки — вытоптанные пятна тёплой земли, между ними
// корни и трава; кострища с кольцами камней; подстилка — бесшовная плитка.

import { look } from '../../config/look.ts';
import { mix, palette } from '../../config/palette.ts';
import {
  type Pen,
  type Pt,
  PastelLayer,
  blob,
  chalkLine,
  crumbs,
  jitterPath,
  makePen,
  pastelFill,
  pastelStroke,
  scratches,
  sgraffito,
  smudge,
  toothTile,
} from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, ellipsePts, quadPts, roundRectPts, tex } from './common.ts';

/** Центры кострищ в клетках: С, В, Ю, З. */
export function pitCenters(): Pt[] {
  const o = look.pitOut;
  return [
    { x: 1, y: -o },
    { x: 2 + o, y: 1 },
    { x: 1, y: 2 + o },
    { x: -o, y: 1 },
  ];
}

/** Центры угловых мест снаружи поляны: СЗ, СВ, ЮЗ, ЮВ. */
export function cornerCenters(): Pt[] {
  const o = look.cornerOut;
  return [
    { x: -o, y: -o },
    { x: 2 + o, y: -o },
    { x: -o, y: 2 + o },
    { x: 2 + o, y: 2 + o },
  ];
}

export function stone(x: CanvasRenderingContext2D, pen: Pen, cx: number, cy: number, w: number, h: number, chalk = true): void {
  const p = blob(pen.rng, w, h, { cx, cy, irregularity: 0.2, points: 7 });
  const st = palette.stone;
  pastelFill(x, pen, p, st.dark, -0.5, 1.2, { stroke: Math.max(2, w * 0.2), under: 0.6, tones: [st.dark, st.base, mix(st.dark, palette.paper, 0.3)], cross: 0.4 });
  const top = blob(pen.rng, w * 0.62, h * 0.42, { cx: cx - w * 0.08, cy: cy - h * 0.2, irregularity: 0.2 });
  pastelFill(x, pen, top, st.base, -0.3, 1, { stroke: Math.max(1.8, w * 0.16), under: 0.2, tones: [st.base, st.light], cross: 0.2, pressure: 0.8 });
  if (chalk) {
    const top = p.filter((q) => q.y < cy + h * 0.1).sort((a, b) => a.x - b.x);
    if (top.length > 2) chalkLine(x, pen, top, Math.max(1.1, w * 0.06), palette.chalk, false, 0.45);
  }
}

/** Пучок травы: короткие штрихи вверх веером. */
export function grassTuft(x: CanvasRenderingContext2D, pen: Pen, cx: number, cy: number, s: number, colors: readonly string[]): void {
  const n = 4 + Math.floor(pen.rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.6 + (pen.rng() - 0.5) * 0.3;
    const l = s * (0.55 + pen.rng() * 0.55);
    const bend = (pen.rng() - 0.5) * s * 0.4 + Math.cos(a) * s * 0.25;
    const p0 = { x: cx + (pen.rng() - 0.5) * s * 0.3, y: cy };
    const p2 = { x: p0.x + Math.cos(a) * l, y: p0.y + Math.sin(a) * l };
    const p1 = { x: (p0.x + p2.x) / 2 + bend, y: (p0.y + p2.y) / 2 };
    pastelStroke(x, pen, quadPts(p0, p1, p2, 5), Math.max(2, s * 0.14), colors[i % colors.length], 0.9, { grain: false, taper: 0.9 });
  }
}

/** Лист папоротника: стебель и перья. */
export function fernFrond(x: CanvasRenderingContext2D, pen: Pen, cx: number, cy: number, len: number, angle: number, color: string, light: string): void {
  const bend = (pen.rng() - 0.5) * 0.6;
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = angle + bend * t;
    pts.push({ x: cx + Math.cos(a) * len * t, y: cy + Math.sin(a) * len * t + t * t * len * 0.18 });
  }
  pastelStroke(x, pen, pts, Math.max(1.6, len * 0.05), color, 0.9, { grain: false, taper: 0.6 });
  for (let i = 1; i < 8; i++) {
    const p = pts[i];
    const t = i / 8;
    const l = len * 0.3 * (1 - t * 0.75);
    const a = angle + bend * t;
    for (const side of [-1, 1]) {
      const b = a + side * (1.15 + pen.rng() * 0.2);
      pastelStroke(
        x,
        pen,
        [p, { x: p.x + Math.cos(b) * l, y: p.y + Math.sin(b) * l + l * 0.35 }],
        Math.max(1.8, len * 0.075),
        side < 0 ? light : color,
        0.85,
        { grain: false, taper: 0.8 },
      );
    }
  }
}

/** Вызвать рисование со сдвигами, чтобы элемент у края плитки повторился с другой стороны. */
function wrap(S: number, x: number, y: number, r: number, draw: (dx: number, dy: number) => void): void {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue;
      draw(dx, dy);
    }
  }
}

/** Бесшовная плитка лесной подстилки: хвоя, мох, папоротник, трава. */
export function drawForestFloor(rc: RC): Tex {
  const C = rc.C;
  const S = Math.round(C * 3);
  const [c, x] = canvasFor(S, S);
  const pen = makePen(rc.seed ^ 0x4f10, 0, 0);
  const g = palette.ground;
  const f = palette.forest;
  const tile = toothTile(pen.rng, 128, palette.paper, palette.paperTooth);
  const pat = x.createPattern(tile, 'repeat');
  if (pat) {
    x.fillStyle = pat;
    x.fillRect(0, 0, S, S);
  }
  // Подложка: тёмные пятна хвои и земли, бумага просвечивает.
  {
    const L = new PastelLayer(x, S, S);
    const cols = [g.needles, g.dark, f.trunk, g.needles, f.fir];
    for (let i = 0; i < 16; i++) {
      const cx = pen.rng() * S;
      const cy = pen.rng() * S;
      const w = C * (0.8 + pen.rng() * 0.9);
      const col = cols[i % cols.length];
      const ang = -0.5 + (pen.rng() - 0.5) * 0.7;
      const shape = blob(pen.rng, w, w * (0.6 + pen.rng() * 0.3), { irregularity: 0.28, points: 9 });
      wrap(S, cx, cy, w, (dx, dy) => {
        pastelFill(L.ctx, pen, shape.map((p) => ({ x: p.x + cx + dx, y: p.y + cy + dy })), col, ang, 0.75, {
          stroke: C * 0.07,
          under: 0.12,
          cross: 0.3,
          pressure: 0.55,
          grain: false,
          tones: [col, g.dark],
          len: 0.35,
        });
      });
    }
    L.end(pen.rng, 0.12);
  }
  // Хвоинки процарапаны.
  sgraffito(x, pen, scratches(pen, [{ x: 0, y: 0 }, { x: S, y: S }], 140, C * 0.08, 0.4, 3), Math.max(1, C * 0.009));
  // Светлые хвоинки и мох.
  {
    const L = new PastelLayer(x, S, S);
    for (let i = 0; i < 70; i++) {
      const cx = pen.rng() * S;
      const cy = pen.rng() * S;
      const a = pen.rng() * Math.PI;
      const l = C * (0.05 + pen.rng() * 0.06);
      const col = pen.rng() < 0.6 ? g.root : f.firLight;
      const p0 = { x: cx, y: cy };
      const p1 = { x: cx + Math.cos(a) * l, y: cy + Math.sin(a) * l };
      wrap(S, cx, cy, l, (dx, dy) => {
        pastelStroke(L.ctx, pen, [{ x: p0.x + dx, y: p0.y + dy }, { x: p1.x + dx, y: p1.y + dy }], Math.max(1.6, C * 0.016), col, 0.7, { grain: false, taper: 0.6 });
      });
    }
    for (let i = 0; i < 9; i++) {
      const cx = pen.rng() * S;
      const cy = pen.rng() * S;
      const r = C * 0.3;
      wrap(S, cx, cy, r, (dx, dy) => {
        if (pen.rng() < 0.5) {
          const k = 3 + Math.floor(pen.rng() * 3);
          for (let j = 0; j < k; j++) {
            fernFrond(L.ctx, pen, cx + dx, cy + dy, C * (0.2 + pen.rng() * 0.12), -Math.PI / 2 + (j - (k - 1) / 2) * 0.6, f.fern, f.firLight);
          }
        } else grassTuft(L.ctx, pen, cx + dx, cy + dy, C * 0.16, [f.fern, g.needles, f.firLight]);
      });
    }
    L.end(pen.rng, 0.1);
  }
  return tex('floor', c, 0, 0);
}

/** Поляна: четыре клетки, корни и трава между ними, кострища, утоптанные углы. */
export function drawClearing(rc: RC): Tex {
  const C = rc.C;
  const pad = 1.75;
  const span = 2 + pad * 2;
  const W = Math.round(span * C);
  const [c, x] = canvasFor(W, W);
  const X = (v: number) => (v + pad) * C;
  const Y = (v: number) => (v + pad) * C;
  const pen = makePen(rc.seed ^ 0x6a09, 0, 0);
  const g = palette.ground;
  const f = palette.forest;

  // Земля поляны: рваный край, растёртый в траву.
  const outer = blob(pen.rng, C * 3.25, C * 3.15, { cx: X(1), cy: Y(1), irregularity: 0.1, points: 13 });
  smudge(x, pen, X(1), Y(1), C * 1.9, g.dark, 0.85);
  pastelFill(x, pen, outer, g.dark, -0.65, 0.8, { stroke: C * 0.07, under: 0.22, tones: [g.dark, mix(g.dark, palette.paper, 0.45)], len: 0.3, pressure: 0.75 });

  // Кострища: выжженная земля и пепел.
  const pits = pitCenters();
  for (const p of pits) {
    const sc = blob(pen.rng, C * 1.05, C * 0.66, { cx: X(p.x), cy: Y(p.y) + C * 0.04, irregularity: 0.12 });
    pastelFill(x, pen, sc, g.dark, 0.3, 0.9, { stroke: C * 0.06, under: 0.5, tones: [g.dark, mix(g.dark, palette.paper, 0.55), palette.smoke], len: 0.4, pressure: 0.7 });
    smudge(x, pen, X(p.x), Y(p.y) + C * 0.03, C * 0.34, palette.paper, 0.85, 0.6);
    crumbs(x, pen, { x: X(p.x) - C * 0.28, y: Y(p.y) - C * 0.1, w: C * 0.56, h: C * 0.22 }, palette.smoke, 30, C * 0.014);
  }

  // Утоптанные углы (поленница и палатка).
  for (const p of cornerCenters()) {
    const sp = blob(pen.rng, C * 1.15, C * 0.72, { cx: X(p.x), cy: Y(p.y) + C * 0.12, irregularity: 0.22, points: 9 });
    pastelFill(x, pen, sp, g.dark, -0.4, 0.75, { stroke: C * 0.06, under: 0.2, pressure: 0.7, tones: [g.dark, g.root, g.base], len: 0.35 });
  }

  // Клетки — вытоптанные пятна, без линий сетки.
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const cx = X(i + 0.5);
      const cy = Y(j + 0.5);
      const s = C * 0.88;
      const spot = jitterPath(roundRectPts(pen, cx - s / 2, cy - s / 2, s, s, C * 0.26), pen.rng, C * 0.03);
      pastelFill(x, pen, spot, g.base, -0.78, 1.25, {
        stroke: C * 0.075,
        under: 0.55,
        cross: 0.5,
        tones: [g.base, g.base, mix(g.base, g.light, 0.5), mix(g.base, g.dark, 0.25)],
        len: 0.45,
      });
      // Свет — слева сверху: короткие светлые штрихи; тень — справа снизу.
      const hi = blob(pen.rng, C * 0.6, C * 0.5, { cx: cx - C * 0.08, cy: cy - C * 0.09, irregularity: 0.2 });
      pastelFill(x, pen, hi, g.light, -0.95, 1, { stroke: C * 0.065, under: 0.12, cross: 0.3, pressure: 0.95, tones: [g.light, mix(g.light, palette.chalk, 0.22)], len: 0.4 });
      const lo = blob(pen.rng, C * 0.8, C * 0.3, { cx: cx + C * 0.06, cy: cy + C * 0.33, irregularity: 0.2 });
      pastelFill(x, pen, lo, g.dark, -0.4, 0.9, { stroke: C * 0.06, under: 0.1, cross: 0.2, pressure: 0.85, len: 0.35 });
      sgraffito(x, pen, scratches(pen, spot, 16, C * 0.09, pen.rng() * 3, 3), Math.max(1.2, C * 0.011));
      for (let k = 0; k < 2; k++) {
        const crack: Pt[] = [{ x: cx + (pen.rng() - 0.5) * C * 0.5, y: cy + (pen.rng() - 0.5) * C * 0.5 }];
        let a = pen.rng() * Math.PI * 2;
        for (let st = 0; st < 4; st++) {
          a += (pen.rng() - 0.5) * 1.2;
          const last = crack[crack.length - 1];
          crack.push({ x: last.x + Math.cos(a) * C * 0.06, y: last.y + Math.sin(a) * C * 0.06 });
        }
        sgraffito(x, pen, [crack], Math.max(1.2, C * 0.01));
      }
      const pebbles = 2 + Math.floor(pen.rng() * 2);
      for (let k = 0; k < pebbles; k++) {
        const ang = pen.rng() * Math.PI * 2;
        const rr = C * (0.2 + pen.rng() * 0.15);
        stone(x, pen, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.9, C * (0.08 + pen.rng() * 0.04), C * (0.05 + pen.rng() * 0.025), false);
      }
    }
  }

  // Корни и трава между клетками: по ним читаются границы.
  const wav = (x0: number, y0: number, x1: number, y1: number, amp: number): Pt[] => {
    const pts: Pt[] = [];
    const n = 10;
    const ph = pen.rng() * 6;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const l = Math.hypot(nx, ny) || 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const s = Math.sin(t * Math.PI * 2.3 + ph) * amp;
      pts.push({ x: x0 + (x1 - x0) * t + (nx / l) * s, y: y0 + (y1 - y0) * t + (ny / l) * s });
    }
    return pts;
  };
  const root = (pts: Pt[], w: number) => {
    pastelStroke(x, pen, pts.map((p) => ({ x: p.x + w * 0.2, y: p.y + w * 0.3 })), w * 1.1, palette.paper, 0.6, { taper: 0.45 });
    pastelStroke(x, pen, pts, w, g.root, 1, { taper: 0.45 });
    pastelStroke(x, pen, pts.map((p) => ({ x: p.x - w * 0.12, y: p.y - w * 0.22 })), w * 0.42, mix(g.light, palette.chalk, 0.25), 0.7, { taper: 0.6 });
  };
  root(wav(X(1), Y(-0.08), X(1), Y(2.08), C * 0.03), C * 0.085);
  root(wav(X(-0.08), Y(1), X(2.08), Y(1), C * 0.03), C * 0.085);
  root(wav(X(0.98), Y(0.25), X(0.6), Y(-0.2), C * 0.02), C * 0.045);
  root(wav(X(1.02), Y(1.75), X(1.4), Y(2.2), C * 0.02), C * 0.045);
  root(wav(X(0.25), Y(1.02), X(-0.2), Y(1.35), C * 0.02), C * 0.045);
  root(wav(X(1.75), Y(0.98), X(2.2), Y(0.62), C * 0.02), C * 0.045);
  {
    const L = new PastelLayer(x, W, W);
    const along = (x0: number, y0: number, x1: number, y1: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + (pen.rng() - 0.5) * 0.05;
        grassTuft(L.ctx, pen, x0 + (x1 - x0) * t + (pen.rng() - 0.5) * C * 0.06, y0 + (y1 - y0) * t + (pen.rng() - 0.5) * C * 0.06, C * (0.12 + pen.rng() * 0.06), [f.fern, f.firLight, g.needles]);
      }
    };
    along(X(1), Y(0.03), X(1), Y(1.97), 8);
    along(X(0.03), Y(1), X(1.97), Y(1), 8);
    // Край поляны уходит в траву и папоротник.
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * Math.PI * 2 + pen.rng() * 0.08;
      const r = C * (1.5 + pen.rng() * 0.16);
      const px = X(1) + Math.cos(a) * r;
      const py = Y(1) + Math.sin(a) * r;
      if (pen.rng() < 0.3) {
        for (let j = 0; j < 3; j++) fernFrond(L.ctx, pen, px, py, C * (0.18 + pen.rng() * 0.1), a + (j - 1) * 0.5 - 0.3, f.fern, f.firLight);
      } else grassTuft(L.ctx, pen, px, py, C * (0.13 + pen.rng() * 0.07), [f.fern, g.needles, f.firLight]);
    }
    L.end(pen.rng, 0.08);
  }

  // Кольца камней вокруг кострищ.
  for (const p of pits) {
    const ring = ellipsePts(X(p.x), Y(p.y), C * look.pit.ring * 0.5, C * look.pit.ring * 0.28, 8, pen.rng());
    ring.sort((a, b) => a.y - b.y);
    for (const s of ring) stone(x, pen, s.x, s.y, C * (0.17 + pen.rng() * 0.05), C * (0.11 + pen.rng() * 0.03));
  }

  return tex('bg', c, pad / span, pad / span);
}

/** Плитка чёрной бумаги для DOM и подложек. */
export function drawPaper(rc: RC): Tex {
  const pen = makePen(rc.seed ^ 0x51, 0, 0);
  return tex('paper', toothTile(pen.rng, 128, palette.paper, palette.paperTooth), 0, 0);
}
