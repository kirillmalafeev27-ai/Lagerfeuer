// Слои и глубина (раздел 7.6).

import { look } from '../config/look.ts';

export const DEPTH = {
  sky: 0,
  skyDawn: 1,
  stars: 2,
  moon: 3,
  sun: 4,
  horizon: 5,
  floor: 10,
  ground: 11,
  shadows: 30,
  /** 100–199: объекты с сортировкой по y основания. */
  objects: 100,
  atmosphere: 300,
  glow: 400,
  dark: 500,
  over: 600,
  overHints: 610,
  overGauge: 620,
  overWords: 650,
} as const;

/** Глубина объекта по y основания в единицах мира. */
export function depthByY(y: number): number {
  const top = look.world.top * look.cell;
  const span = (look.world.bottom - look.world.top) * look.cell;
  return DEPTH.objects + Math.max(0, Math.min(99.9, ((y - top) / span) * 99.9));
}
