// Загрузка (7.3.6–7.3.7): дождаться шрифтов, сгенерировать текстуры под экраном загрузки.

import Phaser from 'phaser';
import { look } from '../config/look.ts';
import { palette } from '../config/palette.ts';
import { type GenProgress, generateArt } from '../art/ArtFactory.ts';
import { setArtRes } from '../art/registry.ts';
import { configureKit } from '../shared/pastelKit.ts';
import type { SceneHost } from './GameScene.ts';

export interface BootData {
  host: SceneHost;
  seed: number;
  onProgress?: (p: GenProgress) => void;
  onGenerated?: (ms: number) => void;
}

export async function waitFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('64px "Rubik Scribble"'),
        document.fonts.load('400 20px Rubik'),
        document.fonts.load('500 20px Rubik'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* без шрифта — запасной */
  }
}

export class BootScene extends Phaser.Scene {
  private data0!: BootData;

  constructor() {
    super('boot');
  }

  init(data: BootData): void {
    this.data0 = data;
  }

  create(): void {
    void this.run();
  }

  private async run(): Promise<void> {
    const d = this.data0;
    await waitFonts();
    const C = d.host.quality === 'low' ? look.texCell.low : look.texCell.high;
    const res = C / look.cell;
    configureKit({ paper: palette.paper, res });
    setArtRes(res);
    const tex = this.textures;
    const ms = await generateArt(
      {
        addCanvas: (key, canvas) => {
          tex.addCanvas(key, canvas);
        },
        exists: (key) => tex.exists(key),
      },
      { C, res, seed: d.seed },
      d.onProgress,
    );
    d.onGenerated?.(ms);
    this.scene.start('game', { host: d.host });
  }
}
