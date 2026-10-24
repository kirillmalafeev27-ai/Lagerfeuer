// Сочность (раздел 9): слова-звуки (не больше трёх сразу), тряска камеры.
// Ничто здесь не блокирует ввод и не задерживает правила.

import Phaser from 'phaser';
import { timing } from '../config/balance.ts';
import { look } from '../config/look.ts';
import { mix, palette } from '../config/palette.ts';
import { wordKey } from '../art/manifest.ts';
import { type WordColors, pastelWord } from '../shared/pastelKit.ts';
import { DEPTH } from './depth.ts';

const CELL = look.cell;

export type WordTone = 'caption' | 'wind' | 'danger' | 'chalk' | 'fire';

const TONES: Record<WordTone, WordColors> = {
  caption: { fill: palette.caption, shade: mix(palette.caption, palette.chalk, 0.4), chalk: palette.chalk },
  wind: { fill: palette.wind, shade: palette.hero.jacket, chalk: palette.chalk },
  danger: { fill: palette.chalk, shade: palette.stone.base, chalk: palette.chalk },
  chalk: { fill: palette.chalk, shade: palette.stone.light, chalk: palette.chalk },
  fire: { fill: palette.fire.mid, shade: palette.fire.core, chalk: palette.chalk },
};

interface Word {
  img: Phaser.GameObjects.Image;
  scale: number;
  t: number;
  x: number;
  y: number;
  dur: number;
}

export class Juice {
  private readonly scene: Phaser.Scene;
  private readonly words: Word[] = [];
  reducedMotion = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Слово-звук над событием, со смещением вверх. */
  word(text: string, x: number, y: number, tone: WordTone = 'caption', scale = 1): void {
    const key = wordKey(`${text}|${tone}`);
    if (!this.scene.textures.exists(key)) {
      const c = pastelWord(text, TONES[tone], look.word.px);
      this.scene.textures.addCanvas(key, c);
    }
    while (this.words.length >= timing.maxWords) {
      const old = this.words.shift();
      old?.img.destroy();
    }
    const img = this.scene.add.image(x, y, key).setDepth(DEPTH.overWords).setOrigin(0.5, 1);
    const s = look.word.scale * scale * (CELL / look.word.px) * 0.42;
    img.setScale(this.reducedMotion ? s : s * 0.6);
    this.words.push({ img, scale, t: 0, x, y, dur: timing.wordRiseMs + timing.wordHoldMs });
  }

  update(dtMs: number): void {
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dtMs;
      const p = w.t / w.dur;
      if (p >= 1) {
        w.img.destroy();
        this.words.splice(i, 1);
        continue;
      }
      const rise = Math.min(1, w.t / timing.wordRiseMs);
      const ease = 1 - Math.pow(1 - rise, 3);
      const base = look.word.scale * w.scale * (CELL / look.word.px) * 0.42;
      const pop = this.reducedMotion ? 1 : rise < 0.25 ? 0.6 + (rise / 0.25) * 0.55 : 1.15 - Math.min(0.15, (rise - 0.25) * 0.4);
      w.img.setPosition(w.x, w.y - ease * look.word.rise * CELL);
      w.img.setScale(base * pop);
      w.img.setAlpha(p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1);
    }
  }

  /** Тряска камеры на px экранных пикселей (выключена в «меньше движения»). */
  shake(camera: Phaser.Cameras.Scene2D.Camera, px: number): void {
    if (this.reducedMotion) return;
    const intensity = px / Math.max(1, Math.min(camera.width, camera.height));
    camera.shake(timing.shakeMs, intensity);
  }

  clear(): void {
    for (const w of this.words) w.img.destroy();
    this.words.length = 0;
  }
}
