// Кострище (7.5.4–7.5.6): поленья шалашиком, разгорающийся дуб, угли; искры, дым и ореолы.

import { palette, mix } from '../../config/palette.ts';
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
  sgraffito,
  smudge,
} from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, ellipsePts, roundRectPts, tex } from './common.ts';

/** Полено вдоль оси x: длина L, толщина T, торец справа. */
export function drawLogShape(
  x: CanvasRenderingContext2D,
  pen: Pen,
  cx: number,
  cy: number,
  L: number,
  T: number,
  kind: 'birch' | 'oak',
  opts: { chalk?: boolean; endRings?: boolean; charred?: number } = {},
): void {
  const body = roundRectPts(pen, cx - L / 2, cy - T / 2, L, T, T * 0.42);
  if (kind === 'birch') {
    const b = palette.birch;
    pastelFill(x, pen, body, b.bark, -0.15, 1.3, {
      stroke: Math.max(2, T * 0.32),
      under: 0.75,
      tones: [b.bark, b.bark, mix(b.bark, b.inner, 0.3)],
      cross: 0.3,
    });
    // Чёрные чёрточки берёзы.
    const marks = Math.max(3, Math.round(L / (T * 0.55)));
    for (let i = 0; i < marks; i++) {
      const mx = cx - L / 2 + T * 0.4 + ((L - T * 0.9) * (i + pen.rng() * 0.6)) / marks;
      const my = cy + (pen.rng() - 0.5) * T * 0.5;
      const ml = T * (0.25 + pen.rng() * 0.35);
      pastelStroke(
        x,
        pen,
        [
          { x: mx - ml / 2, y: my },
          { x: mx + ml / 2, y: my + (pen.rng() - 0.5) * T * 0.1 },
        ],
        Math.max(1.4, T * 0.13),
        b.mark,
        1,
        { taper: 0.5 },
      );
    }
    // Завиток отслоившейся коры.
    if (L > T * 2.5) {
      const kx = cx + (pen.rng() - 0.5) * L * 0.4;
      chalkLine(
        x,
        pen,
        [
          { x: kx, y: cy - T * 0.5 },
          { x: kx + T * 0.18, y: cy - T * 0.72 },
          { x: kx + T * 0.32, y: cy - T * 0.55 },
        ],
        Math.max(1, T * 0.08),
        b.bark,
        false,
        0.9,
      );
    }
    // Торец.
    const end = ellipsePts(cx + L / 2 - T * 0.12, cy, T * 0.2, T * 0.46, 12);
    pastelFill(x, pen, end, b.inner, 0.4, 1.2, {
      stroke: Math.max(1.6, T * 0.2),
      under: 0.8,
      cross: 0.2,
    });
  } else {
    const o = palette.oak;
    pastelFill(x, pen, body, o.bark, -0.2, 1.3, {
      stroke: Math.max(2, T * 0.28),
      under: 0.75,
      tones: [o.bark, o.light, o.bark],
      cross: 0.35,
    });
    // Волокна коры процарапаны.
    const fib: Pt[][] = [];
    for (let i = 0; i < 4; i++) {
      const yy = cy - T * 0.3 + (i / 3) * T * 0.6;
      fib.push([
        { x: cx - L / 2 + T * 0.3, y: yy + (pen.rng() - 0.5) * 2 },
        { x: cx, y: yy + (pen.rng() - 0.5) * 3 },
        { x: cx + L / 2 - T * 0.4, y: yy + (pen.rng() - 0.5) * 2 },
      ]);
    }
    sgraffito(x, pen, fib, Math.max(1, T * 0.06));
    // Охристый торец с годовыми кольцами.
    const ex = cx + L / 2 - T * 0.15;
    const end = ellipsePts(ex, cy, T * 0.24, T * 0.5, 14);
    pastelFill(x, pen, end, o.end, 0.3, 1.3, {
      stroke: Math.max(1.6, T * 0.2),
      under: 0.85,
      cross: 0.2,
    });
    if (opts.endRings !== false) {
      for (let r = 1; r <= 2; r++) {
        const ring = ellipsePts(ex, cy, T * 0.24 * (r / 3), T * 0.5 * (r / 3), 10);
        pastelStroke(x, pen, ring.concat([ring[0]]), Math.max(1, T * 0.06), o.ring, 0.9, {
          taper: 0,
        });
      }
    }
  }
  if (opts.charred) {
    for (let i = 0; i < 3; i++) {
      smudge(
        x,
        pen,
        cx + (pen.rng() - 0.5) * L * 0.6,
        cy + (pen.rng() - 0.3) * T * 0.4,
        T * 0.45,
        palette.paper,
        opts.charred,
        0.6,
      );
    }
  }
  if (opts.chalk !== false) {
    const top = body.filter((p) => p.y < cy).sort((a, b) => a.x - b.x);
    chalkLine(x, pen, top, Math.max(1, T * 0.07), palette.chalk, false, 0.55);
  }
}

/** Одно полено для шалашика в кострище (рисуется горизонтально, поворачивается спрайтом). */
function logTex(rc: RC, kind: 'birch' | 'oak', catching: boolean): HTMLCanvasElement[] {
  const C = rc.C;
  const L = C * (kind === 'birch' ? 0.5 : 0.52);
  const T = C * (kind === 'birch' ? 0.12 : 0.17);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(L + T, T * 2.2);
      drawLogShape(x, pen, c.width / 2, c.height / 2, L, T, kind, { charred: catching ? 0.55 : 0 });
      if (catching) {
        // Язычки ползут по дубу.
        for (let i = 0; i < 3; i++) {
          const fx = c.width / 2 + (i - 1) * L * 0.25 + (pen.rng() - 0.5) * 4;
          const fy = c.height / 2 - T * 0.35;
          pastelStroke(
            x,
            pen,
            [
              { x: fx, y: fy },
              { x: fx + 2, y: fy - T * 0.35 },
              { x: fx - 1, y: fy - T * 0.6 },
            ],
            Math.max(2, T * 0.2),
            i === 1 ? palette.fire.mid : palette.fire.outer,
            0.95,
            { kind: 'scribble', taper: 0.9 },
          );
        }
      }
      return c;
    },
    rc.seed * 13 + (kind === 'birch' ? 1 : 2) + (catching ? 5 : 0),
    3,
    C * 0.008,
  );
}

/** Угли: красно-оранжевые комья с процарапанными трещинами. */
function embersTex(rc: RC): HTMLCanvasElement[] {
  const C = rc.C;
  const W = Math.ceil(C * 0.72);
  const H = Math.ceil(C * 0.38);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, H);
      smudge(x, pen, W / 2, H * 0.58, W * 0.42, palette.ember.dark, 0.7, 0.45);
      const lumps = 7;
      const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (let i = 0; i < lumps; i++) {
        const lx = W / 2 + (pen.rng() - 0.5) * W * 0.6;
        const ly = H * 0.55 + (pen.rng() - 0.5) * H * 0.35;
        const lw = C * (0.11 + pen.rng() * 0.08);
        const lh = lw * (0.55 + pen.rng() * 0.2);
        placed.push({ x: lx, y: ly, w: lw, h: lh });
      }
      placed.sort((a, b) => a.y - b.y);
      for (const p of placed) {
        const shape = blob(pen.rng, p.w, p.h, { cx: p.x, cy: p.y, irregularity: 0.22, points: 7 });
        pastelFill(x, pen, shape, palette.ember.dark, -0.4, 1.3, {
          stroke: Math.max(2, p.w * 0.25),
          under: 0.7,
          tones: [palette.ember.dark, palette.ember.hot, palette.ember.dark],
        });
        const hot = blob(pen.rng, p.w * 0.5, p.h * 0.45, {
          cx: p.x - p.w * 0.1,
          cy: p.y - p.h * 0.12,
          irregularity: 0.3,
        });
        pastelFill(x, pen, hot, palette.ember.hot, -0.3, 1.2, {
          stroke: Math.max(1.6, p.w * 0.18),
          under: 0.6,
          tones: [palette.ember.hot, palette.fire.mid],
        });
        // Раскалённое ядро и светящиеся трещины: угли читаются и без цвета (7.7.1).
        const core = blob(pen.rng, p.w * 0.24, p.h * 0.22, {
          cx: p.x - p.w * 0.08,
          cy: p.y - p.h * 0.1,
          irregularity: 0.3,
        });
        pastelFill(x, pen, core, palette.fire.core, -0.3, 1.2, {
          stroke: Math.max(1.4, p.w * 0.12),
          under: 0.85,
          tones: [palette.fire.core, palette.spark],
        });
        for (let k = 0; k < 2; k++) {
          const a = pen.rng() * Math.PI;
          const crack = [
            { x: p.x - Math.cos(a) * p.w * 0.3, y: p.y - Math.sin(a) * p.h * 0.3 },
            { x: p.x + (pen.rng() - 0.5) * 3, y: p.y + (pen.rng() - 0.5) * 2 },
            { x: p.x + Math.cos(a) * p.w * 0.32, y: p.y + Math.sin(a) * p.h * 0.32 },
          ];
          pastelStroke(x, pen, crack, Math.max(1.2, C * 0.012), palette.fire.mid, 0.9, {
            taper: 0.5,
          });
        }
      }
      crumbs(
        x,
        pen,
        { x: W * 0.2, y: H * 0.3, w: W * 0.6, h: H * 0.5 },
        palette.fire.core,
        12,
        C * 0.016,
      );
      return c;
    },
    rc.seed * 17 + 3,
    3,
    C * 0.008,
  );
}

export function drawPitParts(rc: RC): Tex[] {
  const out: Tex[] = [];
  logTex(rc, 'birch', false).forEach((c, v) => out.push(tex(boil(K.logBirch, v), c)));
  logTex(rc, 'oak', false).forEach((c, v) => out.push(tex(boil(K.logOak, v), c)));
  logTex(rc, 'oak', true).forEach((c, v) => out.push(tex(boil(K.logOakCatching, v), c)));
  embersTex(rc).forEach((c, v) => out.push(tex(boil(K.embers, v), c, 0.5, 0.6)));
  return out;
}

/** Искры, дым, пыль, листья, пар, ореолы и контактные тени. */
export function drawFx(rc: RC): Tex[] {
  const C = rc.C;
  const out: Tex[] = [];
  const pen = makePen(rc.seed * 19 + 1, 0, 0);
  for (let i = 0; i < 3; i++) {
    const s = Math.ceil(C * (0.06 + i * 0.02));
    const [c, x] = canvasFor(s, s);
    crumbs(x, pen, { x: s * 0.3, y: s * 0.3, w: s * 0.4, h: s * 0.4 }, palette.spark, 3, s * 0.28);
    crumbs(
      x,
      pen,
      { x: s * 0.4, y: s * 0.4, w: s * 0.2, h: s * 0.2 },
      palette.fire.core,
      2,
      s * 0.18,
    );
    out.push(tex(K.spark(i), c));
  }
  {
    const s = Math.ceil(C * 0.6);
    const [c, x] = canvasFor(s, s);
    smudge(x, pen, s / 2, s / 2, s * 0.42, palette.smoke, 0.75);
    smudge(x, pen, s * 0.42, s * 0.45, s * 0.22, mix(palette.smoke, palette.chalk, 0.3), 0.5);
    out.push(tex(K.smoke, c));
  }
  {
    const s = Math.ceil(C * 0.32);
    const [c, x] = canvasFor(s, s);
    smudge(x, pen, s / 2, s / 2, s * 0.42, palette.ground.light, 0.8, 0.7);
    crumbs(
      x,
      pen,
      { x: s * 0.2, y: s * 0.3, w: s * 0.6, h: s * 0.4 },
      palette.forest.fern,
      5,
      s * 0.05,
    );
    out.push(tex(K.dust, c));
  }
  {
    const s = Math.ceil(C * 0.3);
    const [c, x] = canvasFor(s, s);
    smudge(x, pen, s / 2, s / 2, s * 0.4, palette.wind, 0.55);
    out.push(tex(K.breath, c));
  }
  const leafCols = [palette.forest.fern, palette.ground.light, palette.forest.firLight];
  for (let i = 0; i < 3; i++) {
    const s = Math.ceil(C * 0.16);
    const [c, x] = canvasFor(s, s);
    const leaf = blob(pen.rng, s * 0.8, s * 0.36, {
      cx: s / 2,
      cy: s / 2,
      irregularity: 0.1,
      points: 8,
      rot: 0.4,
    });
    pastelFill(x, pen, leaf, leafCols[i], 0.4, 1.3, {
      stroke: Math.max(1.5, s * 0.14),
      under: 0.8,
      cross: 0.2,
    });
    chalkLine(
      x,
      pen,
      [
        { x: s * 0.18, y: s * 0.62 },
        { x: s * 0.8, y: s * 0.38 },
      ],
      Math.max(0.8, s * 0.04),
      palette.chalk,
      false,
      0.5,
    );
    out.push(tex(K.leaf(i), c));
  }
  {
    const s = Math.ceil(C * 1.6);
    const [c, x] = canvasFor(s, s);
    smudge(x, pen, s / 2, s / 2, s * 0.48, palette.glow, 0.95);
    smudge(x, pen, s / 2, s / 2, s * 0.25, palette.fire.mid, 0.6);
    out.push(tex(K.glow, c));
  }
  {
    const s = Math.ceil(C * 0.9);
    const [c, x] = canvasFor(s, s);
    smudge(x, pen, s / 2, s / 2, s * 0.46, palette.ember.hot, 0.9);
    out.push(tex(K.glowEmber, c));
  }
  {
    const w = Math.ceil(C * 0.9);
    const h = Math.ceil(C * 0.36);
    const [c, x] = canvasFor(w, h);
    smudge(x, pen, w / 2, h / 2, w * 0.45, palette.paper, 0.85, h / w);
    out.push(tex(K.shadow, c));
  }
  return out;
}
