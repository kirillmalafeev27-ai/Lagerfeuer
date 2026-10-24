// Мир: подстилка, поляна, лес вокруг, укрытия за кострами (7.5.1, 7.5.2, 7.5.7).

import Phaser from 'phaser';
import { look } from '../config/look.ts';
import { K } from '../art/manifest.ts';
import { artScale } from '../art/registry.ts';
import { pitCenters } from '../art/recipes/ground.ts';
import type { Side } from '../core/clearing.ts';
import { mulberry32, type Rng } from '../core/rng.ts';
import type { Shelter } from '../core/state.ts';
import { artImage } from './art.ts';
import { DEPTH, depthByY } from './depth.ts';

const CELL = look.cell;

/** Наружу от поляны для каждой стороны. */
export const OUTWARD: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function pitWorld(side: Side): { x: number; y: number } {
  const p = pitCenters()[side];
  return { x: p.x * CELL, y: p.y * CELL };
}

export interface WorldLayout {
  seed: number;
  shelters: readonly Shelter[];
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export class WorldView {
  private readonly scene: Phaser.Scene;
  private readonly decor: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const w = look.world;
    const floor = scene.add.tileSprite(w.left * CELL, w.top * CELL, (w.right - w.left) * CELL, (w.bottom - w.top) * CELL, 'floor');
    floor.setOrigin(0, 0);
    floor.setTileScale(artScale(), artScale());
    floor.setDepth(DEPTH.floor);
    const bg = artImage(scene, 0, 0, K.bg);
    bg.setDepth(DEPTH.ground);
  }

  /** Расставить лес и укрытия под раскладку раунда. */
  build(layout: WorldLayout): void {
    for (const d of this.decor) d.destroy();
    this.decor.length = 0;
    const rng = mulberry32(layout.seed ^ 0x7ee5);
    const keep: Rect = {
      x0: (look.fit.left - 0.08) * CELL,
      y0: (look.fit.top - 0.1) * CELL,
      x1: (look.fit.right + 0.08) * CELL,
      y1: (look.fit.bottom + 0.05) * CELL,
    };
    const corridors: Rect[] = [];
    // Укрытия и просветы за кострами.
    layout.shelters.forEach((sh, i) => {
      const side = i as Side;
      const pit = pitWorld(side);
      const o = OUTWARD[side];
      if (sh === 'sheltered') {
        const dist = side === 2 ? 1.22 : 1.05;
        const x = pit.x + o.x * dist * CELL;
        const y = pit.y + o.y * dist * CELL + (side === 0 ? 0.1 * CELL : 0);
        const useLog = side === 2 || rng() < 0.35;
        const img = artImage(this.scene, x, y, useLog ? K.fallenLog : K.boulder(rng() < 0.5 ? 0 : 1));
        if (side === 1 || side === 3) img.setFlipX(side === 3);
        img.setDepth(depthByY(y));
        this.decor.push(img);
      } else if (sh === 'open') {
        const cx = pit.x + o.x * 1.75 * CELL;
        const cy = pit.y + o.y * 1.75 * CELL;
        corridors.push({ x0: cx - 0.85 * CELL, y0: cy - 1.4 * CELL, x1: cx + 0.85 * CELL, y1: cy + 1.4 * CELL });
        if (side === 0 || side === 2) corridors.push({ x0: cx - 0.8 * CELL, y0: cy - 2.2 * CELL, x1: cx + 0.8 * CELL, y1: cy + 2.2 * CELL });
        else corridors.push({ x0: cx - 2.2 * CELL, y0: cy - 0.8 * CELL, x1: cx + 2.2 * CELL, y1: cy + 0.8 * CELL });
        const gap = artImage(this.scene, pit.x + o.x * 1.25 * CELL, pit.y + o.y * 1.25 * CELL, K.windGap);
        if (side === 0 || side === 2) gap.setRotation(Math.PI / 2);
        gap.setDepth(DEPTH.ground + 1);
        gap.setAlpha(0.85);
        this.decor.push(gap);
      }
    });
    this.plantForest(rng, keep, corridors);
  }

  private plantForest(rng: Rng, keep: Rect, corridors: Rect[]): void {
    const w = look.world;
    const placed: Array<{ x: number; y: number; r: number }> = [];
    const treeDims: Array<[number, number]> = [
      [1.25, 2.1],
      [1.1, 1.75],
      [1.4, 2.4],
      [0.95, 1.5],
    ];
    const cx = CELL;
    const cy = CELL;
    for (let attempt = 0; attempt < 900 && placed.length < 60; attempt++) {
      const x = (w.left + 0.3 + rng() * (w.right - w.left - 0.6)) * CELL;
      const y = (w.top + 1.2 + rng() * (w.bottom - w.top - 1.3)) * CELL;
      const kind = Math.floor(rng() * treeDims.length);
      const s = 0.82 + rng() * 0.3;
      const [tw, th] = treeDims[kind];
      const box: Rect = { x0: x - (tw * s * CELL) / 2, y0: y - th * s * CELL, x1: x + (tw * s * CELL) / 2, y1: y };
      if (overlaps(box, keep)) continue;
      if (corridors.some((c) => overlaps({ x0: x - 0.3 * CELL, y0: y - 0.6 * CELL, x1: x + 0.3 * CELL, y1: y }, c))) continue;
      const r = tw * s * CELL * 0.42;
      if (placed.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.6) < p.r + r)) continue;
      placed.push({ x, y, r });
      const img = artImage(this.scene, x, y, K.tree(kind));
      img.setScale(img.scaleX * s);
      if (rng() < 0.5) img.setFlipX(true);
      // Дальние планы темнее и синее (7.5.2).
      const dist = Math.max(Math.abs(x - cx), Math.abs(y - cy)) / CELL;
      const far = Math.min(1, Math.max(0, (dist - 3) / 2.5));
      img.setTint(Phaser.Display.Color.GetColor(Math.round(255 - far * 120), Math.round(255 - far * 105), Math.round(255 - far * 60)));
      img.setDepth(depthByY(y));
      this.decor.push(img);
    }
    // Папоротник и кусты вдоль опушки.
    for (let attempt = 0, n = 0; attempt < 400 && n < 34; attempt++) {
      const x = (w.left + 0.3 + rng() * (w.right - w.left - 0.6)) * CELL;
      const y = (w.top + 0.5 + rng() * (w.bottom - w.top - 0.6)) * CELL;
      const box: Rect = { x0: x - 0.4 * CELL, y0: y - 0.5 * CELL, x1: x + 0.4 * CELL, y1: y };
      if (overlaps(box, keep)) continue;
      const bushy = rng() < 0.3;
      const img = artImage(this.scene, x, y, bushy ? K.bush(Math.floor(rng() * 2)) : K.fern(Math.floor(rng() * 3)));
      img.setScale(img.scaleX * (0.8 + rng() * 0.4));
      if (rng() < 0.5) img.setFlipX(true);
      img.setDepth(depthByY(y));
      this.decor.push(img);
      n++;
    }
  }
}
