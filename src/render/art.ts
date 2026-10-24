// Помощники сцен для процедурных текстур: точка привязки и масштаб из реестра.

import Phaser from 'phaser';
import { artMeta, artScale } from '../art/registry.ts';
import { BOIL, boil } from '../art/manifest.ts';

export function artImage(scene: Phaser.Scene, x: number, y: number, key: string, variant?: number): Phaser.GameObjects.Image {
  const k = variant === undefined ? key : boil(key, variant);
  const img = scene.add.image(x, y, k);
  const m = artMeta(k);
  img.setOrigin(m.ox, m.oy);
  img.setScale(artScale());
  return img;
}

/** Сменить текстуру с сохранением точки привязки. */
export function setArt(img: Phaser.GameObjects.Image, key: string, variant?: number): void {
  const k = variant === undefined ? key : boil(key, variant);
  if (img.texture.key === k) return;
  img.setTexture(k);
  const m = artMeta(k);
  img.setOrigin(m.ox, m.oy);
}

/** Часы кипения: 8 раз в секунду меняется вариант рисунка (7.1). */
export class BoilClock {
  frame = 0;
  enabled = true;
  private acc = 0;
  private readonly period: number;

  constructor(fps: number) {
    this.period = 1000 / fps;
  }

  update(dtMs: number): boolean {
    if (!this.enabled) {
      if (this.frame !== 0) {
        this.frame = 0;
        return true;
      }
      return false;
    }
    this.acc += dtMs;
    if (this.acc < this.period) return false;
    this.acc %= this.period;
    this.frame = (this.frame + 1) % 3000;
    return true;
  }

  /** Вариант для объекта со своим сдвигом фазы. */
  variant(offset = 0): number {
    return this.enabled ? (this.frame + offset) % BOIL : 0;
  }
}
