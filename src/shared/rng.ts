// Сидированный генератор случайных чисел серии (общий для китов и логики).

export type Rng = () => number;

/** mulberry32: быстрый 32-битный генератор, детерминированный по сиду. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Смешивает несколько чисел в один 32-битный сид. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    let v = Math.floor(p) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 255;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>>= 8;
    }
  }
  return h >>> 0;
}

export function uniform(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng();
}

export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[randInt(rng, arr.length)];
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Стандартное нормальное распределение (Бокс — Мюллер). */
export function normal(rng: Rng): number {
  let u = rng();
  while (u <= 1e-12) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Логнормальное распределение с заданной медианой и σ. */
export function logNormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(sigma * normal(rng));
}
