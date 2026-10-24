// Небо (7.5.3, 8.4): полоса сверху, луна дугой слева направо садится к 0.8 ночи,
// звёзды мерцают; на рассвете слоями светлеет, встаёт солнце, летят птицы.

import Phaser from 'phaser';
import { look } from '../config/look.ts';
import { K } from '../art/manifest.ts';
import { artScale } from '../art/registry.ts';
import { SKY_W } from '../art/recipes/sky.ts';
import { artImage } from './art.ts';
import { DEPTH } from './depth.ts';
import type { ViewRect } from './FireView.ts';

const CELL = look.cell;

interface Star {
  img: Phaser.GameObjects.Image;
  u: number;
  v: number;
  phase: number;
  speed: number;
}

export class SkyView {
  /** Нижняя граница неба в мире (для слоя тьмы). */
  bottom = 0;
  top = 0;
  private readonly night: Phaser.GameObjects.Image;
  private readonly dawn: Phaser.GameObjects.Image;
  private readonly horizon: Phaser.GameObjects.Image;
  private readonly moon: Phaser.GameObjects.Image;
  private readonly sun: Phaser.GameObjects.Image;
  private readonly stars: Star[] = [];
  private readonly birds: Phaser.GameObjects.Image[] = [];
  private view: ViewRect = { x: 0, y: 0, w: 1, h: 1 };
  private skyH: number = CELL;

  constructor(scene: Phaser.Scene) {
    this.night = artImage(scene, 0, 0, K.skyNight).setDepth(DEPTH.sky);
    this.dawn = artImage(scene, 0, 0, K.skyDawn).setDepth(DEPTH.skyDawn).setAlpha(0);
    this.moon = artImage(scene, 0, 0, K.moon).setDepth(DEPTH.over - 6);
    this.sun = artImage(scene, 0, 0, K.sun)
      .setDepth(DEPTH.over - 6)
      .setAlpha(0);
    this.horizon = artImage(scene, 0, 0, K.skyHorizon).setDepth(DEPTH.horizon);
    for (let i = 0; i < 14; i++) {
      const img = artImage(scene, 0, 0, K.starDot(i % 3))
        .setDepth(DEPTH.over - 7)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.stars.push({
        img,
        u: Math.random(),
        v: 0.08 + Math.random() * 0.5,
        phase: Math.random() * 6,
        speed: 0.6 + Math.random() * 1.6,
      });
    }
    for (let i = 0; i < 3; i++)
      this.birds.push(
        artImage(scene, 0, 0, K.bird)
          .setDepth(DEPTH.over - 4)
          .setAlpha(0),
      );
  }

  /** Разместить полосу неба по верху видимой области. */
  layout(view: ViewRect, skyCells: number): void {
    this.view = view;
    this.skyH = skyCells * CELL;
    this.top = view.y;
    this.bottom = view.y + this.skyH;
    const cx = view.x + view.w / 2;
    const texH = look.sky.max * CELL;
    const sy = (this.skyH + 0.25 * CELL) / texH;
    const sx = Math.max(1, view.w / (SKY_W * CELL));
    this.night.setPosition(cx, view.y).setScale(artScale() * sx, artScale() * sy);
    this.dawn.setPosition(cx, view.y).setScale(artScale() * sx, artScale() * sy);
    this.horizon.setPosition(cx, this.bottom + 0.06 * CELL).setScale(artScale() * sx, artScale());
  }

  update(
    timeMs: number,
    nightShare: number,
    dawnK: number,
    sunrise: number,
    reducedMotion: boolean,
  ): void {
    const v = this.view;
    // Луна: дуга слева направо, садится к 0.8 ночи за горизонт.
    const mt = Math.min(1, nightShare / 0.8);
    const mx = v.x + v.w * (0.1 + 0.8 * mt);
    const arc = Math.sin(mt * Math.PI);
    const my =
      this.bottom +
      0.1 * CELL -
      arc * (this.skyH * 0.72) +
      (mt > 0.92 ? (mt - 0.92) * 6 * CELL : 0);
    const setFade = mt > 0.86 ? Math.max(0, 1 - (mt - 0.86) / 0.14) : 1;
    this.moon.setPosition(mx, my).setAlpha(setFade * (1 - dawnK));
    this.moon.setScale(artScale() * Math.min(1, this.skyH / (1.1 * CELL)));
    // Звёзды мерцают и гаснут к рассвету.
    for (const s of this.stars) {
      const tw = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin((timeMs / 1000) * s.speed + s.phase);
      s.img.setPosition(v.x + s.u * v.w, v.y + s.v * this.skyH).setAlpha(tw * (1 - dawnK));
    }
    this.dawn.setAlpha(dawnK);
    // Солнце встаёт на победе.
    const sunX = v.x + v.w * 0.78;
    this.sun
      .setPosition(sunX, this.bottom + 0.25 * CELL - sunrise * this.skyH * 0.75)
      .setAlpha(Math.min(1, sunrise * 1.5 + dawnK * 0.25));
    this.sun.setScale(artScale() * Math.min(1, this.skyH / (1.1 * CELL)));
    // Птицы на рассвете.
    this.birds.forEach((b, i) => {
      if (dawnK <= 0.05) {
        b.setAlpha(0);
        return;
      }
      const t = (timeMs / 9000 + i * 0.31) % 1;
      b.setPosition(
        v.x + t * v.w,
        v.y + this.skyH * (0.25 + 0.12 * i) + (reducedMotion ? 0 : Math.sin(timeMs / 300 + i) * 3),
      ).setAlpha(Math.min(1, dawnK * 1.5));
    });
  }
}
