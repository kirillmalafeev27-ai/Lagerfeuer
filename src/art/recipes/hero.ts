// Герой (7.5.10): искатель сокровищ по-ночному — кремовая вязаная шапка с помпоном,
// оранжевый шарф, бирюзовая куртка, тёмно-сливовые штаны, коричневые сапоги.
// Собран из частей, каждая кипит; лицом вправо (влево — зеркально).

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
  crumbs,
  pastelFill,
  pastelStroke,
  sgraffito,
  smudge,
} from '../../shared/pastelKit.ts';
import { drawLogShape } from './firePit.ts';
import { type RC, type Tex, canvasFor, cubicPts, roundRectPts, tex } from './common.ts';

/** Высота героя в пикселях текстуры. */
function heroH(rc: RC): number {
  return rc.C * look.hero.h;
}

/** Суставы в долях роста (от ступней вверх). */
export const HERO_JOINTS = {
  hip: 0.36,
  shoulder: 0.64,
  neck: 0.69,
  hatTop: 0.985,
} as const;

const hc = palette.hero;

function leg(
  x: CanvasRenderingContext2D,
  pen: Pen,
  hip: Pt,
  foot: Pt,
  w: number,
  dark: boolean,
): void {
  const pants = dark ? mix(hc.pants, palette.paper, 0.25) : hc.pants;
  const knee = { x: (hip.x + foot.x) / 2 + w * 0.15, y: (hip.y + foot.y) / 2 };
  pastelStroke(x, pen, [hip, knee, { x: foot.x, y: foot.y - w * 0.7 }], w, pants, 1, {
    taper: 0.05,
  });
  // Сапог носком вперёд (вправо).
  const boot = roundRectPts(pen, foot.x - w * 0.55, foot.y - w * 0.95, w * 1.45, w * 0.95, w * 0.3);
  pastelFill(x, pen, boot, dark ? mix(hc.boots, palette.paper, 0.3) : hc.boots, -0.3, 1.3, {
    stroke: Math.max(2, w * 0.3),
    under: 0.85,
    cross: 0.25,
  });
  if (!dark)
    chalkLine(
      x,
      pen,
      [
        { x: foot.x - w * 0.5, y: foot.y - w * 0.9 },
        { x: foot.x + w * 0.85, y: foot.y - w * 0.75 },
      ],
      Math.max(1, w * 0.1),
      palette.chalk,
      false,
      0.55,
    );
}

function legsTex(rc: RC, hop: boolean): HTMLCanvasElement[] {
  const H = heroH(rc);
  const W = Math.ceil(H * 0.5);
  const LH = Math.ceil(H * HERO_JOINTS.hip + H * 0.04);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, LH);
      const w = H * 0.11;
      const hipY = H * 0.03;
      const footY = LH - 2;
      if (!hop) {
        leg(x, pen, { x: W * 0.43, y: hipY }, { x: W * 0.38, y: footY }, w, true);
        leg(x, pen, { x: W * 0.55, y: hipY }, { x: W * 0.6, y: footY }, w, false);
      } else {
        leg(x, pen, { x: W * 0.43, y: hipY }, { x: W * 0.3, y: footY - H * 0.08 }, w, true);
        leg(x, pen, { x: W * 0.55, y: hipY }, { x: W * 0.68, y: footY - H * 0.11 }, w, false);
      }
      return c;
    },
    rc.seed * 61 + (hop ? 2 : 1),
    3,
    rc.C * 0.008,
  );
}

function bodyTex(rc: RC): HTMLCanvasElement[] {
  const H = heroH(rc);
  const W = Math.ceil(H * 0.66);
  const BH = Math.ceil(H * (HERO_JOINTS.neck - HERO_JOINTS.hip) + H * 0.12);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, BH);
      const cx = W * 0.5;
      const bottom = BH - H * 0.03;
      const top = H * 0.09;
      // Куртка: трапеция с округлыми плечами.
      const jacket: Pt[] = [
        { x: cx - H * 0.15, y: bottom },
        { x: cx - H * 0.17, y: bottom - H * 0.12 },
        { x: cx - H * 0.15, y: top + H * 0.06 },
        { x: cx - H * 0.08, y: top },
        { x: cx + H * 0.08, y: top },
        { x: cx + H * 0.15, y: top + H * 0.06 },
        { x: cx + H * 0.17, y: bottom - H * 0.12 },
        { x: cx + H * 0.15, y: bottom },
      ];
      pastelFill(x, pen, jacket, hc.jacket, -0.9, 1.3, {
        stroke: H * 0.05,
        under: 0.8,
        tones: [hc.jacket, hc.jacket, mix(hc.jacket, palette.chalk, 0.15)],
      });
      const shade: Pt[] = [
        { x: cx - H * 0.15, y: bottom },
        { x: cx - H * 0.17, y: bottom - H * 0.12 },
        { x: cx - H * 0.15, y: top + H * 0.08 },
        { x: cx - H * 0.05, y: top + H * 0.1 },
        { x: cx - H * 0.05, y: bottom },
      ];
      pastelFill(x, pen, shade, hc.jacketDark, -1.2, 1.1, { stroke: H * 0.04, under: 0.5 });
      // Молния и карман процарапаны.
      sgraffito(
        x,
        pen,
        [
          [
            { x: cx + H * 0.02, y: top + H * 0.08 },
            { x: cx + H * 0.03, y: bottom - 2 },
          ],
        ],
        Math.max(1, H * 0.012),
      );
      sgraffito(
        x,
        pen,
        [
          [
            { x: cx + H * 0.06, y: bottom - H * 0.1 },
            { x: cx + H * 0.13, y: bottom - H * 0.1 },
          ],
        ],
        Math.max(1, H * 0.01),
      );
      // Подол.
      pastelStroke(
        x,
        pen,
        [
          { x: cx - H * 0.15, y: bottom - H * 0.02 },
          { x: cx + H * 0.15, y: bottom - H * 0.02 },
        ],
        H * 0.035,
        hc.jacketDark,
        1,
        { taper: 0.1 },
      );
      chalkLine(
        x,
        pen,
        [
          { x: cx + H * 0.08, y: top + 1 },
          { x: cx + H * 0.15, y: top + H * 0.07 },
          { x: cx + H * 0.165, y: bottom - H * 0.12 },
        ],
        Math.max(1.2, H * 0.012),
        palette.chalk,
        false,
        0.7,
      );
      // Шарф: виток вокруг шеи и хвост, летящий назад.
      const wrap = roundRectPts(
        pen,
        cx - H * 0.11,
        top - H * 0.035,
        H * 0.22,
        H * 0.075,
        H * 0.035,
      );
      pastelFill(x, pen, wrap, hc.scarf, -0.2, 1.4, {
        stroke: H * 0.035,
        under: 0.85,
        tones: [hc.scarf, palette.fire.outer, hc.scarf],
      });
      const tail = cubicPts(
        { x: cx - H * 0.06, y: top + H * 0.02 },
        { x: cx - H * 0.14, y: top + H * 0.06 },
        { x: cx - H * 0.2, y: top + H * 0.02 },
        { x: cx - H * 0.27, y: top + H * 0.08 },
        8,
      );
      pastelStroke(x, pen, tail, H * 0.06, hc.scarf, 1, { taper: 0.4 });
      sgraffito(
        x,
        pen,
        [
          [
            { x: cx - H * 0.08, y: top - H * 0.02 },
            { x: cx - H * 0.07, y: top + H * 0.035 },
          ],
          [
            { x: cx + H * 0.03, y: top - H * 0.025 },
            { x: cx + H * 0.035, y: top + H * 0.035 },
          ],
        ],
        Math.max(1, H * 0.01),
      );
      chalkLine(x, pen, wrap.slice(0, 8), Math.max(1, H * 0.01), palette.chalk, false, 0.6);
      return c;
    },
    rc.seed * 67 + 1,
    3,
    rc.C * 0.008,
  );
}

function headTex(rc: RC, yawn: boolean): HTMLCanvasElement[] {
  const H = heroH(rc);
  const W = Math.ceil(H * 0.46);
  const HH = Math.ceil(H * (HERO_JOINTS.hatTop - HERO_JOINTS.neck) + H * 0.06);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, HH);
      const cx = W * 0.5;
      const neckY = HH - H * 0.02;
      const r = H * 0.125;
      const fy = neckY - r * 0.95;
      // Лицо.
      const face = blob(pen.rng, r * 2.05, r * 1.9, {
        cx: cx + r * 0.08,
        cy: fy,
        irregularity: 0.04,
        points: 12,
      });
      pastelFill(x, pen, face, hc.skin, -0.6, 1.3, {
        stroke: H * 0.035,
        under: 0.85,
        tones: [hc.skin, hc.skin, mix(hc.skin, palette.chalk, 0.2)],
      });
      const cheekShade = blob(pen.rng, r * 1.1, r * 0.9, {
        cx: cx - r * 0.45,
        cy: fy + r * 0.2,
        irregularity: 0.15,
      });
      pastelFill(x, pen, cheekShade, mix(hc.skin, hc.boots, 0.25), -1, 0.9, {
        stroke: H * 0.03,
        under: 0.3,
      });
      // Румянец на морозе.
      smudge(
        x,
        pen,
        cx + r * 0.35,
        fy + r * 0.38,
        r * 0.3,
        mix(hc.skin, hc.scarf, 0.45),
        0.45,
        0.8,
      );
      // Глаз, нос, рот.
      const eye = blob(pen.rng, r * 0.22, r * 0.3, {
        cx: cx + r * 0.55,
        cy: fy + r * 0.04,
        irregularity: 0.05,
      });
      pastelFill(x, pen, eye, palette.cardInk, 0, 1.4, {
        stroke: Math.max(1.5, r * 0.12),
        under: 1,
      });
      crumbs(
        x,
        pen,
        { x: cx + r * 0.6, y: fy - r * 0.04, w: 1, h: 1 },
        palette.chalk,
        1,
        Math.max(1, r * 0.06),
      );
      pastelStroke(
        x,
        pen,
        [
          { x: cx + r * 0.95, y: fy + r * 0.05 },
          { x: cx + r * 1.12, y: fy + r * 0.2 },
          { x: cx + r * 0.92, y: fy + r * 0.28 },
        ],
        Math.max(1.5, r * 0.14),
        mix(hc.skin, hc.boots, 0.35),
        1,
        { taper: 0.3 },
      );
      if (yawn) {
        const mouth = blob(pen.rng, r * 0.32, r * 0.42, {
          cx: cx + r * 0.6,
          cy: fy + r * 0.55,
          irregularity: 0.08,
        });
        pastelFill(x, pen, mouth, palette.cardInk, 0, 1.3, {
          stroke: Math.max(1.5, r * 0.12),
          under: 1,
        });
      } else {
        pastelStroke(
          x,
          pen,
          [
            { x: cx + r * 0.42, y: fy + r * 0.5 },
            { x: cx + r * 0.62, y: fy + r * 0.58 },
            { x: cx + r * 0.78, y: fy + r * 0.48 },
          ],
          Math.max(1.2, r * 0.09),
          palette.cardInk,
          0.9,
          { taper: 0.3 },
        );
      }
      chalkLine(
        x,
        pen,
        face.filter((p) => p.x > cx + r * 0.2),
        Math.max(1, H * 0.01),
        palette.chalk,
        false,
        0.55,
      );
      // Вязаная шапка.
      const hatTop = H * 0.02;
      const hat: Pt[] = [
        ...cubicPts(
          { x: cx - r * 1.12, y: fy - r * 0.45 },
          { x: cx - r * 1.2, y: hatTop + r * 0.1 },
          { x: cx + r * 0.2, y: hatTop - r * 0.2 },
          { x: cx + r * 1.15, y: fy - r * 0.6 },
          10,
        ),
        { x: cx + r * 1.2, y: fy - r * 0.32 },
        { x: cx - r * 1.15, y: fy - r * 0.15 },
      ];
      pastelFill(x, pen, hat, hc.hat, -1.25, 1.35, {
        stroke: H * 0.035,
        under: 0.85,
        tones: [hc.hat, mix(hc.hat, hc.boots, 0.12), hc.hat],
      });
      // Отворот с резинкой.
      const brim: Pt[] = [
        { x: cx - r * 1.2, y: fy - r * 0.58 },
        { x: cx + r * 1.22, y: fy - r * 0.74 },
        { x: cx + r * 1.26, y: fy - r * 0.32 },
        { x: cx - r * 1.2, y: fy - r * 0.14 },
      ];
      pastelFill(x, pen, brim, mix(hc.hat, palette.chalk, 0.25), 0, 1.3, {
        stroke: H * 0.03,
        under: 0.85,
      });
      // Резинка отворота — тонкие кремовые рубчики, а не чёрные прорези.
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const bx = cx - r * 1.1 + t * r * 2.28;
        const by0 = fy - r * 0.56 - t * r * 0.15;
        pastelStroke(
          x,
          pen,
          [
            { x: bx, y: by0 },
            { x: bx + 0.5, y: by0 + r * 0.36 },
          ],
          Math.max(1, H * 0.008),
          mix(hc.hat, hc.boots, 0.35),
          0.8,
          { taper: 0.2 },
        );
      }
      chalkLine(x, pen, hat.slice(0, 11), Math.max(1.2, H * 0.012), palette.chalk, false, 0.75);
      return c;
    },
    rc.seed * 71 + (yawn ? 2 : 1),
    3,
    rc.C * 0.008,
  );
}

function pompomTex(rc: RC): HTMLCanvasElement {
  const H = heroH(rc);
  const s = Math.ceil(H * 0.14);
  const [c, x] = canvasFor(s, s);
  const pen = boilPen(rc.seed * 73);
  const p = blob(pen.rng, s * 0.82, s * 0.78, {
    cx: s / 2,
    cy: s / 2,
    irregularity: 0.18,
    points: 10,
  });
  pastelFill(x, pen, p, hc.pompom, -0.7, 1.4, {
    stroke: Math.max(2, s * 0.18),
    under: 0.9,
    tones: [hc.pompom, hc.hat],
  });
  crumbs(x, pen, { x: s * 0.15, y: s * 0.15, w: s * 0.7, h: s * 0.7 }, hc.pompom, 8, s * 0.06);
  chalkLine(x, pen, p.slice(0, 7), Math.max(1, s * 0.05), palette.chalk, false, 0.7);
  return c;
}

function boilPen(seed: number): Pen {
  return makePen(seed, 0, 0);
}

function armTex(rc: RC): HTMLCanvasElement[] {
  const H = heroH(rc);
  const W = Math.ceil(H * 0.14);
  const AH = Math.ceil(H * 0.3);
  return boilVariants(
    (pen) => {
      const [c, x] = canvasFor(W, AH);
      const cx = W / 2;
      const w = H * 0.085;
      pastelStroke(
        x,
        pen,
        [
          { x: cx, y: w * 0.5 },
          { x: cx + 1, y: AH * 0.45 },
          { x: cx, y: AH - w * 1.1 },
        ],
        w,
        hc.jacket,
        1,
        { taper: 0.05 },
      );
      chalkLine(
        x,
        pen,
        [
          { x: cx + w * 0.42, y: w * 0.6 },
          { x: cx + w * 0.4, y: AH - w * 1.3 },
        ],
        Math.max(1, H * 0.009),
        palette.chalk,
        false,
        0.55,
      );
      // Варежка (кремовая, как шапка).
      const mitt = blob(pen.rng, w * 1.15, w * 1.0, { cx, cy: AH - w * 0.6, irregularity: 0.1 });
      pastelFill(x, pen, mitt, hc.hat, -0.5, 1.3, { stroke: Math.max(2, w * 0.3), under: 0.85 });
      sgraffito(
        x,
        pen,
        [
          [
            { x: cx - w * 0.4, y: AH - w * 1.0 },
            { x: cx + w * 0.4, y: AH - w * 1.0 },
          ],
        ],
        Math.max(1, H * 0.008),
      );
      return c;
    },
    rc.seed * 79 + 1,
    3,
    rc.C * 0.006,
  );
}

function carryTex(rc: RC, what: 'birch2' | 'birch1' | 'oak'): HTMLCanvasElement[] {
  const H = heroH(rc);
  const C = rc.C;
  return boilVariants(
    (pen) => {
      if (what === 'oak') {
        const [c, x] = canvasFor(C * 0.62, C * 0.3);
        drawLogShape(x, pen, c.width / 2, c.height / 2, C * 0.5, C * 0.19, 'oak');
        return c;
      }
      const n = what === 'birch2' ? 2 : 1;
      const [c, x] = canvasFor(C * 0.56, C * (0.14 + 0.13 * n));
      for (let i = 0; i < n; i++)
        drawLogShape(
          x,
          pen,
          c.width / 2 + (i - (n - 1) / 2) * C * 0.04,
          c.height / 2 + (i - (n - 1) / 2) * C * 0.13,
          C * 0.46,
          C * 0.12,
          'birch',
        );
      void H;
      return c;
    },
    rc.seed * 83 + (what === 'oak' ? 3 : what === 'birch2' ? 2 : 1),
    3,
    rc.C * 0.006,
  );
}

function shadowTex(rc: RC): HTMLCanvasElement {
  const C = rc.C;
  const w = Math.ceil(C * 0.62);
  const h = Math.ceil(C * 0.22);
  const [c, x] = canvasFor(w, h);
  smudge(x, boilPen(rc.seed * 89), w / 2, h / 2, w * 0.45, palette.paper, 0.9, h / w);
  return c;
}

export function drawHero(rc: RC): Tex[] {
  const out: Tex[] = [];
  legsTex(rc, false).forEach((c, v) =>
    out.push(tex(boil(K.heroLegs, v), c, 0.5, 0.03 / (c.height / heroH(rc)))),
  );
  legsTex(rc, true).forEach((c, v) =>
    out.push(tex(boil(K.heroLegsHop, v), c, 0.5, 0.03 / (c.height / heroH(rc)))),
  );
  bodyTex(rc).forEach((c, v) =>
    out.push(tex(boil(K.heroBody, v), c, 0.5, 1 - (heroH(rc) * 0.03) / c.height)),
  );
  headTex(rc, false).forEach((c, v) =>
    out.push(tex(boil(K.heroHead, v), c, 0.5, 1 - (heroH(rc) * 0.02) / c.height)),
  );
  headTex(rc, true).forEach((c, v) =>
    out.push(tex(boil(K.heroHeadYawn, v), c, 0.5, 1 - (heroH(rc) * 0.02) / c.height)),
  );
  out.push(tex(K.heroPompom, pompomTex(rc), 0.5, 0.7));
  armTex(rc).forEach((c, v) =>
    out.push(tex(boil(K.heroArm, v), c, 0.5, (heroH(rc) * 0.085 * 0.5) / c.height)),
  );
  carryTex(rc, 'birch2').forEach((c, v) => out.push(tex(boil(K.heroCarryBirch2, v), c)));
  carryTex(rc, 'birch1').forEach((c, v) => out.push(tex(boil(K.heroCarryBirch1, v), c)));
  carryTex(rc, 'oak').forEach((c, v) => out.push(tex(boil(K.heroCarryOak, v), c)));
  out.push(tex(K.heroShadow, shadowTex(rc)));
  return out;
}
