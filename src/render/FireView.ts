// Костёр (7.5.4–7.5.7, 7.5.11–7.5.13): поленья шалашиком, языки пламени, угли, ореол, искры,
// дым, шкала, кольцо срочности, глаза и волк у края света, ветер.

import Phaser from 'phaser';
import { balance, light, timing } from '../config/balance.ts';
import { look } from '../config/look.ts';
import { hex, palette } from '../config/palette.ts';
import { K } from '../art/manifest.ts';
import { artScale } from '../art/registry.ts';
import { gaugeSize } from '../art/recipes/hud.ts';
import type { Side } from '../core/clearing.ts';
import type { RingLevel } from '../core/risk.ts';
import type { Fire, Shelter } from '../core/state.ts';
import { artImage, setArt, type BoilClock } from './art.ts';
import { DEPTH, depthByY } from './depth.ts';
import { OUTWARD, pitWorld } from './WorldView.ts';

const CELL = look.cell;

/** Высота пламени от топлива: 0.3 — низкие язычки, 1.5 — средний огонь, 3 — высокий. */
export function flameScale(fuel: number): number {
  return 0.3 + 0.7 * Math.pow(Math.max(0, Math.min(3, fuel)) / 3, 0.75);
}

/** Радиус света костра, клеток (8.2). */
export function fireLightRadius(fuel: number): number {
  return light.fireRadiusBase + light.fireRadiusPerFuel * fuel;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Секторы позади костра, где кружат волки (градусы от направления «наружу»). */
const EYE_ARCS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, -35, 35, -65, 65],
  [-20, -50, 10, -75],
  [-50, 50, -70, 70],
  [-20, -50, 10, -75],
];

/** Язык пламени: слой, форма, место в веере и с какого топлива он появляется. */
interface TongueDef {
  layer: number;
  shape: number;
  /** Сдвиг основания от середины, клеток. */
  off: number;
  /** Наклон наружу, рад. */
  lean: number;
  /** Доля полной высоты слоя. */
  hf: number;
  minFuel: number;
  flip?: boolean;
}

// Веер: в середине самый высокий язык, боковые ниже и клонятся наружу — силуэт капли.
const TONGUES: readonly TongueDef[] = [
  { layer: 0, shape: 0, off: -0.15, lean: -0.42, hf: 0.5, minFuel: 1.8 },
  { layer: 0, shape: 0, off: 0.155, lean: 0.4, hf: 0.48, minFuel: 2.2, flip: true },
  { layer: 0, shape: 1, off: -0.085, lean: -0.2, hf: 0.74, minFuel: 0.6 },
  { layer: 0, shape: 1, off: 0.09, lean: 0.22, hf: 0.7, minFuel: 0.9, flip: true },
  { layer: 0, shape: 0, off: 0, lean: 0.02, hf: 1, minFuel: 0 },
  { layer: 1, shape: 1, off: -0.07, lean: -0.24, hf: 0.72, minFuel: 1.0 },
  { layer: 1, shape: 1, off: 0.075, lean: 0.24, hf: 0.68, minFuel: 1.4, flip: true },
  { layer: 1, shape: 0, off: 0.01, lean: 0, hf: 1, minFuel: 0 },
  { layer: 2, shape: 1, off: 0.035, lean: 0.14, hf: 0.7, minFuel: 1.2, flip: true },
  { layer: 2, shape: 0, off: -0.01, lean: 0, hf: 1, minFuel: 0 },
];

interface Tongue extends TongueDef {
  img: Phaser.GameObjects.Image;
  phase: number;
  speed: number;
  sway: number;
  boilOff: number;
  /** Плавное появление 0..1. */
  presence: number;
  /** Всполох: язык ненадолго вытягивается. */
  flick: number;
}

interface EyePair {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  blinkAt: number;
  blinkUntil: number;
  alpha: number;
  x: number;
  y: number;
}

export interface FireFrame {
  fire: Fire;
  /** Порыв дует прямо сейчас. */
  gust: boolean;
  /** Порыв объявлен (листья, значок). */
  warned: boolean;
  ring: RingLevel | null;
  oakGhost: boolean;
  reducedMotion: boolean;
  /** Ночь кончилась победой — волки уходят. */
  dawnDone: boolean;
}

export class FireView {
  readonly side: Side;
  readonly pit: { x: number; y: number };
  readonly shelter: Shelter;
  /** Текущий радиус света, клеток (плавно следует за топливом). */
  lightR: number;
  /** Вспышка розжига: прибавка к радиусу, клеток. */
  flash = 0;
  flicker = 1;
  /** Сила света углей 0..1. */
  emberLight = 0;

  private readonly boil: BoilClock;
  private readonly boilOff: number;
  private readonly logs: Phaser.GameObjects.Image[] = [];
  private readonly tongues: Tongue[] = [];
  private readonly embers: Phaser.GameObjects.Image;
  private readonly emberGlow: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly bloom: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly leaves: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly gauge: Phaser.GameObjects.Container;
  private readonly gaugeLogs: Phaser.GameObjects.Image[] = [];
  private readonly gaugeHatch: Phaser.GameObjects.Image;
  private readonly gaugeStrip: Phaser.GameObjects.Image;
  private readonly gaugeGhost: Phaser.GameObjects.Image;
  private readonly gaugePlate: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly windIcon: Phaser.GameObjects.Image;
  private readonly wolf: Phaser.GameObjects.Image;
  private readonly eyes: EyePair[] = [];
  private eyeSpots: Array<{ x: number; y: number }> = [];
  private wolfSpot = { x: 0, y: 0 };
  private sparkAcc = 0;
  private smokeAcc = 0;
  private leafAcc = 0;
  private flickerJit = 1;
  private lastBoil = -1;
  private gaugeBlink = 0;
  private wolfShown = 0;
  private wolfJump = 0;

  constructor(scene: Phaser.Scene, side: Side, shelter: Shelter, boil: BoilClock, startFuel: number) {
    this.side = side;
    this.shelter = shelter;
    this.boil = boil;
    this.boilOff = side;
    this.pit = pitWorld(side);
    this.lightR = fireLightRadius(startFuel);
    const { x, y } = this.pit;
    const s = artScale();
    const baseDepth = depthByY(y);

    this.glow = artImage(scene, x, y - 0.18 * CELL, K.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow);
    this.emberGlow = artImage(scene, x, y, K.glowEmber).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow).setVisible(false);

    // Поленья: заднее и боковые — за пламенем, переднее (третье) — перед ним.
    for (let i = 0; i < 4; i++) this.logs.push(artImage(scene, x, y, K.logBirch, 0).setDepth(baseDepth + (i === 2 ? 0.2 : 0.01 * i)).setVisible(false));
    this.embers = artImage(scene, x, y + 0.02 * CELL, K.embers, 0).setDepth(baseDepth + 0.05).setVisible(false);

    // Языки пламени: веер из трёх слоёв, ближе к середине — выше по глубине.
    TONGUES.forEach((d, i) => {
      const img = artImage(scene, x + d.off * CELL, y, K.tongue(d.layer, d.shape), 0).setFlipX(!!d.flip);
      img.setDepth(baseDepth + 0.1 + d.layer * 0.01 + i * 0.0005);
      this.tongues.push({
        ...d,
        img,
        phase: Math.random() * Math.PI * 2,
        speed: 5 + Math.random() * 3 + d.layer,
        sway: 0.06 + Math.random() * 0.05,
        boilOff: Math.floor(Math.random() * 3),
        presence: startFuel >= d.minFuel ? 1 : 0,
        flick: 0,
      });
    });
    this.bloom = artImage(scene, x, y, K.bloom).setBlendMode(Phaser.BlendModes.ADD).setDepth(baseDepth + 0.15);

    this.sparks = scene.add.particles(x, y - 0.3 * CELL, K.spark(1), {
      lifespan: { min: 700, max: 1300 },
      speedX: { min: -24, max: 24 },
      speedY: { min: -150, max: -70 },
      accelerationY: -20,
      scale: { start: s * 1.1, end: 0 },
      alpha: { start: 1, end: 0.2 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      maxParticles: 22,
    });
    // Искры светятся и в темноте: они над слоем тьмы.
    this.sparks.setDepth(DEPTH.dark + 1);
    this.smoke = scene.add.particles(x, y - 0.25 * CELL, K.smoke, {
      lifespan: { min: 1600, max: 2600 },
      speedX: { min: -10, max: 10 },
      speedY: { min: -46, max: -26 },
      scale: { start: s * 0.35, end: s * 1.1 },
      alpha: { start: 0.45, end: 0 },
      rotate: { min: -40, max: 40 },
      emitting: false,
      maxParticles: 12,
    });
    this.smoke.setDepth(DEPTH.atmosphere);
    const o = OUTWARD[side];
    this.leaves = scene.add.particles(x + o.x * 1.6 * CELL, y + o.y * 1.6 * CELL, K.leaf(0), {
      lifespan: { min: 1100, max: 1800 },
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      rotate: { start: 0, end: 540 },
      scale: { start: s * 1.2, end: s * 0.7 },
      alpha: { start: 0.95, end: 0 },
      emitting: false,
      maxParticles: 10,
    });
    this.leaves.setDepth(DEPTH.atmosphere);

    // Шкала: подложка, поленца, штриховка разгорающегося дуба, силуэт дуба.
    const gs = gaugeSize(CELL);
    this.gauge = scene.add.container(x, y + look.gaugeBelow * CELL).setDepth(DEPTH.overGauge);
    this.gaugePlate = artImage(scene, 0, 0, K.gaugePlate);
    this.gauge.add(this.gaugePlate);
    for (let i = 0; i < 4; i++) {
      const img = artImage(scene, 0, 0, K.gaugeBirch).setVisible(false);
      this.gaugeLogs.push(img);
      this.gauge.add(img);
    }
    this.gaugeHatch = artImage(scene, 0, 0, K.gaugeHatch).setVisible(false);
    this.gaugeStrip = artImage(scene, 0, 0, K.gaugeStrip).setVisible(false);
    this.gaugeGhost = artImage(scene, 0, 0, K.gaugeGhost).setVisible(false);
    this.gauge.add([this.gaugeHatch, this.gaugeStrip, this.gaugeGhost]);
    void gs;

    this.ring = artImage(scene, x, y + 0.04 * CELL, K.ringCalm).setDepth(DEPTH.overHints).setVisible(false);
    this.windIcon = artImage(scene, x + o.x * 0.55 * CELL, y - 1.25 * CELL, K.windIcon).setDepth(DEPTH.overHints).setVisible(false);
    if (side === 3) this.windIcon.setFlipX(true);

    this.wolf = artImage(scene, x, y, K.wolfStand, 0).setDepth(DEPTH.over - 1).setVisible(false);
    for (let i = 0; i < 3; i++) {
      const glow = artImage(scene, x, y, K.eyeGlow).setDepth(DEPTH.over).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const img = artImage(scene, x, y, K.eyes).setDepth(DEPTH.over + 1).setAlpha(0);
      this.eyes.push({ img, glow, phase: Math.random() * Math.PI * 2, blinkAt: 1000 + Math.random() * 4000, blinkUntil: 0, alpha: 0, x, y });
    }
  }

  /** Пересчитать места для глаз под видимую область (поворот экрана, ресайз). */
  layoutEyes(view: ViewRect, skyTop = view.y, skyH = 0): void {
    const o = OUTWARD[this.side];
    const base = Math.atan2(o.y, o.x);
    const m = 0.32 * CELL;
    const clearing = { x0: -0.35 * CELL, y0: -0.35 * CELL, x1: 2.35 * CELL, y1: 2.35 * CELL };
    const radii = [1.9, 1.5, 1.35];
    const spots: Array<{ x: number; y: number }> = [];
    const arcs = EYE_ARCS[this.side];
    for (let i = 0; i < 3; i++) {
      let best: { x: number; y: number } | null = null;
      for (const deg of arcs.slice(i).concat(arcs.slice(0, i))) {
        const a = base + (deg * Math.PI) / 180;
        for (let r = radii[i]; r >= 0.95; r -= 0.1) {
          const px = this.pit.x + Math.cos(a) * r * CELL;
          const py = this.pit.y + Math.sin(a) * r * CELL;
          const cx = Math.min(view.x + view.w - m, Math.max(view.x + m, px));
          // Над лесом — только в нижней части полосы неба, среди силуэтов елей.
          const cy = Math.min(view.y + view.h - m, Math.max(skyTop + skyH * 0.62, view.y + m, py));
          const inClearing = cx > clearing.x0 && cx < clearing.x1 && cy > clearing.y0 && cy < clearing.y1;
          const tooClose = spots.some((s) => Math.hypot(s.x - cx, s.y - cy) < 0.45 * CELL);
          const nearPit = Math.hypot(cx - this.pit.x, cy - this.pit.y) < 0.85 * CELL;
          if (!inClearing && !tooClose && !nearPit) {
            best = { x: cx, y: cy };
            break;
          }
        }
        if (best) break;
      }
      spots.push(best ?? { x: this.pit.x + o.x * 1.2 * CELL, y: this.pit.y + o.y * 1.2 * CELL });
    }
    this.eyeSpots = spots;
    const w0 = spots[1];
    const dx = w0.x - this.pit.x;
    const dy = w0.y - this.pit.y;
    const l = Math.hypot(dx, dy) || 1;
    this.wolfSpot = { x: this.pit.x + (dx / l) * 1.08 * CELL, y: this.pit.y + (dy / l) * 1.0 * CELL + 0.2 * CELL };
  }

  /** Подбросили берёзу, разгорелся дуб или костёр зажёгся с углей. */
  flare(strength = 1): void {
    this.flash = light.flashExtraRadius * strength;
    this.sparks.explode(Math.round(8 + 6 * strength));
  }

  wolfJumpBack(): void {
    this.wolfJump = 1;
  }

  /** Шкала мигает: полено не влезает. */
  blinkGauge(): void {
    this.gaugeBlink = 1;
  }

  /** Вспышка всех искр (старт раунда). */
  burst(): void {
    this.sparks.explode(10);
  }

  update(dtMs: number, timeMs: number, fr: FireFrame): void {
    const f = fr.fire;
    const dt = dtMs / 1000;
    const embers = f.embers !== null;
    const fuel = f.fuel;
    const C = CELL;
    const calm = this.shelter === 'sheltered' ? 0.6 : this.shelter === 'open' ? 1.6 : 1;

    // Свет: плавно к цели, мерцание в такт кипению и плавное.
    const target = embers ? light.emberRadius : fireLightRadius(fuel);
    const k = 1 - Math.exp(-dtMs / (timing.lightTweenMs / 3));
    this.lightR += (target - this.lightR) * k;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - (light.flashExtraRadius * dtMs) / timing.flashMs);
    if (this.boil.frame !== this.lastBoil) {
      this.lastBoil = this.boil.frame;
      this.flickerJit = 1 + (Math.random() * 2 - 1) * light.fireFlickerBoil;
    }
    const smooth = 1 + Math.sin(timeMs / 470 + this.side) * light.fireFlickerSmooth;
    this.flicker = fr.reducedMotion ? 1 : this.flickerJit * smooth;
    const emberFrac = embers ? Math.max(0, (f.embers ?? 0) / balance.emberA) : 0;
    this.emberLight = embers ? 0.35 + 0.65 * emberFrac : 0;

    // Поленья шалашиком.
    const items: Array<{ key: string; amount: number }> = [];
    if (!embers) for (const l of f.logs) items.push({ key: l.kind === 'birch' ? K.logBirch : K.logOak, amount: l.kind === 'birch' ? l.amount : l.amount / 2 });
    if (f.catching !== null) items.push({ key: K.logOakCatching, amount: 1 });
    const shown = items.slice(-4);
    const slots = [
      { dx: -0.11, dy: -0.06, rot: -0.85, flip: false },
      { dx: 0.11, dy: -0.06, rot: 0.85, flip: true },
      { dx: 0.0, dy: 0.05, rot: 0.08, flip: false },
      { dx: 0.02, dy: -0.12, rot: -0.12, flip: true },
    ];
    for (let i = 0; i < 4; i++) {
      const img = this.logs[i];
      const it = shown[i];
      if (!it) {
        img.setVisible(false);
        continue;
      }
      const sl = slots[i];
      setArt(img, it.key, this.boil.variant(this.boilOff + i));
      img.setVisible(true).setPosition(this.pit.x + sl.dx * C, this.pit.y + sl.dy * C).setRotation(sl.rot).setFlipX(sl.flip);
      const sc = artScale() * (0.55 + 0.45 * Math.min(1, it.amount));
      img.setScale(sc, artScale());
    }

    // Языки пламени: веер растёт с топливом, языки колышутся и вспыхивают.
    const fs = embers ? 0 : flameScale(fuel);
    const lean = fr.gust ? (this.side === 1 ? -light.windLean : this.side === 3 ? light.windLean : 0) : 0;
    const gustSquash = fr.gust && (this.side === 0 || this.side === 2) ? 0.82 : 1;
    const ease = Math.min(1, dtMs / 220);
    for (const t of this.tongues) {
      const want = !embers && fuel > 0.02 && fuel + 0.001 >= t.minFuel ? 1 : 0;
      t.presence += (want - t.presence) * ease;
      if (!fr.reducedMotion && want && t.flick <= 0 && Math.random() < dt * 0.35 * calm) t.flick = 1;
      t.flick = Math.max(0, t.flick - dtMs / 260);
      const vis = t.presence > 0.03 && fs > 0;
      t.img.setVisible(vis);
      if (!vis) continue;
      setArt(t.img, K.tongue(t.layer, t.shape), this.boil.variant(t.boilOff + this.boilOff));
      const wob = fr.reducedMotion ? 0 : Math.sin((timeMs / 1000) * t.speed * (0.8 + 0.4 * calm) + t.phase);
      const wob2 = fr.reducedMotion ? 0 : Math.sin((timeMs / 1000) * t.speed * 0.63 + t.phase * 1.7);
      const flick = 1 + 0.22 * Math.sin(t.flick * Math.PI);
      const h = fs * t.hf * t.presence * (0.86 + 0.14 * wob) * flick * gustSquash * (1 + this.flash * 0.25);
      t.img.setScale(artScale() * (0.72 + 0.28 * fs) * (0.6 + 0.4 * t.presence), artScale() * h);
      t.img.setRotation(t.lean * (0.6 + 0.4 * fs) + lean * (1 + t.layer * 0.15) + wob2 * t.sway * calm);
      t.img.setPosition(this.pit.x + t.off * C * (0.65 + 0.35 * fs), this.pit.y + 0.04 * C);
    }
    this.bloom.setVisible(fs > 0);
    if (fs > 0) {
      const pulse = fr.reducedMotion ? 1 : 0.92 + 0.08 * Math.sin(timeMs / 130 + this.side * 2);
      this.bloom.setPosition(this.pit.x, this.pit.y - (0.1 + 0.26 * fs) * C);
      this.bloom.setScale(artScale() * (0.5 + 0.5 * fs) * (1 + this.flash * 0.3));
      this.bloom.setAlpha(Math.min(1, (0.3 + 0.2 * fs) * this.flicker * pulse + this.flash * 0.3));
    }

    // Угли.
    this.embers.setVisible(embers);
    this.emberGlow.setVisible(embers);
    if (embers) {
      setArt(this.embers, K.embers, this.boil.variant(this.boilOff));
      this.emberGlow.setAlpha(light.glowAlphaEmber * (0.4 + 0.6 * emberFrac) * (fr.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(timeMs / 180)));
      this.emberGlow.setScale(artScale() * (0.9 + 0.3 * emberFrac));
    }
    // Тёплый ореол — растёртое пятно, масштаб за светом.
    this.glow.setVisible(!embers);
    if (!embers) {
      const r = (this.lightR + this.flash) * this.flicker;
      this.glow.setScale((artScale() * r) / 1.25);
      this.glow.setAlpha(light.glowAlphaFire * (0.65 + 0.35 * Math.min(1, fuel / 1.5)));
    }

    // Искры: число зависит от топлива; в порыв летят к поляне.
    if (!embers && fuel > 0.05) {
      this.sparkAcc += dt * fuel * 1.6 * (fr.gust ? 2 : 1);
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        const o = OUTWARD[this.side];
        const vx = fr.gust ? -o.x * 120 : 0;
        const vy = fr.gust ? -o.y * 80 : 0;
        this.sparks.emitParticleAt(this.pit.x + (Math.random() - 0.5) * 0.3 * C + vx * 0.1, this.pit.y - fs * 0.6 * C + vy * 0.1, 1);
      }
    }
    // Дым: разгорающийся дуб и угли.
    const smokeRate = f.catching !== null ? 2.5 : embers ? 1.6 : 0;
    if (smokeRate > 0) {
      this.smokeAcc += dt * smokeRate;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        this.smoke.emitParticleAt(this.pit.x + (Math.random() - 0.5) * 0.2 * C, this.pit.y - 0.2 * C, 1);
      }
    }
    // Листья за костром: предупреждение и порыв.
    if (fr.warned || fr.gust) {
      this.leafAcc += dt * (fr.gust ? 12 : 7);
      while (this.leafAcc >= 1) {
        this.leafAcc -= 1;
        const o = OUTWARD[this.side];
        this.leaves.setTexture(K.leaf(Math.floor(Math.random() * 3)));
        this.leaves.emitParticleAt(this.pit.x + o.x * 1.6 * C + (Math.random() - 0.5) * C * (o.x ? 0.4 : 1.2), this.pit.y + o.y * 1.6 * C + (Math.random() - 0.5) * C * (o.y ? 0.4 : 1.2), 1);
      }
    }
    this.windIcon.setVisible(fr.warned || fr.gust);
    if (fr.warned || fr.gust) {
      this.windIcon.setAlpha(fr.gust ? 1 : 0.6 + 0.4 * Math.sin(timeMs / 160));
      this.windIcon.x = this.pit.x + OUTWARD[this.side].x * 0.55 * C + (fr.reducedMotion ? 0 : Math.sin(timeMs / 230) * 3);
    }

    this.updateGauge(f, fr, dtMs, timeMs);
    this.updateRing(fr, timeMs);
    this.updateEyes(f, fr, dtMs, timeMs);
  }

  private updateGauge(f: Fire, fr: FireFrame, dtMs: number, timeMs: number): void {
    const gs = gaugeSize(CELL);
    const left = -gs.w / 2 + gs.padX;
    const unit = gs.slotW + gs.gap;
    const xAt = (u: number) => left + u * unit;
    let u = 0;
    let used = 0;
    for (const l of f.logs) {
      if (used >= this.gaugeLogs.length) break;
      const img = this.gaugeLogs[used++];
      const size = l.kind === 'birch' ? 1 : 2;
      const key = l.kind === 'birch' ? K.gaugeBirch : K.gaugeOak;
      setArt(img, key);
      const fullW = img.frame.width;
      const share = Math.max(0, Math.min(1, l.amount / size));
      const cropX = Math.round(fullW * (1 - share));
      img.setVisible(share > 0.01);
      img.setCrop(cropX, 0, fullW - cropX, img.frame.height);
      img.setPosition(xAt(u) - cropX * artScale(), 0);
      u += l.amount;
    }
    for (let i = used; i < this.gaugeLogs.length; i++) this.gaugeLogs[i].setVisible(false);
    if (f.catching !== null) {
      this.gaugeHatch.setVisible(true).setPosition(xAt(u), 0);
      const prog = 1 - Math.max(0, f.catching) / balance.oakCatchA;
      const w = this.gaugeHatch.frame.width * artScale();
      this.gaugeStrip.setVisible(true).setPosition(xAt(u) + prog * w, fr.reducedMotion ? 0 : Math.sin(timeMs / 90) * 0.6);
    } else {
      this.gaugeHatch.setVisible(false);
      this.gaugeStrip.setVisible(false);
    }
    this.gaugeGhost.setVisible(fr.oakGhost);
    if (fr.oakGhost) this.gaugeGhost.setPosition(xAt(f.fuel), 0).setAlpha(0.65 + 0.35 * Math.sin(timeMs / 260));
    if (this.gaugeBlink > 0) {
      this.gaugeBlink = Math.max(0, this.gaugeBlink - dtMs / 600);
      const on = Math.floor(this.gaugeBlink * 6) % 2 === 0;
      this.gauge.setAlpha(on ? 1 : 0.35);
    } else this.gauge.setAlpha(1);
  }

  private updateRing(fr: FireFrame, timeMs: number): void {
    if (!fr.ring) {
      this.ring.setVisible(false);
      return;
    }
    const key = fr.ring === 'calm' ? K.ringCalm : fr.ring === 'soon' ? K.ringSoon : K.ringLate;
    setArt(this.ring, key);
    this.ring.setVisible(true);
    const pulse = fr.ring === 'embers' && !fr.reducedMotion ? 1 + 0.08 * Math.sin(timeMs / 120) : 1;
    this.ring.setScale(artScale() * pulse);
    this.ring.setAlpha(fr.ring === 'embers' ? 0.75 + 0.25 * Math.sin(timeMs / 120) : 0.95);
  }

  private updateEyes(f: Fire, fr: FireFrame, dtMs: number, timeMs: number): void {
    const embers = f.embers !== null;
    const level = fr.dawnDone ? 0 : f.lowLevel;
    const want = [level >= 1 ? 1 : 0, level >= 2 ? 1 : 0, level >= 2 ? 1 : 0];
    for (let i = 0; i < 3; i++) {
      const e = this.eyes[i];
      const spot = this.eyeSpots[i] ?? this.pit;
      const target = want[i];
      e.alpha += (target - e.alpha) * Math.min(1, dtMs / 350);
      // Дрейф вдоль опушки и моргание.
      const drift = fr.reducedMotion ? 0 : Math.sin(timeMs / 2100 + e.phase) * 0.22 * CELL;
      const o = OUTWARD[this.side];
      const close = level >= 2 && i === 0 ? 0.25 * CELL : 0;
      e.x = spot.x + -o.y * drift - o.x * close;
      e.y = spot.y + o.x * drift - o.y * close;
      if (timeMs > e.blinkAt) {
        e.blinkUntil = timeMs + timing.eyesBlinkMs;
        e.blinkAt = timeMs + timing.eyesBlinkMinMs + Math.random() * (timing.eyesBlinkMaxMs - timing.eyesBlinkMinMs);
      }
      const blink = timeMs < e.blinkUntil ? 0.12 : 1;
      e.img.setPosition(e.x, e.y).setAlpha(e.alpha).setScale(artScale(), artScale() * blink);
      e.glow.setPosition(e.x, e.y).setAlpha(e.alpha * 0.8);
      e.img.setVisible(e.alpha > 0.01);
      e.glow.setVisible(e.alpha > 0.01);
    }
    // Волк у края света, пока костёр на углях.
    const wantWolf = embers && !fr.dawnDone ? 1 : 0;
    this.wolfShown += (wantWolf - this.wolfShown) * Math.min(1, dtMs / 250);
    if (this.wolfJump > 0) this.wolfJump = Math.max(0, this.wolfJump - dtMs / 500);
    this.wolf.setVisible(this.wolfShown > 0.02 || this.wolfJump > 0);
    if (this.wolf.visible) {
      setArt(this.wolf, K.wolfStand, this.boil.variant(this.boilOff));
      const dx = this.wolfSpot.x - this.pit.x;
      const back = this.wolfJump * 0.6 * CELL;
      const l = Math.hypot(dx, this.wolfSpot.y - this.pit.y) || 1;
      this.wolf.setPosition(this.wolfSpot.x + (dx / l) * back, this.wolfSpot.y + ((this.wolfSpot.y - this.pit.y) / l) * back - Math.sin(this.wolfJump * Math.PI) * 0.3 * CELL);
      this.wolf.setFlipX(dx > 0);
      this.wolf.setAlpha(Math.max(this.wolfShown, this.wolfJump) * 0.95);
    }
  }

  /** Источники света для слоя тьмы. */
  lightSource(): { x: number; y: number; r: number; strength: number } {
    const embers = this.emberLight > 0;
    return {
      x: this.pit.x,
      y: this.pit.y - 0.2 * CELL,
      r: embers ? light.emberRadius * this.flicker : (this.lightR + this.flash) * this.flicker,
      strength: embers ? light.emberStrength * this.emberLight : 1,
    };
  }

  /** Позиции глаз (для теста темноты и заставки). */
  eyePositions(): Array<{ x: number; y: number; a: number }> {
    return this.eyes.map((e) => ({ x: e.x, y: e.y, a: e.alpha }));
  }

  get wolfVisible(): boolean {
    return this.wolf.visible;
  }

  /** Цвет углей для подсветки (для теста). */
  static emberColor(): number {
    return hex(palette.ember.hot);
  }

  destroy(): void {
    for (const l of this.logs) l.destroy();
    for (const t of this.tongues) t.img.destroy();
    for (const e of this.eyes) {
      e.img.destroy();
      e.glow.destroy();
    }
    this.embers.destroy();
    this.emberGlow.destroy();
    this.glow.destroy();
    this.bloom.destroy();
    this.sparks.destroy();
    this.smoke.destroy();
    this.leaves.destroy();
    this.gauge.destroy();
    this.ring.destroy();
    this.windIcon.destroy();
    this.wolf.destroy();
  }
}
