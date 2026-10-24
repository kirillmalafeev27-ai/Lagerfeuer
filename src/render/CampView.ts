// Лагерь: поленница с половинами «Birke | Eiche» (7.5.8) и палатка с фонарём и колбасками (7.5.9).

import Phaser from 'phaser';
import { look } from '../config/look.ts';
import { K } from '../art/manifest.ts';
import { artScale } from '../art/registry.ts';
import { cornerCenters } from '../art/recipes/ground.ts';
import type { Cell } from '../core/clearing.ts';
import type { WoodKind } from '../core/wood.ts';
import { artImage, setArt, type BoilClock } from './art.ts';
import { DEPTH, depthByY } from './depth.ts';

const CELL = look.cell;

export function cornerWorld(c: Cell): { x: number; y: number } {
  const p = cornerCenters()[c];
  return { x: p.x * CELL, y: p.y * CELL };
}

export class CampView {
  readonly pilePos: { x: number; y: number };
  readonly tentPos: { x: number; y: number };
  private readonly boil: BoilClock;
  private readonly hasOak: boolean;
  private readonly base: Phaser.GameObjects.Image;
  private readonly birch: Phaser.GameObjects.Image;
  private readonly oak: Phaser.GameObjects.Image;
  private readonly signBirch: Phaser.GameObjects.Image;
  private readonly signOak: Phaser.GameObjects.Image;
  private readonly glowBirch: Phaser.GameObjects.Image;
  private readonly glowOak: Phaser.GameObjects.Image;
  private readonly tent: Phaser.GameObjects.Image;
  private readonly lantern: Phaser.GameObjects.Image;
  private readonly lanternGlow: Phaser.GameObjects.Image;
  readonly sausages: Phaser.GameObjects.Image;
  private readonly shadowTent: Phaser.GameObjects.Image;
  private readonly all: Phaser.GameObjects.GameObject[] = [];
  private wink = 0;
  private shake = 0;
  selected: WoodKind = 'birch';

  constructor(scene: Phaser.Scene, boil: BoilClock, pile: Cell, tent: Cell, hasOak: boolean) {
    this.boil = boil;
    this.hasOak = hasOak;
    const p = cornerWorld(pile);
    this.pilePos = { x: p.x, y: p.y + 0.18 * CELL };
    const t = cornerWorld(tent);
    this.tentPos = { x: t.x, y: t.y + 0.28 * CELL };
    const px = this.pilePos.x;
    const py = this.pilePos.y;
    const half = (look.pile.w / 4) * CELL;
    const d = depthByY(py);
    this.base = artImage(scene, px, py + 0.06 * CELL, K.pileBase).setDepth(d - 0.2);
    this.glowBirch = artImage(scene, px - half, py - 0.02 * CELL, K.pileGlowBirch)
      .setDepth(DEPTH.overHints - 2)
      .setAlpha(0);
    this.glowOak = artImage(scene, px + half, py - 0.02 * CELL, K.pileGlowOak)
      .setDepth(DEPTH.overHints - 2)
      .setAlpha(0);
    this.birch = artImage(scene, px - half, py, K.pileBirch, 0).setDepth(d);
    this.oak = artImage(scene, px + half, py, hasOak ? K.pileOak : K.pileStump, 0).setDepth(d);
    this.signBirch = artImage(scene, px - half, py - 0.52 * CELL, K.signBirch).setDepth(
      DEPTH.overHints - 1,
    );
    this.signOak = artImage(scene, px + half, py - 0.52 * CELL, K.signOak)
      .setDepth(DEPTH.overHints - 1)
      .setVisible(hasOak);

    const tx = this.tentPos.x;
    const ty = this.tentPos.y;
    this.shadowTent = artImage(scene, tx, ty, K.shadow)
      .setDepth(DEPTH.shadows)
      .setScale(artScale() * 1.7, artScale() * 1.2)
      .setAlpha(0.8);
    this.tent = artImage(scene, tx, ty, K.tent, 0).setDepth(depthByY(ty));
    // Фонарь — на шесте со стороны поляны.
    const side = tent === 0 || tent === 2 ? 1 : -1;
    const lx = tx + side * 0.78 * CELL;
    const ly = ty - 0.02 * CELL;
    this.lantern = artImage(scene, lx, ly, K.lantern, 0).setDepth(depthByY(ly));
    if (side < 0) this.lantern.setFlipX(true);
    this.lanternGlow = artImage(scene, lx + side * 0.1 * CELL, ly - 0.75 * CELL, K.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.glow)
      .setScale(artScale() * 0.35)
      .setAlpha(0.5);
    this.sausages = artImage(
      scene,
      tx - side * 0.18 * CELL,
      ty + 0.02 * CELL,
      K.sausages,
      0,
    ).setDepth(depthByY(ty + 2));
    if (side < 0) this.sausages.setFlipX(true);
    this.all.push(
      this.base,
      this.glowBirch,
      this.glowOak,
      this.birch,
      this.oak,
      this.signBirch,
      this.signOak,
      this.shadowTent,
      this.tent,
      this.lantern,
      this.lanternGlow,
      this.sausages,
    );
  }

  /** Табличка «Birke» подмигивает (дуб на угли). */
  winkBirch(): void {
    this.wink = 1;
  }

  /** Палатка трясётся (герой нырнул в неё). */
  shakeTent(): void {
    this.shake = 1;
  }

  /** Фонарь: положение для света. */
  lanternPos(): { x: number; y: number } {
    return { x: this.lantern.x, y: this.lantern.y - 0.75 * CELL };
  }

  update(dtMs: number, timeMs: number, reducedMotion: boolean): void {
    setArt(this.birch, K.pileBirch, this.boil.variant(0));
    setArt(this.oak, this.hasOak ? K.pileOak : K.pileStump, this.boil.variant(1));
    setArt(this.tent, K.tent, this.boil.variant(2));
    setArt(this.lantern, K.lantern, this.boil.variant(0));
    setArt(this.sausages, K.sausages, this.boil.variant(1));
    const pulse = reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(timeMs / 300);
    const wantB = this.selected === 'birch' ? 1 : 0;
    const wantO = this.selected === 'oak' && this.hasOak ? 1 : 0;
    const k = Math.min(1, dtMs / 120);
    this.glowBirch.setAlpha(this.glowBirch.alpha + (wantB * pulse - this.glowBirch.alpha) * k);
    this.glowOak.setAlpha(this.glowOak.alpha + (wantO * pulse - this.glowOak.alpha) * k);
    if (this.wink > 0) {
      this.wink = Math.max(0, this.wink - dtMs / 700);
      const s = 1 + (reducedMotion ? 0 : Math.sin(this.wink * Math.PI * 4) * 0.12);
      this.signBirch.setScale(artScale() * s);
      this.signBirch.setAlpha(Math.floor(this.wink * 8) % 2 === 0 ? 1 : 0.5);
    } else this.signBirch.setScale(artScale()).setAlpha(1);
    this.signOak.setAlpha(this.selected === 'oak' ? 1 : 0.8);
    this.signBirch.setAlpha(
      this.wink > 0 ? this.signBirch.alpha : this.selected === 'birch' ? 1 : 0.8,
    );
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dtMs / 1500);
      this.tent.setRotation(reducedMotion ? 0 : Math.sin(timeMs / 35) * 0.04 * this.shake);
    } else this.tent.setRotation(0);
    this.lantern.setRotation(reducedMotion ? 0 : Math.sin(timeMs / 900) * 0.015);
    this.lanternGlow.setAlpha(0.42 + (reducedMotion ? 0 : 0.06 * Math.sin(timeMs / 310)));
  }

  /** Попадание по половине поленницы (в координатах мира). */
  hitPile(wx: number, wy: number): WoodKind | null {
    const { x, y } = this.pilePos;
    if (wy < y - 0.85 * CELL || wy > y + 0.3 * CELL) return null;
    if (wx >= x - 0.7 * CELL && wx < x) return 'birch';
    if (wx >= x && wx <= x + 0.7 * CELL) return 'oak';
    return null;
  }

  destroy(): void {
    for (const o of this.all) o.destroy();
  }
}
