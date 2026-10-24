// Загрузка (7.3.6–7.3.7): дождаться шрифтов, сгенерировать текстуры под экраном загрузки.

import Phaser from 'phaser';
import { look } from '../config/look.ts';
import { palette } from '../config/palette.ts';
import { type GenProgress, generateArt } from '../art/ArtFactory.ts';
import { setArtRes } from '../art/registry.ts';
import { type SfxWord, sfxDe } from '../i18n/sfx.de.ts';
import { sfxRu } from '../i18n/sfx.ru.ts';
import { WORD_TONE, ensureWordTexture } from '../render/juice.ts';
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
        // Канва уходит в Phaser как картинка: CanvasTexture читала бы пиксели обратно.
        addCanvas: (key, canvas) => {
          tex.addImage(key, canvas as unknown as HTMLImageElement);
        },
        exists: (key) => tex.exists(key),
      },
      { C, res, seed: d.seed },
      d.onProgress,
    );
    // Слова-звуки — тоже заранее: первое появление слова не должно подвешивать кадр.
    const dict = d.host.wordsLang === 'ru' ? sfxRu : sfxDe;
    for (const w of Object.keys(WORD_TONE) as SfxWord[])
      ensureWordTexture(tex, dict[w], WORD_TONE[w]);
    await this.pretouchShaders();
    d.onGenerated?.(ms);
    this.scene.start('game', { host: d.host });
  }

  /**
   * Phaser 4 собирает шейдер под число текстур в пачке (1…maxTextures). Каждая новая сборка
   * посреди ночи — подвисание кадра, поэтому все варианты запрашиваются здесь, под экраном
   * загрузки: k кадров подряд рисуют по k разных крошечных текстур.
   */
  private async pretouchShaders(): Promise<void> {
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const max = Math.max(1, Math.min(32, renderer.maxTextures ?? 16));
    const keys = this.textures.getTextureKeys().slice(0, max);
    const imgs: Phaser.GameObjects.Image[] = [];
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    for (let k = 1; k <= keys.length; k++) {
      for (const im of imgs) im.destroy();
      imgs.length = 0;
      for (let i = 0; i < k; i++)
        imgs.push(this.add.image(1, 1, keys[i]).setScale(0.002).setAlpha(0.01));
      await frame();
    }
    for (const im of imgs) im.destroy();
  }
}
