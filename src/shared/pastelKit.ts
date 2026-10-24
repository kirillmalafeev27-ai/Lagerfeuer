// Пастельный кит серии (раздел 7.4): масляная пастель на чёрной бумаге средствами Canvas 2D.
// Каждая форма — густые восковые штрихи; сквозь зерно бумаги просвечивает чёрное; контур —
// светлая неровная линия мелом. Вся случайность — сидированная.

import { type Rng, mulberry32 } from './rng.ts';

export { mulberry32 };
export type { Rng };

export interface Pt {
  x: number;
  y: number;
}

/** Набор кистей рисунка: rng — устройство формы (одинаково во всех вариантах кипения),
 *  jit — дрожание штрихов (своё у каждого варианта), amp — амплитуда дрожания, px. */
export interface Pen {
  rng: Rng;
  jit: Rng;
  amp: number;
}

export function makePen(seed: number, variant = 0, amp = 0): Pen {
  return { rng: mulberry32(seed), jit: mulberry32((seed ^ 0x9e3779b9) + variant * 7919 + 1), amp };
}

// ── Канвы и общий конфиг ───────────────────────────────────────────

export interface KitConfig {
  /** Цвет бумаги — им процарапывают и им «вытирают» в масках. */
  paper: string;
  /** Плотность зерна: доля «ямок» бумаги, куда пастель не ложится, при среднем нажиме. */
  tooth: number;
  /** Масштаб: пикселей текстуры на условную единицу 128 (1 или 0.75 на низком качестве). */
  res: number;
  /** Насколько глубоко ямка бумаги стирает пастель (1 — до чёрного). */
  toothDepth: number;
}

const kit: KitConfig = { paper: '#15131c', tooth: 0.06, res: 1, toothDepth: 0.55 };

export function configureKit(c: Partial<KitConfig>): void {
  Object.assign(kit, c);
  grainCache.clear();
}

export function kitRes(): number {
  return kit.res;
}

export function kitTooth(): number {
  return kit.tooth;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Контекст холста генерации — растр на процессоре (willReadFrequently): тысячи мелких
 * отпечатков, чтение пикселей и toDataURL не ждут видеокарту, а готовая канва потом один раз
 * загружается в WebGL.
 */
const ctxCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
const CTX_OPTS: CanvasRenderingContext2DSettings = { willReadFrequently: true };

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const hit = ctxCache.get(c);
  if (hit) return hit;
  const x = c.getContext('2d', CTX_OPTS);
  if (!x) throw new Error('2d context unavailable');
  ctxCache.set(c, x);
  return x;
}

const scratchPool: HTMLCanvasElement[] = [];

function borrow(w: number, h: number): HTMLCanvasElement {
  const c = scratchPool.pop() ?? document.createElement('canvas');
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (c.width < W || c.height < H) {
    c.width = Math.max(c.width, W);
    c.height = Math.max(c.height, H);
  }
  const x = ctx2d(c);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.clearRect(0, 0, W, H);
  return c;
}

function giveBack(c: HTMLCanvasElement): void {
  if (scratchPool.length < 6) scratchPool.push(c);
}

// ── Геометрия ──────────────────────────────────────────────────────

/** Сглаживание Чайкина. */
export function chaikin(path: Pt[], iterations = 2, closed = true): Pt[] {
  let p = path;
  for (let k = 0; k < iterations; k++) {
    const out: Pt[] = [];
    const n = p.length;
    const last = closed ? n : n - 1;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < last; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

export interface BlobOpts {
  points?: number;
  /** Разброс радиуса, доля (0.12 — по умолчанию). */
  irregularity?: number;
  smooth?: number;
  /** Сдвиг центра. */
  cx?: number;
  cy?: number;
  /** Поворот, радиан. */
  rot?: number;
}

/** Неровная замкнутая форма: точки по эллипсу с разбросом радиуса, сглаживание Чайкина. */
export function blob(rng: Rng, w: number, h: number, opts: BlobOpts = {}): Pt[] {
  const n = opts.points ?? 11;
  const irr = opts.irregularity ?? 0.12;
  const cx = opts.cx ?? 0;
  const cy = opts.cy ?? 0;
  const rot = opts.rot ?? 0;
  const pts: Pt[] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / n) * 0.6;
    const r = 1 + (rng() - 0.5) * 2 * irr;
    const x = Math.cos(a) * (w / 2) * r;
    const y = Math.sin(a) * (h / 2) * r;
    pts.push({
      x: cx + x * Math.cos(rot) - y * Math.sin(rot),
      y: cy + x * Math.sin(rot) + y * Math.cos(rot),
    });
  }
  return chaikin(pts, opts.smooth ?? 2, true);
}

/** Дрожание точек (кипение): не больше amp пикселей. */
export function jitterPath(path: Pt[], jit: Rng, amp: number): Pt[] {
  if (amp <= 0) return path;
  return path.map((p) => ({ x: p.x + (jit() - 0.5) * 2 * amp, y: p.y + (jit() - 0.5) * 2 * amp }));
}

/** Ровный многоугольник/полилиния → путь Canvas. */
export function tracePath(ctx: CanvasRenderingContext2D, path: Pt[], closed = true): void {
  ctx.beginPath();
  if (path.length === 0) return;
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  if (closed) ctx.closePath();
}

export function bbox(path: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Разбить полилинию на точки с шагом step. */
export function resample(path: Pt[], step: number, closed = false): Pt[] {
  const pts = closed ? path.concat([path[0]]) : path;
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.3) out.push(last);
  return out;
}

/** Расширить замкнутую форму от центра на d пикселей (грубо, для «выхода штрихов за контур»). */
export function inflate(path: Pt[], d: number): Pt[] {
  const b = bbox(path);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return path.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * d, y: p.y + (dy / l) * d };
  });
}

// ── Зерно бумаги ───────────────────────────────────────────────────

/** Значение шума в узлах решётки (бесшовно по периоду). */
function valueNoiseTile(rng: Rng, size: number, cell: number): Float32Array {
  const g = Math.max(1, Math.round(size / cell));
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * g;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const r0 = (y0 % g) * g;
    const r1 = ((y0 + 1) % g) * g;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * g;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const c0 = x0 % g;
      const c1 = (x0 + 1) % g;
      const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
      const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

/** Поле зерна 0..1: мелкие крупинки 1–2 px поверх едва заметной волокнистости. */
function grainField(rng: Rng, size: number): Float32Array {
  const fine = valueNoiseTile(rng, size, 1.6);
  const mid = valueNoiseTile(rng, size, 3.5);
  const fib = valueNoiseTile(rng, size, 9);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = fine[i] * 0.55 + mid[i] * 0.3 + fib[i] * 0.15;
  return out;
}

const grainCache = new Map<string, HTMLCanvasElement>();

/**
 * Маска «ямок» бумаги: непрозрачные пиксели там, куда пастель не ложится.
 * density — доля ямок (0..1). Кэшируется.
 */
export function grainMask(density: number, size = 128, seed = 77): HTMLCanvasElement {
  const d = Math.round(Math.max(0, Math.min(0.95, density)) * 40) / 40;
  const key = `${d}|${size}|${seed}`;
  const hit = grainCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const x = ctx2d(c);
  const field = grainField(mulberry32(seed), size);
  // Порог по квантилю: ровно доля d пикселей становится ямками, край ямки мягкий.
  const sorted = Array.from(field).sort((a, b) => a - b);
  const th = sorted[Math.min(sorted.length - 1, Math.floor(d * sorted.length))];
  const img = x.createImageData(size, size);
  const soft = 0.035;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    const a = v < th - soft ? 1 : v > th + soft ? 0 : (th + soft - v) / (2 * soft);
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  grainCache.set(key, c);
  return c;
}

const patternCache = new WeakMap<HTMLCanvasElement, CanvasPattern>();

function patternFor(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement): CanvasPattern | null {
  const hit = patternCache.get(mask);
  if (hit) return hit;
  const p = ctx.createPattern(mask, 'repeat');
  if (p) patternCache.set(mask, p);
  return p;
}

/** Пройтись зерном по всей канве текстуры: бумага просвечивает сквозь пастель. */
export function grainPass(c: HTMLCanvasElement, rng: Rng, density = kit.tooth): void {
  applyGrain(ctx2d(c), rng, 0, 0, c.width, c.height, density);
}

/** Пройтись зерном по канве: стереть пастель в ямках бумаги. */
export function applyGrain(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  density: number,
): void {
  if (density <= 0.001) return;
  const mask = grainMask(density);
  const pat = patternFor(ctx, mask);
  if (!pat) return;
  const ox = Math.floor(rng() * mask.width);
  const oy = Math.floor(rng() * mask.height);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = kit.toothDepth;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pat;
  ctx.fillRect(x + ox, y + oy, w, h);
  ctx.restore();
}

/** Бесшовная текстура зерна чёрной бумаги: россыпь крупинок, за которые цепляется пастель. */
export function toothTile(rng: Rng, size: number, base: string, tooth: string): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const x = ctx2d(c);
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  const field = grainField(rng, size);
  const [tr, tg, tb] = hexRgb(tooth);
  const [br, bg, bb] = hexRgb(base);
  const img = x.getImageData(0, 0, size, size);
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    // Светлые крупинки — вершины зерна; тёмные — ямки.
    let t = 0;
    if (v > 0.62) t = Math.min(1, (v - 0.62) / 0.2) * 0.9;
    else if (v < 0.3) t = -Math.min(1, (0.3 - v) / 0.2) * 0.35;
    const k = Math.abs(t);
    const tr2 = t >= 0 ? tr : br * 0.6;
    const tg2 = t >= 0 ? tg : bg * 0.6;
    const tb2 = t >= 0 ? tb : bb * 0.6;
    img.data[i * 4] = Math.round(br + (tr2 - br) * k);
    img.data[i * 4 + 1] = Math.round(bg + (tg2 - bg) * k);
    img.data[i * 4 + 2] = Math.round(bb + (tb2 - bb) * k);
  }
  x.putImageData(img, 0, 0);
  return c;
}

export function hexRgb(color: string): [number, number, number] {
  const n = parseInt(color.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbaStr(color: string, a: number): string {
  const [r, g, b] = hexRgb(color);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Кисти: штампы восковых мазков ──────────────────────────────────

export type BrushKind = 'wax' | 'chalk' | 'scribble';

interface BrushDef {
  /** Отпечатки кисти: белые, с альфой; ширина — поперёк штриха. */
  dabs: HTMLCanvasElement[];
  w: number;
  h: number;
}

const brushes = new Map<BrushKind, BrushDef>();
const tinted = new Map<string, HTMLCanvasElement[]>();

/** Профиль волокон поперёк штриха: общий для всех отпечатков кисти — полосы тянутся вдоль штриха. */
function fiberProfile(rng: Rng, w: number): Float32Array {
  const fib = new Float32Array(w);
  let a = rng();
  for (let i = 0; i < w; i++) {
    a = a * 0.35 + rng() * 0.65;
    fib[i] = a;
  }
  return fib;
}

/** Отпечаток кисти: плотная середина, рваный край, волокна вдоль штриха, зерно. */
function makeDab(
  rng: Rng,
  kind: BrushKind,
  w: number,
  h: number,
  profile: Float32Array,
): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const img = x.createImageData(w, h);
  const fib = new Float32Array(w);
  for (let i = 0; i < w; i++) fib[i] = Math.max(0, Math.min(1, profile[i] + (rng() - 0.5) * 0.18));
  const edgeA = new Float32Array(h);
  const edgeB = new Float32Array(h);
  for (let j = 0; j < h; j++) {
    edgeA[j] = (rng() - 0.5) * (kind === 'chalk' ? 0.34 : 0.22);
    edgeB[j] = (rng() - 0.5) * (kind === 'chalk' ? 0.34 : 0.22);
  }
  const solid = kind === 'wax' ? 0.9 : kind === 'scribble' ? 0.85 : 0.55;
  for (let j = 0; j < h; j++) {
    const v = ((j + 0.5) / h) * 2 - 1;
    for (let i = 0; i < w; i++) {
      const u = ((i + 0.5) / w) * 2 - 1;
      // Рваный край поперёк штриха.
      const lim = 1 + (u < 0 ? edgeA[j] : edgeB[j]);
      const du = Math.abs(u) / lim;
      if (du >= 1) continue;
      const across = 1 - Math.pow(du, kind === 'chalk' ? 1.6 : 3);
      const along = 1 - v * v;
      let alpha = across * Math.sqrt(Math.max(0, along));
      alpha *= 0.25 + fib[i] * fib[i] * 1.25;
      const grain = rng();
      const holes = kind === 'chalk' ? 0.38 : kind === 'scribble' ? 0.1 : 0.07;
      if (grain < holes * (0.5 + du * 1.0)) alpha *= 0.55;
      alpha = Math.min(1, alpha * (solid + 0.35));
      const k = (j * w + i) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 255;
      img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(alpha * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function brush(kind: BrushKind): BrushDef {
  const hit = brushes.get(kind);
  if (hit) return hit;
  const rng = mulberry32(kind === 'wax' ? 11 : kind === 'chalk' ? 23 : 37);
  const w = kind === 'chalk' ? 20 : 28;
  const h = kind === 'chalk' ? 10 : 12;
  const dabs: HTMLCanvasElement[] = [];
  const profile = fiberProfile(rng, w);
  for (let i = 0; i < 5; i++) dabs.push(makeDab(rng, kind, w, h, profile));
  const def = { dabs, w, h };
  brushes.set(kind, def);
  return def;
}

function tintedDabs(kind: BrushKind, color: string): HTMLCanvasElement[] {
  const key = `${kind}|${color}`;
  const hit = tinted.get(key);
  if (hit) return hit;
  const b = brush(kind);
  const out = b.dabs.map((d) => {
    const c = makeCanvas(d.width, d.height);
    const x = ctx2d(c);
    x.drawImage(d, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, d.width, d.height);
    return c;
  });
  tinted.set(key, out);
  return out;
}

/** setTransform поверх текущего преобразования M (а не вместо него). */
function setComposed(
  ctx: CanvasRenderingContext2D,
  M: DOMMatrix,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): void {
  ctx.setTransform(
    M.a * a + M.c * b,
    M.b * a + M.d * b,
    M.a * c + M.c * d,
    M.b * c + M.d * d,
    M.a * e + M.c * f + M.e,
    M.b * e + M.d * f + M.f,
  );
}

export interface StrokeOpts {
  /** Пройтись зерном бумаги после штриха (по умолчанию да; внутри PastelLayer — нет). */
  grain?: boolean;
  /** Кисть: восковая (по умолчанию), меловая или каракулевая. */
  kind?: BrushKind;
  /** Сужение к концам 0..1. */
  taper?: number;
  closed?: boolean;
  /** Шаг отпечатков, доля ширины. */
  spacing?: number;
}

/** Нарисовать штрих отпечатками кисти прямо в контекст. */
function stampStroke(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  path: Pt[],
  width: number,
  color: string,
  pressure: number,
  o: StrokeOpts,
): void {
  if (path.length < 2 || width <= 0) return;
  const kind = o.kind ?? 'wax';
  const b = brush(kind);
  const dabs = tintedDabs(kind, color);
  const spacing = Math.max(0.6, width * (o.spacing ?? 0.4));
  const pts = resample(jitterPath(path, pen.jit, pen.amp), spacing, o.closed ?? false);
  const n = pts.length;
  const taper = o.taper ?? 0.3;
  const sAcross = width / b.w;
  const sAlong = (width * 0.5) / b.h;
  const M = ctx.getTransform();
  ctx.save();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a0 = pts[Math.max(0, i - 1)];
    const a1 = pts[Math.min(n - 1, i + 1)];
    const ang = Math.atan2(a1.y - a0.y, a1.x - a0.x) + (pen.jit() - 0.5) * 0.25;
    const t = n === 1 ? 0.5 : i / (n - 1);
    const tp = taper > 0 ? Math.min(1, Math.min(t, 1 - t) / (taper * 0.5) + 0.25) : 1;
    const sc = tp * (0.88 + pen.jit() * 0.24);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // Отпечаток: «ширина» кисти — поперёк направления штриха.
    setComposed(
      ctx,
      M,
      -sa * sAcross * sc,
      ca * sAcross * sc,
      ca * sAlong * sc,
      sa * sAlong * sc,
      p.x,
      p.y,
    );
    ctx.globalAlpha = Math.min(1, pressure * (0.72 + pen.jit() * 0.4));
    const d = dabs[Math.floor(pen.jit() * dabs.length)];
    ctx.drawImage(d, -b.w / 2, -b.h / 2);
  }
  ctx.restore();
}

/**
 * Восковой штрих: цепочка перекрывающихся мазков с рваным краем. Рисуется на отдельной канве,
 * по ней проходят зерном (destination-out) и результат переносится на основную канву.
 */
export function pastelStroke(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  path: Pt[],
  width: number,
  color: string,
  pressure = 0.85,
  o: StrokeOpts = {},
): void {
  if (o.grain !== true) {
    stampStroke(ctx, pen, path, width, color, pressure, o);
    return;
  }
  const bb = bbox(path);
  const m = width + pen.amp * 2 + 4;
  const W = bb.w + m * 2;
  const H = bb.h + m * 2;
  const tmp = borrow(W, H);
  const t = ctx2d(tmp);
  t.translate(-bb.x + m, -bb.y + m);
  stampStroke(t, pen, path, width, color, pressure, o);
  t.setTransform(1, 0, 0, 1, 0, 0);
  applyGrain(t, pen.jit, 0, 0, W, H, kit.tooth * (1.2 - pressure * 0.6));
  ctx.drawImage(tmp, 0, 0, W, H, bb.x - m, bb.y - m, W, H);
  giveBack(tmp);
}

/**
 * Слой пастели: всё, что нарисовано в layer.ctx, получает зерно бумаги один раз
 * и переносится на целевую канву.
 */
export class PastelLayer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly target: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;

  constructor(target: CanvasRenderingContext2D, w: number, h: number) {
    this.target = target;
    this.w = w;
    this.h = h;
    this.canvas = borrow(w, h);
    this.ctx = ctx2d(this.canvas);
  }

  /** Перенести слой на канву с зерном density (по умолчанию — зерно кита). */
  end(
    rng: Rng,
    density = kit.tooth,
    alpha = 1,
    op: GlobalCompositeOperation = 'source-over',
  ): void {
    applyGrain(this.ctx, rng, 0, 0, this.w, this.h, density);
    this.target.save();
    this.target.setTransform(1, 0, 0, 1, 0, 0);
    this.target.globalAlpha = alpha;
    this.target.globalCompositeOperation = op;
    this.target.drawImage(this.canvas, 0, 0, this.w, this.h, 0, 0, this.w, this.h);
    this.target.restore();
    giveBack(this.canvas);
  }
}

export interface FillOpts {
  /** Насколько штрихи выходят за контур, px. */
  overshoot?: number;
  /** Ширина штриха штриховки, px. */
  stroke?: number;
  /** Подложка цвета под штриховкой (0..1). */
  under?: number;
  /** Второй, перекрёстный слой (0..1, по умолчанию 0.5). */
  cross?: number;
  pressure?: number;
  grain?: boolean;
  /** Оттенки для отдельных штрихов (по умолчанию — только color). */
  tones?: readonly string[];
  kind?: BrushKind;
  /** Длина штриха штриховки, доля размера формы (по умолчанию — через всю форму). */
  len?: number;
}

/**
 * Заливка формы штриховкой под углом и вторым, перекрёстным слоем. На краях штрихи выходят
 * за контур на 1–2 px, между штрихами кое-где видна бумага.
 */
export function pastelFill(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  path: Pt[],
  color: string,
  angle = -0.6,
  density = 1,
  o: FillOpts = {},
): void {
  const bb = bbox(path);
  const sw = o.stroke ?? 7;
  const over = o.overshoot ?? Math.max(1.6, sw * 0.3);
  const clip = jitterPath(inflate(path, over * 0.6), pen.jit, over * 1.1 + pen.amp);
  ctx.save();
  tracePath(ctx, clip, true);
  ctx.clip();
  const under = o.under ?? 0.3;
  if (under > 0) {
    ctx.globalAlpha = under;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const pressure = o.pressure ?? 0.9;
  const tones = o.tones ?? [color];
  hatchStamp(ctx, pen, bb, tones, angle, density, sw, pressure, o.kind ?? 'wax', o.len ?? 1);
  const cross = o.cross ?? 0.5;
  if (cross > 0)
    hatchStamp(
      ctx,
      pen,
      bb,
      tones,
      angle + 1.2,
      density * 0.55,
      sw * 0.9,
      pressure * cross,
      o.kind ?? 'wax',
      o.len ?? 1,
    );
  ctx.restore();
  if (o.grain === true) {
    const m = sw + over + 2;
    applyGrain(
      ctx,
      pen.jit,
      bb.x - m,
      bb.y - m,
      bb.w + m * 2,
      bb.h + m * 2,
      kit.tooth * (1.15 - pressure * 0.5),
    );
  }
}

// Готовые мазки для штриховки: прямые восковые штрихи нескольких длин с сужением к концам.
// Штриховка рисует их целиком одним drawImage — в десятки раз быстрее штампов.
/** Эталонные ширины готовых мазков: мазок рисуется в ближайшей, без сильного растяжения. */
const STRIP_WIDTHS = [5, 9, 16];
const STRIP_UNITS = [3, 4.5, 7, 10, 15, 22, 33, 50];

interface StripSet {
  strips: HTMLCanvasElement[][];
  lens: number[];
  pad: number;
  h: number;
  w: number;
}

const stripSets = new Map<string, StripSet>();
/** Тонированные мазки: по цвету — массив длин, длина тонируется при первом использовании. */
const tintedStripSets = new Map<string, Array<HTMLCanvasElement[] | null>>();

function stripSet(kind: BrushKind, wi: number): StripSet {
  const id = `${kind}|${wi}`;
  const hit = stripSets.get(id);
  if (hit) return hit;
  const w = STRIP_WIDTHS[wi];
  const pad = Math.ceil(w * 0.7);
  const h = Math.ceil(w * 1.6);
  const pen = makePen((kind === 'wax' ? 101 : kind === 'chalk' ? 202 : 303) + wi * 17, 0, 0);
  const lens = STRIP_UNITS.map((u) => Math.round(u * w));
  const strips = lens.map((len) => {
    const out: HTMLCanvasElement[] = [];
    for (let v = 0; v < 3; v++) {
      const c = makeCanvas(len + pad * 2, h);
      const x = ctx2d(c);
      const bend = (pen.rng() - 0.5) * w * 0.3;
      const pts = [
        { x: pad, y: h / 2 },
        { x: pad + len / 2, y: h / 2 + bend },
        { x: pad + len, y: h / 2 },
      ];
      stampStroke(x, pen, chaikin(pts, 2, false), w, '#ffffff', 1, {
        kind,
        taper: Math.min(0.9, (w * 1.6) / len),
        spacing: 0.3,
      });
      out.push(c);
    }
    return out;
  });
  const set = { strips, lens, pad, h, w };
  stripSets.set(id, set);
  return set;
}

function tintedStrip(kind: BrushKind, wi: number, color: string, bi: number): HTMLCanvasElement[] {
  const key = `${kind}|${wi}|${color}`;
  let entry = tintedStripSets.get(key);
  if (!entry) {
    entry = STRIP_UNITS.map(() => null);
    tintedStripSets.set(key, entry);
  }
  const hit = entry[bi];
  if (hit) return hit;
  const out = stripSet(kind, wi).strips[bi].map((d) => {
    const c = makeCanvas(d.width, d.height);
    const x = ctx2d(c);
    x.drawImage(d, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, d.width, d.height);
    return c;
  });
  entry[bi] = out;
  return out;
}

/** Прямой восковой мазок от (x0, y0) до (x1, y1) одним готовым штрихом. */
export function strip(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
  alpha = 1,
  kind: BrushKind = 'wax',
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 0.5 || width <= 0) return;
  let wi = 0;
  for (let i = 1; i < STRIP_WIDTHS.length; i++) {
    if (Math.abs(Math.log(STRIP_WIDTHS[i] / width)) < Math.abs(Math.log(STRIP_WIDTHS[wi] / width)))
      wi = i;
  }
  const set = stripSet(kind, wi);
  // Длина в единицах эталонной ширины — выбрать ближайший готовый мазок.
  const want = (len * set.w) / width;
  let bi = 0;
  for (let i = 1; i < set.lens.length; i++) {
    if (Math.abs(Math.log(set.lens[i] / want)) < Math.abs(Math.log(set.lens[bi] / want))) bi = i;
  }
  const variants = tintedStrip(kind, wi, color, bi);
  const src = variants[Math.floor(pen.jit() * variants.length)];
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const sx = len / set.lens[bi];
  const sy = width / set.w;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const M = ctx.getTransform();
  ctx.save();
  setComposed(ctx, M, ca * sx, sa * sx, -sa * sy, ca * sy, x0, y0);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(src, -set.pad, -set.h / 2);
  ctx.restore();
}

/** Штриховка прямоугольника готовыми мазками. */
function hatchStamp(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  b: { x: number; y: number; w: number; h: number },
  tones: readonly string[],
  angle: number,
  density: number,
  sw: number,
  pressure: number,
  kind: BrushKind,
  lenShare: number,
): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const R = Math.hypot(b.w, b.h) / 2 + sw;
  const spacing = Math.max(1, (sw * 0.72) / Math.max(0.15, density));
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let d = -R; d <= R; d += spacing * (0.75 + pen.jit() * 0.5)) {
    const ox = cx - sa * d;
    const oy = cy + ca * d;
    const half = Math.sqrt(Math.max(0, R * R - d * d));
    const segLen = Math.max(sw * 2, lenShare * 2 * half);
    let s0 = -half - pen.jit() * sw;
    while (s0 < half) {
      const len = segLen * (0.7 + pen.jit() * 0.6);
      const s1 = Math.min(half + sw, s0 + len);
      const a = angle + (pen.jit() - 0.5) * 0.12;
      const x0 = ox + ca * s0;
      const y0 = oy + sa * s0;
      const tone = tones[Math.floor(pen.jit() * tones.length)];
      strip(
        ctx,
        pen,
        x0,
        y0,
        x0 + Math.cos(a) * (s1 - s0),
        y0 + Math.sin(a) * (s1 - s0),
        sw * (0.85 + pen.jit() * 0.3),
        tone,
        pressure * (0.75 + pen.jit() * 0.35),
        kind,
      );
      s0 = s1 + sw * (0.25 + pen.jit() * 1.1);
    }
  }
}

/** Направление света. */
export interface LightDir {
  x: number;
  y: number;
}

/**
 * Объём наслоением 2–3 цветов: светлый со стороны света, тёмный — с противоположной.
 * colors: [основной, светлый, тёмный?].
 */
export function layer(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  path: Pt[],
  colors: readonly string[],
  lightDir: LightDir = { x: -0.6, y: -0.8 },
  o: {
    angle?: number;
    density?: number;
    stroke?: number;
    lightReach?: number;
    darkReach?: number;
  } = {},
): void {
  const angle = o.angle ?? -0.7;
  const density = o.density ?? 1;
  const sw = o.stroke ?? 7;
  pastelFill(ctx, pen, path, colors[0], angle, density, { stroke: sw });
  const b = bbox(path);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const R = Math.max(b.w, b.h) / 2;
  const l = Math.hypot(lightDir.x, lightDir.y) || 1;
  const lx = lightDir.x / l;
  const ly = lightDir.y / l;
  const side = (color: string, dir: number, reach: number, alpha: number, ang: number) => {
    const m = sw + 8 + pen.amp;
    const W = b.w + m * 2;
    const H = b.h + m * 2;
    const tmp = borrow(W, H);
    const t = ctx2d(tmp);
    t.translate(-b.x + m, -b.y + m);
    pastelFill(t, pen, inflate(path, -1), color, ang, density * 0.9, {
      stroke: sw * 0.9,
      under: 0.15,
      cross: 0.3,
    });
    // Маска: линейно от стороны света к центру.
    const g = t.createLinearGradient(
      cx + lx * R * dir,
      cy + ly * R * dir,
      cx - lx * R * dir * (reach - 1),
      cy - ly * R * dir * (reach - 1),
    );
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    t.globalCompositeOperation = 'destination-in';
    t.fillStyle = g;
    t.fillRect(b.x - m, b.y - m, W, H);
    t.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(tmp, 0, 0, W, H, b.x - m, b.y - m, W, H);
    giveBack(tmp);
  };
  if (colors[1]) side(colors[1], 1, o.lightReach ?? 1.15, 1, angle + 0.35);
  if (colors[2]) side(colors[2], -1, o.darkReach ?? 1.1, 0.95, angle - 0.25);
}

/** Процарапывание: линии цвета бумаги поверх пастели (source-atop). */
export function sgraffito(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  lines: Pt[][],
  width = 1.2,
  color = kit.paper,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of lines) {
    const pts = jitterPath(line, pen.jit, Math.min(pen.amp, width));
    ctx.globalAlpha = 0.7 + pen.jit() * 0.3;
    ctx.lineWidth = width * (0.7 + pen.jit() * 0.6);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      if (pen.jit() < 0.06) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Короткие процарапанные чёрточки по форме (шерсть, хвоя, волокна). */
export function scratches(
  pen: Pen,
  path: Pt[],
  count: number,
  len: number,
  angle: number,
  spread = 0.4,
): Pt[][] {
  const b = bbox(path);
  const out: Pt[][] = [];
  for (let i = 0; i < count; i++) {
    const x = b.x + pen.rng() * b.w;
    const y = b.y + pen.rng() * b.h;
    const a = angle + (pen.rng() - 0.5) * spread;
    const l = len * (0.5 + pen.rng() * 0.8);
    out.push([
      { x, y },
      { x: x + Math.cos(a) * l * 0.5 + (pen.rng() - 0.5), y: y + Math.sin(a) * l * 0.5 },
      { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l },
    ]);
  }
  return out;
}

/** Светлая неровная линия «от руки» в два прохода — контур, видимый даже в темноте. */
export function chalkLine(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  path: Pt[],
  width: number,
  color: string,
  closed = true,
  pressure = 0.9,
): void {
  const p = closed ? path.concat([path[0]]) : path;
  pastelStroke(ctx, pen, p, width, color, pressure, { kind: 'chalk', taper: closed ? 0 : 0.2 });
  const p2 = jitterPath(p, pen.jit, width * 0.3 + pen.amp * 0.5);
  pastelStroke(ctx, pen, p2, width * 0.6, color, pressure * 0.75, {
    kind: 'chalk',
    taper: 0.25,
    grain: false,
  });
}

/** Растёртое пальцем пятно с зернистым краем: ореолы, контактные тени, дым. */
export function smudge(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 0.8,
  squash = 1,
): void {
  const W = r * 2 + 4;
  const H = r * 2 * squash + 4;
  const tmp = borrow(W, H);
  const t = ctx2d(tmp);
  const cx = W / 2;
  const cy = H / 2;
  t.save();
  t.translate(cx, cy);
  t.scale(1, squash);
  const g = t.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
  g.addColorStop(0, rgbaStr(color, alpha));
  g.addColorStop(0.55, rgbaStr(color, alpha * 0.55));
  g.addColorStop(1, rgbaStr(color, 0));
  t.fillStyle = g;
  // Неровный край: рисуем каплю, а не идеальный круг.
  tracePath(t, blob(pen.rng, r * 2, r * 2, { irregularity: 0.1, points: 9 }), true);
  t.fill();
  t.restore();
  // Зернистый край: зерно сильнее к краю.
  const mask = borrow(W, H);
  const mx = ctx2d(mask);
  const pat = mx.createPattern(grainMask(0.5), 'repeat');
  if (pat) {
    mx.fillStyle = pat;
    mx.fillRect(0, 0, W, H);
    mx.globalCompositeOperation = 'destination-in';
    mx.save();
    mx.translate(cx, cy);
    mx.scale(1, squash);
    const g2 = mx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,1)');
    mx.fillStyle = g2;
    mx.fillRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4);
    mx.restore();
    t.globalCompositeOperation = 'destination-out';
    t.drawImage(mask, 0, 0, W, H, 0, 0, W, H);
  }
  giveBack(mask);
  ctx.drawImage(tmp, 0, 0, W, H, x - cx, y - cy, W, H);
  giveBack(tmp);
}

/** Крошки пастели вокруг ярких мест. */
export function crumbs(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  region: { x: number; y: number; w: number; h: number },
  color: string,
  count = 20,
  size = 1.6,
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = region.x + pen.rng() * region.w + (pen.jit() - 0.5) * pen.amp;
    const y = region.y + pen.rng() * region.h + (pen.jit() - 0.5) * pen.amp;
    const s = size * (0.5 + pen.rng() * 0.9);
    ctx.globalAlpha = 0.55 + pen.rng() * 0.45;
    ctx.beginPath();
    const k = 3 + Math.floor(pen.rng() * 3);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + pen.rng();
      const rr = s * (0.6 + pen.rng() * 0.6);
      if (j === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── Кисти света ─────────────────────────────────────────────────────

/**
 * Радиальная кисть с зернистым краем: ей «вытирают» темноту (8.3). Внутри — полная
 * прозрачность-стирание, к краю — зернисто до нуля, как край пастели на бумаге.
 * grain — сила зерна (1 — полное, меньше — мягче, для широкого ровного света фонаря).
 */
export function lightBrush(
  rng: Rng,
  size: number,
  core = 0.38,
  softness = 0.16,
  grain = 1,
): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const x = ctx2d(c);
  const img = x.createImageData(size, size);
  const fine = valueNoiseTile(rng, size, 1.7);
  const mid = valueNoiseTile(rng, size, 4.5);
  const wob = valueNoiseTile(rng, size, size / 6);
  const R = size / 2;
  for (let y = 0; y < size; y++) {
    for (let xx = 0; xx < size; xx++) {
      const i = y * size + xx;
      const dx = (xx + 0.5 - R) / R;
      const dy = (y + 0.5 - R) / R;
      let d = Math.sqrt(dx * dx + dy * dy);
      d *= 1 + (wob[i] - 0.5) * 0.12; // неровный край
      if (d >= 1) continue;
      // Радиальный спад: 1 в сердцевине, 0 на краю.
      const f = d <= core ? 1 : 1 - (d - core) / (1 - core);
      const ff = f * f * (3 - 2 * f);
      const n = 0.5 + (fine[i] * 0.65 + mid[i] * 0.35 - 0.5) * grain;
      // Мягкий порог шума: ближе к краю пастель ложится только на вершины зерна.
      const a =
        smooth01((ff - n * 0.85 + softness * 0.5) / softness) * Math.min(1, ff * 1.6 + 0.08);
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function smooth01(v: number): number {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

// ── Кипение ─────────────────────────────────────────────────────────

/**
 * Копия рисунка с дрожанием: полосы сдвинуты на целые пиксели по плавной случайной кривой —
 * линии «кипят», а силуэт смещается не больше чем на amp.
 */
export function wobbleCopy(src: HTMLCanvasElement, rng: Rng, amp: number): HTMLCanvasElement {
  const a = Math.max(1, amp);
  const W = src.width;
  const H = src.height;
  const pass = (from: HTMLCanvasElement, horizontal: boolean): HTMLCanvasElement => {
    const c = makeCanvas(W, H);
    const x = ctx2d(c);
    const span = horizontal ? H : W;
    const band = Math.max(2, Math.round(span / 22));
    const ph = rng() * Math.PI * 2;
    const fr = 0.7 + rng() * 0.9;
    for (let p = 0; p < span; p += band) {
      const d = Math.round(
        Math.sin(ph + (p / span) * Math.PI * 2 * fr) * a * 0.75 + (rng() - 0.5) * a * 0.8,
      );
      const len = Math.min(band, span - p);
      if (horizontal) x.drawImage(from, 0, p, W, len, d, p, W, len);
      else x.drawImage(from, p, 0, len, H, p, d, len, H);
    }
    return c;
  };
  return pass(pass(src, true), false);
}

/**
 * Три варианта одного рисунка с разным дрожанием штрихов (не больше 2% размера).
 * Рисунок делается один раз, остальные варианты — дрожащие копии: силуэт не меняется,
 * а зерно бумаги фабрика накладывает на каждый вариант своё.
 */
export function boilVariants(
  draw: (pen: Pen, variant: number) => HTMLCanvasElement,
  seed: number,
  n = 3,
  amp = 1.2,
): HTMLCanvasElement[] {
  const base = draw(makePen(seed, 0, 0), 0);
  const out = [base];
  const rng = mulberry32(seed ^ 0x5bd1e995);
  for (let v = 1; v < n; v++) out.push(wobbleCopy(base, rng, amp));
  return out;
}

// ── Слова-звуки ─────────────────────────────────────────────────────

export interface WordColors {
  fill: string;
  shade: string;
  chalk: string;
}

const wordCache = new Map<string, HTMLCanvasElement>();

/**
 * Слово-звук шрифтом Rubik Scribble: пастельная заливка, меловой контур,
 * буквы чуть повёрнуты. Кэшируется.
 */
export function pastelWord(
  text: string,
  colors: WordColors,
  fontPx = 64,
  font = '"Rubik Scribble", "Rubik", sans-serif',
): HTMLCanvasElement {
  const key = `${text}|${colors.fill}|${colors.shade}|${colors.chalk}|${fontPx}`;
  const hit = wordCache.get(key);
  if (hit) return hit;
  const pen = makePen(hashText(text), 0, 0.6);
  const measure = makeCanvas(8, 8);
  const mctx = ctx2d(measure);
  mctx.font = `${fontPx}px ${font}`;
  const chars = Array.from(text);
  const widths = chars.map((ch) => mctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + chars.length * fontPx * 0.04;
  const pad = fontPx * 0.35;
  const W = Math.ceil(total + pad * 2);
  const H = Math.ceil(fontPx * 1.55 + pad);
  const c = makeCanvas(W, H);
  const x = ctx2d(c);
  x.font = `${fontPx}px ${font}`;
  x.textBaseline = 'middle';
  const placements: Array<{ ch: string; x: number; y: number; r: number }> = [];
  let cx = pad;
  for (let i = 0; i < chars.length; i++) {
    const r = (pen.rng() - 0.5) * 0.22;
    const dy = (pen.rng() - 0.5) * fontPx * 0.12;
    placements.push({ ch: chars[i], x: cx + widths[i] / 2, y: H / 2 + dy, r });
    cx += widths[i] + fontPx * 0.04;
  }
  const drawGlyphs = (ctx: CanvasRenderingContext2D, mode: 'fill' | 'stroke', lw = 0) => {
    for (const p of placements) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.textAlign = 'center';
      if (mode === 'fill') ctx.fillText(p.ch, 0, 0);
      else {
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.strokeText(p.ch, 0, 0);
      }
      ctx.restore();
    }
  };
  // Тёмная подложка-контур из бумаги, чтобы слово читалось на любом фоне.
  x.strokeStyle = kit.paper;
  drawGlyphs(x, 'stroke', fontPx * 0.22);
  // Меловой контур.
  x.strokeStyle = colors.chalk;
  drawGlyphs(x, 'stroke', fontPx * 0.1);
  // Пастельная заливка со штриховкой.
  const fillLayer = borrow(W, H);
  const f = ctx2d(fillLayer);
  f.font = x.font;
  f.textBaseline = 'middle';
  f.fillStyle = colors.fill;
  drawGlyphs(f, 'fill');
  f.globalCompositeOperation = 'source-atop';
  hatchStamp(
    f,
    pen,
    { x: 0, y: H * 0.45, w: W, h: H * 0.6 },
    [colors.shade],
    -0.5,
    0.5,
    fontPx * 0.1,
    0.55,
    'wax',
    0.4,
  );
  hatchStamp(
    f,
    pen,
    { x: 0, y: 0, w: W, h: H * 0.42 },
    [colors.chalk],
    -0.4,
    0.25,
    fontPx * 0.08,
    0.35,
    'wax',
    0.4,
  );
  f.globalCompositeOperation = 'source-over';
  applyGrain(f, pen.jit, 0, 0, W, H, kit.tooth * 0.6);
  x.drawImage(fillLayer, 0, 0, W, H, 0, 0, W, H);
  giveBack(fillLayer);
  wordCache.set(key, c);
  return c;
}

export function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Нарисованная мелом рамка для 9-фрагментной border-image (DOM, тема «мел»). */
export function chalkFrame(
  seed: number,
  size: number,
  inset: number,
  width: number,
  color: string,
): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const x = ctx2d(c);
  const pen = makePen(seed, 0, 0);
  const a = inset;
  const b = size - inset;
  const side = (p0: Pt, p1: Pt): Pt[] => {
    const pts: Pt[] = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({
        x: p0.x + (p1.x - p0.x) * t + (pen.rng() - 0.5) * 1.4,
        y: p0.y + (p1.y - p0.y) * t + (pen.rng() - 0.5) * 1.4,
      });
    }
    return pts;
  };
  const corners: Pt[] = [
    { x: a, y: a },
    { x: b, y: a + 0.6 },
    { x: b - 0.5, y: b },
    { x: a + 0.4, y: b - 0.4 },
  ];
  for (let i = 0; i < 4; i++) {
    const p0 = corners[i];
    const p1 = corners[(i + 1) % 4];
    const ext = 3;
    const dx = Math.sign(p1.x - p0.x) * ext;
    const dy = Math.sign(p1.y - p0.y) * ext;
    chalkLine(
      x,
      pen,
      side({ x: p0.x - dx, y: p0.y - dy }, { x: p1.x + dx, y: p1.y + dy }),
      width,
      color,
      false,
      0.85,
    );
  }
  return c;
}
