// Генерация всех текстур при запуске (раздел 7.3): рецепты рисуют на Canvas 2D,
// фабрика регистрирует канвы в Phaser под ключами манифеста.

import { grainPass, kitTooth, mulberry32 } from '../shared/pastelKit.ts';
import type { RC, Tex } from './recipes/common.ts';
import { setArtMeta } from './registry.ts';
import { drawPile, drawTent } from './recipes/camp.ts';
import { drawFlames } from './recipes/flames.ts';
import { drawFx, drawPitParts } from './recipes/firePit.ts';
import { drawForest } from './recipes/forest.ts';
import { drawClearing, drawForestFloor, drawPaper } from './recipes/ground.ts';
import { drawHero } from './recipes/hero.ts';
import { drawBrushes, drawHud } from './recipes/hud.ts';
import { drawSky } from './recipes/sky.ts';
import { drawTest } from './recipes/test.ts';
import { drawWolves } from './recipes/wolf.ts';

export interface Recipe {
  name: string;
  run: (rc: RC) => Tex[];
  /** Только для лаборатории арта. */
  labOnly?: boolean;
}

/** Рецепты, по текстурам которых зерно не проходит (подсказки, шкалы и кисти — чистые). */
const NO_GRAIN = new Set(['paper', 'brushes', 'hud']);

/** Рецепты с более лёгким зерном: на лице героя крупинки бумаги читаются как грязь. */
const LIGHT_GRAIN: Record<string, number> = { hero: 0.022 };

/** Последний проход: зерно бумаги по всей текстуре (у вариантов кипения — своё). */
export function finalizeTex(recipe: string, t: Tex, index: number, seed: number): void {
  const density = t.grain ?? (NO_GRAIN.has(recipe) ? 0 : (LIGHT_GRAIN[recipe] ?? kitTooth()));
  if (density > 0)
    grainPass(t.canvas, mulberry32(seed * 977 + index * 131 + recipe.length), density);
}

export const RECIPES: Recipe[] = [
  { name: 'paper', run: (rc) => [drawPaper(rc)] },
  { name: 'brushes', run: drawBrushes },
  { name: 'floor', run: (rc) => [drawForestFloor(rc)] },
  { name: 'clearing', run: (rc) => [drawClearing(rc)] },
  { name: 'sky', run: drawSky },
  { name: 'hud', run: drawHud },
  { name: 'fx', run: drawFx },
  { name: 'pit', run: drawPitParts },
  { name: 'flames', run: drawFlames },
  { name: 'pile', run: drawPile },
  { name: 'tent', run: drawTent },
  { name: 'forest', run: drawForest },
  { name: 'hero', run: drawHero },
  { name: 'wolves', run: drawWolves },
  { name: 'test', run: drawTest, labOnly: true },
];

export interface GenProgress {
  done: number;
  total: number;
  ms: number;
}

/** Сколько текстур генерировать: на низком качестве — 96 px на клетку (13.6.3). */
export interface GenTarget {
  addCanvas(key: string, canvas: HTMLCanvasElement): void;
  exists(key: string): boolean;
}

/**
 * Сгенерировать все текстуры и зарегистрировать их. Между рецептами отдаёт кадр,
 * чтобы экран загрузки оставался живым.
 */
export async function generateArt(
  target: GenTarget,
  rc: RC,
  onProgress?: (p: GenProgress) => void,
): Promise<number> {
  const t0 = performance.now();
  const list = RECIPES.filter((r) => !r.labOnly);
  let done = 0;
  for (const r of list) {
    const out = r.run(rc);
    out.forEach((t, i) => {
      finalizeTex(r.name, t, i, rc.seed);
      setArtMeta(t.key, { ox: t.ox, oy: t.oy });
      if (!target.exists(t.key)) target.addCanvas(t.key, t.canvas);
    });
    done++;
    onProgress?.({ done, total: list.length, ms: performance.now() - t0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return performance.now() - t0;
}
