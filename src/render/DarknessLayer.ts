// Слой тьмы (раздел 8): чёрная бумага поверх мира, из которой каждый кадр «вытирается» свет —
// стиранием в динамической текстуре (режим ERASE: непрозрачность × (1 − s)).
// Запасной путь (8.5): статичная виньетка, а свет дают аддитивные ореолы.

import Phaser from 'phaser';
import { light } from '../config/balance.ts';
import { look } from '../config/look.ts';
import { hex, palette } from '../config/palette.ts';
import { K } from '../art/manifest.ts';
import { DEPTH } from './depth.ts';
import type { ViewRect } from './FireView.ts';

const CELL = look.cell;

export interface LightStamp {
  /** Центр в мире. */
  x: number;
  y: number;
  /** Радиус, клеток. */
  r: number;
  /** Сила стирания 0..1. */
  strength: number;
  brush: string;
}

export class DarknessLayer {
  readonly fallback: boolean;
  private readonly scene: Phaser.Scene;
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private vignette: Phaser.GameObjects.Image | null = null;
  private view: ViewRect = { x: 0, y: 0, w: 1, h: 1 };
  private pxPerUnit = 1;
  private half = false;
  private brushSize = 256;
  /** Сколько стираний сделано в последнем кадре (бюджет 13.6.1). */
  erases = 0;

  constructor(scene: Phaser.Scene, fallback: boolean) {
    this.scene = scene;
    this.fallback = fallback;
    const b = scene.textures.get(K.brush(0));
    this.brushSize = b ? b.getSourceImage().width : 256;
  }

  /** Подогнать слой под видимую область. canvasPx — размер канвы в физических пикселях. */
  layout(view: ViewRect, canvasW: number, canvasH: number, half: boolean): void {
    this.view = view;
    this.half = half;
    if (this.fallback) {
      if (!this.vignette)
        this.vignette = this.scene.add.image(0, 0, K.vignette).setDepth(DEPTH.dark);
      this.vignette.setPosition(view.x + view.w / 2, view.y + view.h / 2);
      this.vignette.setDisplaySize(view.w * 1.15, view.h * 1.15);
      return;
    }
    const w = Math.max(16, Math.round(half ? canvasW / 2 : canvasW));
    const h = Math.max(16, Math.round(half ? canvasH / 2 : canvasH));
    if (!this.rt) {
      this.rt = this.scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setDepth(DEPTH.dark);
    } else if (this.rt.width !== w || this.rt.height !== h) {
      this.rt.resize(w, h);
    }
    this.pxPerUnit = w / view.w;
    this.rt.setPosition(view.x, view.y);
    this.rt.setScale(view.w / this.rt.width, view.h / this.rt.height);
  }

  /**
   * Перерисовать тьму. fillAlpha — непрозрачность бумаги после равномерного света неба
   * (луна, рассвет); stamps — источники света.
   */
  draw(
    fillAlpha: number,
    stamps: readonly LightStamp[],
    sky: { top: number; bottom: number; strength: number } | null,
  ): void {
    if (this.fallback) {
      if (this.vignette) this.vignette.setAlpha(Math.min(1, fillAlpha / light.nightAlpha));
      return;
    }
    const rt = this.rt;
    if (!rt) return;
    const k = this.pxPerUnit;
    rt.clear();
    this.erases = 0;
    if (fillAlpha <= 0.002) {
      rt.render();
      return;
    }
    rt.fill(hex(palette.paper), fillAlpha);
    if (sky && sky.strength > 0) {
      const top = (sky.top - this.view.y) * k;
      const hgt = (sky.bottom - sky.top) * k;
      rt.stamp(K.skyMask, undefined, 0, top, {
        originX: 0,
        originY: 0,
        scaleX: rt.width / 64,
        scaleY: Math.max(1, hgt) / 64,
        alpha: sky.strength,
        blendMode: Phaser.BlendModes.ERASE,
      });
      this.erases++;
    }
    for (const s of stamps) {
      if (s.strength <= 0.003 || this.erases >= light.maxErasesPerFrame) continue;
      const px = (s.x - this.view.x) * k;
      const py = (s.y - this.view.y) * k;
      const scale = (s.r * CELL * 2 * k) / this.brushSize;
      rt.stamp(s.brush, undefined, px, py, {
        scale,
        alpha: Math.min(1, s.strength),
        blendMode: Phaser.BlendModes.ERASE,
      });
      this.erases++;
    }
    rt.render();
  }

  get usesHalf(): boolean {
    return this.half;
  }

  destroy(): void {
    this.rt?.destroy();
    this.vignette?.destroy();
  }
}
