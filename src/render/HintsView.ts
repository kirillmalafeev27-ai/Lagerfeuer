// Подсказки поверх тьмы (2.8.4, 7.5.13): меловые точки маршрута и значок «×2».

import Phaser from 'phaser';
import { look } from '../config/look.ts';
import { K } from '../art/manifest.ts';
import { artScale } from '../art/registry.ts';
import { artImage } from './art.ts';
import { DEPTH } from './depth.ts';

const CELL = look.cell;

export class HintsView {
  private readonly dots: Phaser.GameObjects.Image[] = [];
  private readonly x2: Phaser.GameObjects.Image;
  private pts: Array<{ x: number; y: number }> = [];
  private x2Pos: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < 28; i++) this.dots.push(artImage(scene, 0, 0, K.routeDot).setDepth(DEPTH.overHints).setVisible(false));
    this.x2 = artImage(scene, 0, 0, K.x2).setDepth(DEPTH.overHints + 1).setVisible(false);
  }

  /** Ломаная маршрута (в мире): от героя к цели. */
  setRoute(points: Array<{ x: number; y: number }>): void {
    this.pts = points;
  }

  setX2(p: { x: number; y: number } | null): void {
    this.x2Pos = p;
  }

  update(timeMs: number, reducedMotion: boolean): void {
    // Точки через равный шаг вдоль ломаной; бегут к цели.
    const step = 0.17 * CELL;
    const pts = this.pts;
    let n = 0;
    if (pts.length >= 2) {
      const shift = reducedMotion ? 0 : ((timeMs / 900) % 1) * step;
      let carry = step * 0.6 + shift;
      for (let i = 1; i < pts.length && n < this.dots.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        let d = carry;
        while (d < len && n < this.dots.length) {
          const t = d / len;
          const dot = this.dots[n++];
          dot.setVisible(true).setPosition(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
          dot.setAlpha(0.55 + 0.45 * Math.min(1, (n + 1) / 4));
          dot.setScale(artScale() * (n % 2 ? 0.85 : 1));
          d += step;
        }
        carry = d - len;
      }
    }
    for (let i = n; i < this.dots.length; i++) this.dots[i].setVisible(false);
    if (this.x2Pos) {
      const bob = reducedMotion ? 0 : Math.sin(timeMs / 200) * 2;
      this.x2.setVisible(true).setPosition(this.x2Pos.x, this.x2Pos.y + bob);
    } else this.x2.setVisible(false);
  }
}
