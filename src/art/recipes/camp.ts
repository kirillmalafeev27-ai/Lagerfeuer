// Лагерь: поленница (7.5.8), палатка с фонарём и колбасками (7.5.9).

import { look } from '../../config/look.ts';
import { mix, palette } from '../../config/palette.ts';
import { K, boil } from '../manifest.ts';
import {
  type Pen,
  type Pt,
  blob,
  boilVariants,
  chalkLine,
  makePen,
  pastelFill,
  pastelStroke,
  sgraffito,
  smudge,
  scratches,
} from '../../shared/pastelKit.ts';
import { type RC, type Tex, canvasFor, ellipsePts, roundRectPts, tex } from './common.ts';

/** Торец полена (поленница видна торцами). */
function logEnd(
  x: CanvasRenderingContext2D,
  pen: Pen,
  cx: number,
  cy: number,
  r: number,
  kind: 'birch' | 'oak',
): void {
  if (kind === 'birch') {
    const b = palette.birch;
    const rim = ellipsePts(cx, cy, r, r * 0.92, 14);
    pastelFill(x, pen, rim, b.bark, 0.3, 1.3, {
      stroke: Math.max(2, r * 0.3),
      under: 0.85,
      cross: 0.2,
    });
    // Чёрточки на коре по краю.
    for (let i = 0; i < 3; i++) {
      const a = pen.rng() * Math.PI * 2;
      pastelStroke(
        x,
        pen,
        [
          { x: cx + Math.cos(a) * r * 0.85, y: cy + Math.sin(a) * r * 0.8 },
          { x: cx + Math.cos(a + 0.3) * r * 0.95, y: cy + Math.sin(a + 0.3) * r * 0.9 },
        ],
        Math.max(1.2, r * 0.18),
        b.mark,
        1,
        { taper: 0.4 },
      );
    }
    const inner = ellipsePts(cx + r * 0.04, cy + r * 0.02, r * 0.72, r * 0.66, 12);
    pastelFill(x, pen, inner, b.inner, -0.5, 1.2, {
      stroke: Math.max(1.6, r * 0.22),
      under: 0.85,
      cross: 0.2,
    });
    chalkLine(
      x,
      pen,
      ellipsePts(cx, cy, r, r * 0.92, 12).slice(6, 12),
      Math.max(1, r * 0.1),
      palette.chalk,
      false,
      0.6,
    );
  } else {
    const o = palette.oak;
    const rim = ellipsePts(cx, cy, r, r * 0.92, 14);
    pastelFill(x, pen, rim, o.bark, 0.3, 1.3, {
      stroke: Math.max(2, r * 0.3),
      under: 0.85,
      cross: 0.2,
    });
    const inner = ellipsePts(cx + r * 0.03, cy + r * 0.02, r * 0.78, r * 0.72, 12);
    pastelFill(x, pen, inner, o.end, -0.5, 1.2, {
      stroke: Math.max(1.6, r * 0.22),
      under: 0.85,
      cross: 0.2,
    });
    for (let k = 1; k <= 3; k++) {
      const ring = ellipsePts(
        cx + r * 0.05,
        cy + r * 0.03,
        r * 0.72 * (k / 4),
        r * 0.66 * (k / 4),
        10,
      );
      pastelStroke(x, pen, ring.concat([ring[0]]), Math.max(1, r * 0.08), o.ring, 0.9, {
        taper: 0,
      });
    }
    sgraffito(
      x,
      pen,
      [
        [
          { x: cx, y: cy },
          { x: cx + r * 0.6, y: cy - r * 0.3 },
        ],
      ],
      Math.max(1, r * 0.06),
    );
  }
}

const PILE_W = () => look.pile.w;
const PILE_H = () => look.pile.h;

/** Половина поленницы: торцы, уложенные пирамидкой. */
function pileHalf(rc: RC, kind: 'birch' | 'oak'): HTMLCanvasElement[] {
  const C = rc.C;
  const W = Math.ceil((C * PILE_W()) / 2 + C * 0.1);
  const H = Math.ceil(C * PILE_H() * 0.8);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, H);
      const r = kind === 'birch' ? C * 0.085 : C * 0.12;
      const rows = kind === 'birch' ? [4, 3, 2] : [3, 2, 1];
      const baseY = H - C * 0.12;
      smudge(x, pen, W / 2, baseY, W * 0.45, palette.paper, 0.6, 0.35);
      rows.forEach((n, row) => {
        for (let i = 0; i < n; i++) {
          const cx = W / 2 + (i - (n - 1) / 2) * r * 2.02 + (pen.rng() - 0.5) * r * 0.15;
          const cy = baseY - r - row * r * 1.7 + (pen.rng() - 0.5) * r * 0.1;
          logEnd(x, pen, cx, cy, r * (0.92 + pen.rng() * 0.12), kind);
        }
      });
      return c;
    },
    rc.seed * 23 + (kind === 'birch' ? 1 : 2),
    3,
    C * 0.008,
  );
}

/** Пенёк с топором (уровень 1, вместо дуба). */
function stumpTex(rc: RC): HTMLCanvasElement[] {
  const C = rc.C;
  const W = Math.ceil(C * 0.72);
  const H = Math.ceil(C * 0.7);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, H);
      const f = palette.forest;
      const baseY = H - C * 0.12;
      smudge(x, pen, W / 2, baseY, W * 0.42, palette.paper, 0.6, 0.35);
      const body = roundRectPts(pen, W / 2 - C * 0.2, baseY - C * 0.3, C * 0.4, C * 0.3, C * 0.06);
      pastelFill(x, pen, body, f.trunk, -1.4, 1.2, {
        stroke: C * 0.05,
        under: 0.7,
        tones: [f.trunk, mix(f.trunk, palette.chalk, 0.15)],
      });
      sgraffito(
        x,
        pen,
        scratches(pen, body, 8, C * 0.18, Math.PI / 2, 0.15),
        Math.max(1, C * 0.01),
      );
      const top = ellipsePts(W / 2, baseY - C * 0.3, C * 0.2, C * 0.07, 14);
      pastelFill(x, pen, top, palette.ground.light, 0.3, 1.2, {
        stroke: C * 0.04,
        under: 0.8,
        cross: 0.2,
      });
      pastelStroke(
        x,
        pen,
        ellipsePts(W / 2, baseY - C * 0.3, C * 0.1, C * 0.035, 10).concat([
          { x: W / 2 + C * 0.1, y: baseY - C * 0.3 },
        ]),
        Math.max(1, C * 0.01),
        palette.ground.dark,
        0.8,
        { taper: 0 },
      );
      // Топор: топорище и обух.
      pastelStroke(
        x,
        pen,
        [
          { x: W / 2 + C * 0.02, y: baseY - C * 0.33 },
          { x: W / 2 + C * 0.22, y: baseY - C * 0.55 },
        ],
        C * 0.04,
        palette.ground.light,
        1,
        { taper: 0.1 },
      );
      const head = roundRectPts(
        pen,
        W / 2 - C * 0.1,
        baseY - C * 0.42,
        C * 0.16,
        C * 0.1,
        C * 0.02,
      );
      pastelFill(x, pen, head, palette.stone.light, 0.2, 1.3, {
        stroke: C * 0.03,
        under: 0.8,
        tones: [palette.stone.light, palette.stone.base],
      });
      chalkLine(x, pen, head.slice(0, 6), Math.max(1, C * 0.01), palette.chalk, false, 0.7);
      return c;
    },
    rc.seed * 29 + 7,
    3,
    C * 0.008,
  );
}

/** Подставка поленницы. */
function pileBase(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil(C * PILE_W() + C * 0.2);
  const H = Math.ceil(C * 0.32);
  const [c, x] = canvasFor(W, H);
  const pen = makePen(rc.seed * 31 + 5, 0, 0);
  const f = palette.forest;
  smudge(x, pen, W / 2, H * 0.6, W * 0.48, palette.paper, 0.7, 0.3);
  const plank = roundRectPts(pen, C * 0.08, H * 0.45, W - C * 0.16, H * 0.3, C * 0.04);
  pastelFill(x, pen, plank, f.trunk, -0.1, 1.2, {
    stroke: C * 0.05,
    under: 0.75,
    tones: [f.trunk, mix(f.trunk, palette.chalk, 0.18)],
  });
  sgraffito(x, pen, scratches(pen, plank, 6, C * 0.3, 0, 0.05), Math.max(1, C * 0.01));
  for (const px of [C * 0.14, W / 2, W - C * 0.14]) {
    const post = roundRectPts(pen, px - C * 0.04, H * 0.05, C * 0.08, H * 0.75, C * 0.02);
    pastelFill(x, pen, post, f.trunk, -1.4, 1.2, { stroke: C * 0.04, under: 0.8 });
    chalkLine(
      x,
      pen,
      [
        { x: px - C * 0.04, y: H * 0.08 },
        { x: px - C * 0.04, y: H * 0.72 },
      ],
      Math.max(1, C * 0.01),
      palette.chalk,
      false,
      0.5,
    );
  }
  return c;
}

/** Дощечка с надписью «Birke» / «Eiche» шрифтом Rubik Scribble: светлая доска, тёмные буквы. */
function sign(rc: RC, text: string): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil(C * 0.62);
  const H = Math.ceil(C * 0.42);
  const [c, x] = canvasFor(W, H);
  const pen = makePen(rc.seed * 37 + text.length, 0, 0);
  const g = palette.ground;
  pastelStroke(
    x,
    pen,
    [
      { x: W / 2, y: H * 0.97 },
      { x: W / 2, y: H * 0.45 },
    ],
    C * 0.045,
    palette.forest.trunk,
    1,
    { taper: 0.1 },
  );
  const board = roundRectPts(pen, C * 0.03, H * 0.05, W - C * 0.06, H * 0.52, C * 0.035);
  const wood = mix(g.light, palette.chalk, 0.5);
  pastelFill(x, pen, board, wood, 0.04, 1.2, {
    stroke: C * 0.05,
    under: 0.95,
    cross: 0.15,
    tones: [wood, mix(wood, g.light, 0.45), wood],
  });
  sgraffito(x, pen, scratches(pen, board, 3, C * 0.3, 0, 0.04), Math.max(1, C * 0.008), g.light);
  chalkLine(x, pen, board, Math.max(1.2, C * 0.012), g.dark, true, 0.9);
  // Rubik Scribble с обводкой тем же цветом: каракули становятся плотнее и читаются мелко.
  const fs = Math.round(C * 0.19);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.save();
  x.translate(W / 2, H * 0.33);
  x.rotate(-0.03);
  x.font = `${fs}px "Rubik Scribble", "Rubik", sans-serif`;
  x.fillStyle = palette.cardInk;
  x.strokeStyle = palette.cardInk;
  x.lineJoin = 'round';
  x.lineWidth = Math.max(1.4, C * 0.016);
  x.strokeText(text, 0, 0);
  x.fillText(text, 0, 0);
  x.restore();
  return c;
}

/** Светящийся меловой обвод выбранной половины: только контур с мягким свечением. */
function pileGlow(rc: RC, kind: 'birch' | 'oak'): HTMLCanvasElement {
  const C = rc.C;
  const W = Math.ceil((C * PILE_W()) / 2 + C * 0.3);
  const H = Math.ceil(C * PILE_H() * 0.8 + C * 0.2);
  const [c, x] = canvasFor(W, H);
  const pen = makePen(rc.seed * 41 + (kind === 'birch' ? 1 : 2), 0, 0);
  const shape = blob(pen.rng, W * 0.84, H * 0.76, {
    cx: W / 2,
    cy: H * 0.56,
    irregularity: 0.05,
    points: 12,
  });
  x.save();
  x.shadowColor = palette.chalk;
  x.shadowBlur = C * 0.08;
  chalkLine(x, pen, shape, Math.max(2, C * 0.028), palette.chalk, true, 1);
  x.restore();
  chalkLine(x, pen, shape, Math.max(1.4, C * 0.016), palette.chalk, true, 0.9);
  return c;
}

export function drawPile(rc: RC): Tex[] {
  const out: Tex[] = [];
  out.push(tex(K.pileBase, pileBase(rc), 0.5, 0.6));
  pileHalf(rc, 'birch').forEach((c, v) =>
    out.push(tex(boil(K.pileBirch, v), c, 0.5, 1 - (rc.C * 0.12) / c.height)),
  );
  pileHalf(rc, 'oak').forEach((c, v) =>
    out.push(tex(boil(K.pileOak, v), c, 0.5, 1 - (rc.C * 0.12) / c.height)),
  );
  stumpTex(rc).forEach((c, v) =>
    out.push(tex(boil(K.pileStump, v), c, 0.5, 1 - (rc.C * 0.12) / c.height)),
  );
  out.push(tex(K.signBirch, sign(rc, 'Birke'), 0.5, 0.95, 0));
  out.push(tex(K.signOak, sign(rc, 'Eiche'), 0.5, 0.95, 0));
  out.push(tex(K.pileGlowBirch, pileGlow(rc, 'birch'), 0.5, 0.6, 0));
  out.push(tex(K.pileGlowOak, pileGlow(rc, 'oak'), 0.5, 0.6, 0));
  return out;
}

// ── Палатка ─────────────────────────────────────────────────────────

function tentTex(rc: RC): HTMLCanvasElement[] {
  const C = rc.C;
  const W = Math.ceil(C * look.tent.w + C * 0.2);
  const H = Math.ceil(C * look.tent.h + C * 0.15);
  const t = palette.tent;
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, H);
      const baseY = H - C * 0.1;
      const cx = W / 2;
      const apex = { x: cx + C * 0.02, y: C * 0.12 };
      const left = { x: C * 0.12, y: baseY };
      const right = { x: W - C * 0.12, y: baseY };
      smudge(x, pen, cx, baseY, W * 0.48, palette.paper, 0.75, 0.25);
      // Левый скат (в тени) и правый (на свету).
      pastelFill(x, pen, [apex, right, { x: cx + C * 0.1, y: baseY }], t.shade, -1.0, 1.2, {
        stroke: C * 0.06,
        under: 0.75,
        tones: [t.shade, mix(t.shade, palette.paper, 0.25)],
      });
      pastelFill(x, pen, [apex, { x: cx + C * 0.1, y: baseY }, left], t.canvas, -0.9, 1.2, {
        stroke: C * 0.06,
        under: 0.75,
        tones: [t.canvas, mix(t.canvas, palette.chalk, 0.15), t.canvas],
      });
      // Вход — тёмный треугольник.
      const door: Pt[] = [
        { x: apex.x - C * 0.02, y: apex.y + C * 0.35 },
        { x: cx + C * 0.28, y: baseY },
        { x: cx - C * 0.16, y: baseY },
      ];
      pastelFill(x, pen, door, palette.paper, -0.5, 1.2, {
        stroke: C * 0.05,
        under: 0.95,
        tones: [palette.paper, mix(palette.paper, t.shade, 0.2)],
      });
      // Заплатки.
      const patch1 = roundRectPts(pen, C * 0.34, baseY - C * 0.45, C * 0.2, C * 0.16, C * 0.02);
      pastelFill(x, pen, patch1, t.patch, -0.3, 1.2, { stroke: C * 0.04, under: 0.85 });
      chalkLine(x, pen, patch1, Math.max(1, C * 0.008), palette.chalk, true, 0.6);
      const patch2 = roundRectPts(
        pen,
        cx + C * 0.32,
        baseY - C * 0.62,
        C * 0.14,
        C * 0.12,
        C * 0.02,
      );
      pastelFill(x, pen, patch2, mix(t.patch, palette.chalk, 0.2), -0.3, 1.2, {
        stroke: C * 0.04,
        under: 0.85,
      });
      // Швы процарапаны.
      sgraffito(
        x,
        pen,
        [
          [apex, { x: cx + C * 0.1, y: baseY }],
          [
            { x: C * 0.3, y: baseY - C * 0.2 },
            { x: cx - C * 0.05, y: baseY - C * 0.28 },
          ],
        ],
        Math.max(1, C * 0.01),
      );
      // Меловой контур.
      chalkLine(x, pen, [left, apex, right], Math.max(1.4, C * 0.016), palette.chalk, false, 0.85);
      // Растяжки и колышки.
      chalkLine(
        x,
        pen,
        [apex, { x: C * 0.02, y: baseY - C * 0.04 }],
        Math.max(1, C * 0.007),
        palette.chalk,
        false,
        0.5,
      );
      chalkLine(
        x,
        pen,
        [apex, { x: W - C * 0.02, y: baseY - C * 0.05 }],
        Math.max(1, C * 0.007),
        palette.chalk,
        false,
        0.5,
      );
      return c;
    },
    rc.seed * 43 + 1,
    3,
    C * 0.01,
  );
}

function lanternTex(rc: RC): HTMLCanvasElement[] {
  const C = rc.C;
  const W = Math.ceil(C * 0.36);
  const H = Math.ceil(C * 1.05);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, H);
      const cx = W / 2;
      // Шест.
      pastelStroke(
        x,
        pen,
        [
          { x: cx, y: H - C * 0.04 },
          { x: cx + 1, y: C * 0.12 },
        ],
        C * 0.04,
        palette.forest.trunk,
        1,
        { taper: 0.05 },
      );
      chalkLine(
        x,
        pen,
        [
          { x: cx - C * 0.02, y: H - C * 0.06 },
          { x: cx - C * 0.015, y: C * 0.14 },
        ],
        Math.max(1, C * 0.008),
        palette.chalk,
        false,
        0.5,
      );
      // Перекладина и фонарь.
      pastelStroke(
        x,
        pen,
        [
          { x: cx, y: C * 0.14 },
          { x: cx + C * 0.12, y: C * 0.16 },
        ],
        C * 0.03,
        palette.forest.trunk,
        1,
        { taper: 0.1 },
      );
      const lx = cx + C * 0.1;
      const ly = C * 0.3;
      smudge(x, pen, lx, ly, C * 0.16, palette.tent.lantern, 0.55);
      const glass = roundRectPts(pen, lx - C * 0.055, ly - C * 0.08, C * 0.11, C * 0.15, C * 0.03);
      pastelFill(x, pen, glass, palette.tent.lantern, -1.2, 1.3, {
        stroke: C * 0.03,
        under: 0.9,
        tones: [palette.tent.lantern, palette.fire.core],
      });
      chalkLine(x, pen, glass, Math.max(1, C * 0.009), palette.chalk, true, 0.8);
      pastelStroke(
        x,
        pen,
        [
          { x: lx - C * 0.05, y: ly - C * 0.1 },
          { x: lx + C * 0.05, y: ly - C * 0.1 },
        ],
        C * 0.025,
        palette.stone.dark,
        1,
        { taper: 0 },
      );
      return c;
    },
    rc.seed * 47 + 2,
    3,
    C * 0.006,
  );
}

function sausagesTex(rc: RC): HTMLCanvasElement[] {
  const C = rc.C;
  const W = Math.ceil(C * 0.5);
  const H = Math.ceil(C * 0.42);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, H);
      pastelStroke(
        x,
        pen,
        [
          { x: C * 0.04, y: H - C * 0.03 },
          { x: W - C * 0.06, y: C * 0.08 },
        ],
        C * 0.03,
        palette.ground.light,
        1,
        { taper: 0.1 },
      );
      for (let i = 0; i < 3; i++) {
        const t = 0.45 + i * 0.16;
        const sx = C * 0.04 + (W - C * 0.1) * t;
        const sy = H - C * 0.03 - (H - C * 0.11) * t;
        const s = blob(pen.rng, C * 0.13, C * 0.065, {
          cx: sx,
          cy: sy,
          rot: -0.65,
          irregularity: 0.08,
        });
        pastelFill(x, pen, s, palette.sausage, -0.6, 1.3, {
          stroke: C * 0.03,
          under: 0.85,
          tones: [palette.sausage, mix(palette.sausage, palette.chalk, 0.2)],
        });
        chalkLine(x, pen, s.slice(0, 7), Math.max(1, C * 0.007), palette.chalk, false, 0.6);
      }
      return c;
    },
    rc.seed * 53 + 3,
    3,
    C * 0.006,
  );
}

export function drawTent(rc: RC): Tex[] {
  const out: Tex[] = [];
  tentTex(rc).forEach((c, v) =>
    out.push(tex(boil(K.tent, v), c, 0.5, 1 - (rc.C * 0.1) / c.height)),
  );
  lanternTex(rc).forEach((c, v) =>
    out.push(tex(boil(K.lantern, v), c, 0.5, 1 - (rc.C * 0.04) / c.height)),
  );
  sausagesTex(rc).forEach((c, v) => out.push(tex(boil(K.sausages, v), c, 0.1, 0.92)));
  return out;
}
