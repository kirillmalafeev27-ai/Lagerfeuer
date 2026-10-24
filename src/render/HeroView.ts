// Герой на поляне (7.5.10): части-спрайты кипят, движения плавные. Анимации только
// догоняют состояние — никогда не задерживают ввод и правила.

import Phaser from 'phaser';
import { timing } from '../config/balance.ts';
import { look } from '../config/look.ts';
import { K } from '../art/manifest.ts';
import { artScale } from '../art/registry.ts';
import { HERO_JOINTS } from '../art/recipes/hero.ts';
import { type Cell, cellCol, cellRow } from '../core/clearing.ts';
import type { WoodKind } from '../core/wood.ts';
import { artImage, setArt, type BoilClock } from './art.ts';
import { DEPTH, depthByY } from './depth.ts';

const CELL = look.cell;
const H = look.hero.h * CELL;

export function cellCenter(c: Cell): { x: number; y: number } {
  return { x: (cellCol(c) + 0.5) * CELL, y: (cellRow(c) + 0.5) * CELL + 0.16 * CELL };
}

type Pose = 'idle' | 'ready' | 'alarm' | 'wind' | 'lose' | 'win' | 'gone';

interface Hop {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
}

export class HeroView {
  readonly root: Phaser.GameObjects.Container;
  x: number;
  y: number;
  private readonly scene: Phaser.Scene;
  private readonly boil: BoilClock;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly pompom: Phaser.GameObjects.Image;
  private readonly armBack: Phaser.GameObjects.Image;
  private readonly armFront: Phaser.GameObjects.Image;
  private readonly carry: Phaser.GameObjects.Image;
  private readonly star: Phaser.GameObjects.Image;
  private readonly breath: Phaser.GameObjects.Particles.ParticleEmitter;
  private hop: Hop | null = null;
  private facing = 1;
  private pose: Pose = 'idle';
  private actionT = 0;
  private action: 'none' | 'throw' | 'pickup' | 'shrug' | 'clap' = 'none';
  private squash = 0;
  private starT = 0;
  private yawnT = 0;
  private carryKind: WoodKind | null = null;
  private carryCount = 0;
  private warmTarget: { x: number; y: number } | null = null;
  private breathAcc = 0;
  private hidden = false;
  reducedMotion = false;

  constructor(scene: Phaser.Scene, boil: BoilClock, cell: Cell) {
    this.scene = scene;
    this.boil = boil;
    const p = cellCenter(cell);
    this.x = p.x;
    this.y = p.y;
    this.shadow = artImage(scene, p.x, p.y, K.heroShadow).setDepth(DEPTH.shadows).setAlpha(0.8);
    this.root = scene.add.container(p.x, p.y);
    this.armBack = artImage(scene, -0.1 * H, -HERO_JOINTS.shoulder * H, K.heroArm, 0).setTint(0xb8c4c4);
    this.legs = artImage(scene, 0, -HERO_JOINTS.hip * H, K.heroLegs, 0);
    this.body = artImage(scene, 0, -HERO_JOINTS.hip * H + 0.035 * H, K.heroBody, 0);
    this.head = artImage(scene, 0.01 * H, -HERO_JOINTS.neck * H + 0.025 * H, K.heroHead, 0);
    this.pompom = artImage(scene, -0.005 * H, -HERO_JOINTS.hatTop * H + 0.035 * H, K.heroPompom);
    this.carry = artImage(scene, 0.07 * H, -0.47 * H, K.heroCarryBirch2, 0).setVisible(false);
    this.armFront = artImage(scene, 0.08 * H, -HERO_JOINTS.shoulder * H, K.heroArm, 0);
    this.root.add([this.armBack, this.legs, this.body, this.carry, this.head, this.pompom, this.armFront]);
    this.star = artImage(scene, p.x, p.y - 1.15 * H, K.star).setDepth(DEPTH.overHints).setAlpha(0);
    this.breath = scene.add.particles(0, 0, K.breath, {
      lifespan: 900,
      speedX: { min: 10, max: 22 },
      speedY: { min: -14, max: -6 },
      scale: { start: artScale() * 0.4, end: artScale() * 1.2 },
      alpha: { start: 0.5, end: 0 },
      emitting: false,
      maxParticles: 4,
    });
    this.breath.setDepth(DEPTH.atmosphere);
    this.syncDepth();
  }

  /** Прыжок на клетку (шаг): 200 мс, с приплющиванием. */
  stepTo(cell: Cell): void {
    const p = cellCenter(cell);
    this.hop = { fx: this.x, fy: this.y, tx: p.x, ty: p.y, t: 0, dur: timing.stepMs };
    if (Math.abs(p.x - this.x) > 1) this.facing = p.x > this.x ? 1 : -1;
  }

  /** Поставить сразу (новый раунд, поворот экрана). */
  placeAt(cell: Cell): void {
    const p = cellCenter(cell);
    this.hop = null;
    this.x = p.x;
    this.y = p.y;
    this.hidden = false;
    this.pose = 'idle';
    this.root.setVisible(true).setAlpha(1).setScale(this.facing, 1);
    this.shadow.setVisible(true);
  }

  face(targetX: number): void {
    if (Math.abs(targetX - this.x) > 4) this.facing = targetX > this.x ? 1 : -1;
  }

  setCarry(kind: WoodKind | null, count: number): void {
    this.carryKind = kind;
    this.carryCount = count;
  }

  /** Бросок по дуге в костёр: полено летит, рука делает взмах. */
  throwTo(target: { x: number; y: number }, kind: WoodKind): void {
    this.face(target.x);
    this.action = 'throw';
    this.actionT = 0;
    const from = { x: this.x + this.facing * 0.12 * H, y: this.y - 0.6 * H };
    const key = kind === 'birch' ? K.logBirch : K.logOak;
    const log = artImage(this.scene, from.x, from.y, key, 0).setDepth(DEPTH.objects + 99);
    const dur = timing.throwMs;
    const peak = Math.min(from.y, target.y) - 0.45 * CELL;
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const x = from.x + (target.x - from.x) * t;
        const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * peak + t * t * target.y;
        log.setPosition(x, y).setRotation(t * 5 * this.facing);
      },
      onComplete: () => log.destroy(),
    });
  }

  pickup(): void {
    this.action = 'pickup';
    this.actionT = 0;
  }

  shrug(): void {
    this.action = 'shrug';
    this.actionT = 0;
  }

  clap(): void {
    this.action = 'clap';
    this.actionT = 0;
  }

  correctStar(): void {
    this.starT = 1;
  }

  yawn(): void {
    this.yawnT = 1;
  }

  setPose(p: Pose): void {
    this.pose = p;
  }

  /** Греть руки у ближайшего костра. */
  warmAt(p: { x: number; y: number } | null): void {
    this.warmTarget = p;
  }

  /** Поражение: с визгом ныряет в палатку. */
  diveInto(tent: { x: number; y: number }): void {
    this.pose = 'lose';
    this.hop = { fx: this.x, fy: this.y, tx: tent.x, ty: tent.y, t: 0, dur: 420 };
    this.face(tent.x);
  }

  update(dtMs: number, timeMs: number, nightShare: number): void {
    const rm = this.reducedMotion;
    // Перемещение: плавная дуга прыжка.
    let lift = 0;
    let hopping = false;
    if (this.hop) {
      const h = this.hop;
      h.t = Math.min(1, h.t + dtMs / h.dur);
      const e = h.t < 0.5 ? 2 * h.t * h.t : 1 - Math.pow(-2 * h.t + 2, 2) / 2;
      this.x = h.fx + (h.tx - h.fx) * e;
      this.y = h.fy + (h.ty - h.fy) * e;
      lift = rm ? 0 : Math.sin(h.t * Math.PI) * 0.22 * CELL;
      hopping = h.t < 1;
      if (h.t >= 1) {
        this.hop = null;
        this.squash = rm ? 0 : 1;
        if (this.pose === 'lose') {
          this.hidden = true;
          this.pose = 'gone';
        }
      }
    }
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dtMs / 160);
    this.actionT += dtMs;
    const actDur = this.action === 'throw' ? timing.throwMs : this.action === 'pickup' ? timing.pickupMs : this.action === 'clap' ? 380 : 400;
    if (this.action !== 'none' && this.actionT > actDur) this.action = 'none';
    const at = this.action === 'none' ? 0 : Math.min(1, this.actionT / actDur);

    // Дыхание и поза.
    const breathe = rm ? 0 : Math.sin(timeMs / 520) * 0.012;
    const sq = this.squash * 0.12;
    const stomp = this.pose === 'ready' && !rm ? Math.abs(Math.sin(timeMs / 140)) * 0.04 * CELL : 0;
    this.root.setPosition(this.x, this.y - lift - stomp);
    this.root.setScale(this.facing * (1 + sq * 0.6), 1 - sq + breathe);
    this.root.setVisible(!this.hidden);
    this.shadow.setPosition(this.x, this.y + 2).setVisible(!this.hidden).setScale(artScale() * (1 - lift / (0.6 * CELL)));

    const v = this.boil.variant();
    setArt(this.legs, hopping ? K.heroLegsHop : K.heroLegs, v);
    setArt(this.body, K.heroBody, this.boil.variant(1));
    const yawning = this.yawnT > 0;
    if (this.yawnT > 0) this.yawnT = Math.max(0, this.yawnT - dtMs / 1400);
    setArt(this.head, yawning && this.yawnT > 0.15 ? K.heroHeadYawn : K.heroHead, this.boil.variant(2));
    setArt(this.armBack, K.heroArm, this.boil.variant(1));
    setArt(this.armFront, K.heroArm, this.boil.variant(2));

    // Руки: покой, греет руки, бросок, набор дров, развести руками, придержать шапку, победа.
    let front = 0.12 + (rm ? 0 : Math.sin(timeMs / 600) * 0.04);
    let back = -0.12;
    if (this.warmTarget && this.pose === 'idle' && !hopping) {
      front = -1.25;
      back = -1.0;
    }
    if (this.carryKind === 'birch') front = -0.5;
    if (this.carryKind === 'oak') {
      front = -2.35;
    }
    if (this.pose === 'wind') front = -2.7;
    if (this.pose === 'alarm') {
      front = -1.6;
      back = -0.4;
    }
    if (this.pose === 'win') {
      front = -2.8 + (rm ? 0 : Math.sin(timeMs / 140) * 0.35);
      back = -2.5;
    }
    if (this.action === 'throw') front = -2.6 + at * 2.2;
    if (this.action === 'pickup') {
      front = -0.2 - Math.sin(at * Math.PI) * 0.9;
      back = -0.2 - Math.sin(at * Math.PI) * 0.6;
    }
    if (this.action === 'shrug') {
      front = -1.1 * Math.sin(at * Math.PI);
      back = -1.1 * Math.sin(at * Math.PI);
    }
    if (this.action === 'clap') {
      front = -1.3 + Math.abs(Math.sin(at * Math.PI * 3)) * 0.4;
      back = -1.2;
    }
    this.armFront.setRotation(front);
    this.armBack.setRotation(back);

    // Дрова в руках: две берёзы под мышкой или дуб на плече.
    if (this.carryKind === null) this.carry.setVisible(false);
    else {
      const key = this.carryKind === 'oak' ? K.heroCarryOak : this.carryCount >= 2 ? K.heroCarryBirch2 : K.heroCarryBirch1;
      setArt(this.carry, key, v);
      this.carry.setVisible(true);
      if (this.carryKind === 'oak') this.carry.setPosition(-0.02 * H, -0.74 * H).setRotation(-0.12);
      else this.carry.setPosition(0.07 * H, -0.46 * H).setRotation(0.05);
      if (this.action === 'pickup') this.carry.setScale(artScale() * Math.min(1, at * 1.4));
      else this.carry.setScale(artScale());
    }

    // Помпон: дыбом от тревоги, подскакивает в прыжке.
    const pomUp = this.pose === 'alarm' ? 1.45 : 1;
    this.pompom.setScale(artScale(), artScale() * pomUp);
    this.pompom.y = -HERO_JOINTS.hatTop * H + 0.035 * H - (pomUp - 1) * 0.05 * H - (hopping ? 0.02 * H : 0);

    // Меловая звёздочка над героем за верный ответ.
    if (this.starT > 0) {
      this.starT = Math.max(0, this.starT - dtMs / 650);
      const t = 1 - this.starT;
      this.star.setPosition(this.x, this.y - 1.12 * H - t * 0.25 * CELL).setAlpha(this.starT).setScale(artScale() * (0.7 + 0.5 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5)));
    } else this.star.setAlpha(0);

    // Пар изо рта к утру.
    if (nightShare > 0.6 && !this.hidden && !rm) {
      this.breathAcc += dtMs / 1000;
      if (this.breathAcc > 2.6) {
        this.breathAcc = 0;
        this.breath.emitParticleAt(this.x + this.facing * 0.14 * H, this.y - 0.8 * H, 1);
      }
    }
    this.syncDepth();
  }

  private syncDepth(): void {
    this.root.setDepth(depthByY(this.y + 1));
  }

  headPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y - 0.95 * H };
  }

  hitTest(wx: number, wy: number): boolean {
    return Math.abs(wx - this.x) < 0.3 * CELL && wy < this.y + 0.08 * CELL && wy > this.y - H;
  }
}
