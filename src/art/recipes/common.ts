// Общее для рецептов: контекст генерации, описание текстуры, мелкие помощники.

import { type Pen, type Pt, ctx2d, makeCanvas } from '../../shared/pastelKit.ts';

export interface RC {
  /** Пикселей текстуры на клетку поляны. */
  C: number;
  /** C / 128: масштаб текстуры относительно единиц мира. */
  res: number;
  seed: number;
}

export interface Tex {
  key: string;
  canvas: HTMLCanvasElement;
  /** Точка привязки спрайта, доли 0..1. */
  ox: number;
  oy: number;
  /** Плотность зерна бумаги, которым фабрика пройдётся по текстуре (0 — без зерна). */
  grain?: number;
}

export function tex(key: string, canvas: HTMLCanvasElement, ox = 0.5, oy = 0.5, grain?: number): Tex {
  return { key, canvas, ox, oy, grain };
}

export function canvasFor(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = makeCanvas(w, h);
  return [c, ctx2d(c)];
}

/** Точка на кривой Безье второго порядка. */
export function quad(a: Pt, b: Pt, c: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
}

/** Точки кривой Безье второго порядка. */
export function quadPts(a: Pt, b: Pt, c: Pt, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(quad(a, b, c, i / n));
  return out;
}

/** Точки кубической кривой Безье. */
export function cubicPts(a: Pt, b: Pt, c: Pt, d: Pt, n = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    });
  }
  return out;
}

/** Эллипс точками. */
export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 28, a0 = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

/** Прямоугольник со скруглёнными, чуть неровными углами. */
export function roundRectPts(pen: Pen, x: number, y: number, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * r + (pen.rng() - 0.5) * 0.6, y: cy + Math.sin(a) * r + (pen.rng() - 0.5) * 0.6 });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}

/** Смещённая и масштабированная копия пути. */
export function xform(path: Pt[], dx: number, dy: number, sx = 1, sy = sx): Pt[] {
  return path.map((p) => ({ x: p.x * sx + dx, y: p.y * sy + dy }));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
