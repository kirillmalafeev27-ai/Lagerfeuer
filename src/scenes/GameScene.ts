// Сцена мира: читает состояние раунда и реагирует на события. Состояние меняет только
// контроллер через редуктор. Умеет режим заставки для меню.

import Phaser from 'phaser';
import { balance, light, timing } from '../config/balance.ts';
import { hintFlags } from '../config/levels.ts';
import { look } from '../config/look.ts';
import { K } from '../art/manifest.ts';
import { makeMixedBot } from '../core/bots.ts';
import { type Cell, type Side, SIDES, cellRow } from '../core/clearing.ts';
import type { GameEvent } from '../core/events.ts';
import { route } from '../core/intent.ts';
import { generateLevel } from '../core/levelGen.ts';
import { hashSeed } from '../core/rng.ts';
import { oakHint, urgency, type RingLevel } from '../core/risk.ts';
import { type GameState, cloneState } from '../core/state.ts';
import { activeGust, warnedGust } from '../core/wind.ts';
import { GameController } from '../game/GameController.ts';
import { sfxDe, type SfxWord } from '../i18n/sfx.de.ts';
import { sfxRu } from '../i18n/sfx.ru.ts';
import { artImage, BoilClock, setArt } from '../render/art.ts';
import { CampView } from '../render/CampView.ts';
import { DarknessLayer, type LightStamp } from '../render/DarknessLayer.ts';
import { DEPTH } from '../render/depth.ts';
import { FireView, type ViewRect } from '../render/FireView.ts';
import { HeroView, cellCenter } from '../render/HeroView.ts';
import { HintsView } from '../render/HintsView.ts';
import { Juice, type WordTone } from '../render/juice.ts';
import { SkyView } from '../render/SkyView.ts';
import { WorldView, pitWorld } from '../render/WorldView.ts';

const CELL = look.cell;

export type WorldTarget =
  | { kind: 'fire'; side: Side }
  | { kind: 'cell'; cell: Cell }
  | { kind: 'pile'; wood: 'birch' | 'oak' }
  | { kind: 'hero' };

export type SceneMode = 'idle' | 'attract' | 'intro' | 'play' | 'over';

/** Связь сцены с приложением (DOM): приложение читает и задаёт эти поля. */
export interface SceneHost {
  dpr: number;
  reducedMotion: boolean;
  quality: 'high' | 'low';
  hintsEnabled: boolean;
  wordsLang: 'de' | 'ru';
  darkFallback: boolean;
  onWorldTap(t: WorldTarget): void;
  onRoundEvents(events: GameEvent[], state: GameState): void;
  onFinaleDone(): void;
  onFps?(fps: number): void;
  onReady?(): void;
}

interface Finale {
  kind: 'won' | 'lost';
  t: number;
  dur: number;
  wolf?: Phaser.GameObjects.Image;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  stage: number;
}

export class GameScene extends Phaser.Scene {
  host!: SceneHost;
  mode: SceneMode = 'idle';
  ctl: GameController | null = null;
  private world!: WorldView;
  private sky!: SkyView;
  private dark!: DarknessLayer;
  private juice!: Juice;
  private hints!: HintsView;
  private readonly boil = new BoilClock(timing.boilFps);
  private fires: FireView[] = [];
  private hero: HeroView | null = null;
  private camp: CampView | null = null;
  private unsub: (() => void) | null = null;
  private view: ViewRect = { x: 0, y: 0, w: 1, h: 1 };
  private skyCells = 0.8;
  private attractPlan: ((s: GameState, ev: GameEvent[]) => void) | null = null;
  private attractNext = 0;
  private sunrise = 0;
  private finale: Finale | null = null;
  private lastHowl = -1e9;
  private yawned = false;
  private fpsAcc = 0;
  private fpsFrames = 0;
  timeMs = 0;

  constructor() {
    super('game');
  }

  init(data: { host: SceneHost }): void {
    this.host = data.host;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x15131c);
    this.world = new WorldView(this);
    this.sky = new SkyView(this);
    this.dark = new DarknessLayer(this, this.host.darkFallback);
    this.juice = new Juice(this);
    this.hints = new HintsView(this);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onTap(p));
    this.host.onReady?.();
  }

  // ── Раскладка камеры ────────────────────────────────────────────

  /** Вписать поляну с кострами, поленницей и палаткой в панель; небо — сверху (11.1.5). */
  layout(): void {
    const cam = this.cameras.main;
    const W = this.scale.width;
    const Hh = this.scale.height;
    cam.setSize(W, Hh);
    const dpr = this.host.dpr;
    const cssW = W / dpr;
    const cssH = Hh / dpr;
    const fit = look.fit;
    const fitW = fit.right - fit.left;
    const fitH = fit.bottom - fit.top;
    const cellCss = Math.min(cssW / fitW, cssH / (fitH + look.sky.min * 0.5));
    const zoom = (cellCss * dpr) / CELL;
    cam.setZoom(zoom);
    const viewWc = cssW / cellCss;
    const viewHc = cssH / cellCss;
    const extra = viewHc - fitH;
    let top: number;
    if (extra >= look.sky.min) {
      this.skyCells = Math.min(look.sky.max, Math.max(look.sky.min, extra * 0.6));
      const forest = extra - this.skyCells;
      top = fit.top - this.skyCells - forest * 0.45;
    } else {
      this.skyCells = look.sky.min;
      top = fit.top - Math.max(0, extra) * 0.8;
    }
    const cx = (fit.left + fit.right) / 2;
    const centerY = top + viewHc / 2;
    cam.centerOn(cx * CELL, centerY * CELL);
    this.view = { x: (cx - viewWc / 2) * CELL, y: top * CELL, w: viewWc * CELL, h: viewHc * CELL };
    this.sky.layout(this.view, this.skyCells);
    this.dark.layout(this.view, W, Hh, this.host.quality === 'low');
    for (const f of this.fires) f.layoutEyes(this.view, this.sky.top, this.skyCells * CELL);
  }

  /** Перевести точку мира в CSS-пиксели канвы (для пузырей обучения). */
  worldToCss(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const dpr = this.host.dpr;
    return { x: ((x - cam.worldView.x) * cam.zoom) / dpr, y: ((y - cam.worldView.y) * cam.zoom) / dpr };
  }

  heroHeadCss(): { x: number; y: number } | null {
    if (!this.hero) return null;
    const p = this.hero.headPosition();
    return this.worldToCss(p.x, p.y);
  }

  fireCss(side: Side): { x: number; y: number } {
    const p = pitWorld(side);
    return this.worldToCss(p.x, p.y - 0.6 * CELL);
  }

  // ── Раунд ───────────────────────────────────────────────────────

  private clearRound(): void {
    this.unsub?.();
    this.unsub = null;
    for (const f of this.fires) f.destroy();
    this.fires = [];
    this.camp?.destroy();
    this.camp = null;
    if (this.hero) {
      this.hero.root.destroy();
      this.hero = null;
    }
    this.finale?.wolf?.destroy();
    this.finale = null;
    this.juice.clear();
    this.sunrise = 0;
    this.yawned = false;
    this.attractPlan = null;
    // Остальные объекты героя (тень, звёздочка, пар) живут в сцене: удалим всё лишнее по тегу.
    for (const o of this.children.list.slice()) if ((o as Phaser.GameObjects.GameObject).getData?.('round')) o.destroy();
  }

  /** Начать раунд: построить виды под раскладку уровня. */
  beginRound(ctl: GameController, mode: 'intro' | 'attract' = 'intro'): void {
    const before = new Set(this.children.list);
    this.clearRound();
    this.ctl = ctl;
    const s = ctl.state;
    this.world.build({ seed: s.seed, shelters: s.fires.map((f) => f.shelter) });
    this.camp = new CampView(this, this.boil, s.pile, s.tent, s.level.oak);
    this.camp.selected = s.selectedWood;
    this.fires = SIDES.map((side) => new FireView(this, side, s.fires[side].shelter, this.boil, s.fires[side].fuel));
    this.hero = new HeroView(this, this.boil, s.hero.cell);
    this.hero.setCarry(s.hero.hands.kind, s.hero.hands.count);
    for (const o of this.children.list) if (!before.has(o)) o.setData('round', true);
    this.layout();
    this.unsub = ctl.on((events, state) => this.onEvents(events, state));
    this.mode = mode;
    if (mode === 'attract') {
      this.attractPlan = makeMixedBot();
      this.attractNext = this.timeMs + 2500;
    }
  }

  /** Заставка меню: ночная поляна, костры горят, в темноте моргают глаза. */
  beginAttract(): void {
    const seed = hashSeed(Date.now() & 0xffff, 7);
    const st = generateLevel(1, seed, { tMed: 5, p: 0.8 }, { skipNominal: true }).state;
    st.fires[0].fuel = 0.75;
    st.fires[0].logs = [{ kind: 'birch', amount: 0.75 }];
    st.fires[0].lowLevel = 1;
    this.beginRound(new GameController(st), 'attract');
  }

  /** Интро: костры вспыхивают, герой хлопает в ладоши. */
  playIntro(): void {
    for (const f of this.fires) f.flare(0.8);
    this.hero?.clap();
  }

  startPlay(): void {
    this.mode = 'play';
    const p = this.hero?.headPosition();
    if (p) this.word('los', p.x, p.y - 0.2 * CELL, 'caption', 1.2);
    for (const f of this.fires) f.burst();
  }

  /** Меловая звёздочка над героем за верный ответ. */
  correctStar(): void {
    this.hero?.correctStar();
  }

  /** Финал (не дольше 2 с) можно пропустить тапом. */
  skipFinale(): void {
    if (!this.finale) return;
    this.finale.t = this.finale.dur;
  }

  // ── Ввод ───────────────────────────────────────────────────────

  private onTap(p: Phaser.Input.Pointer): void {
    if (this.mode !== 'play' && this.mode !== 'intro' && this.mode !== 'over') return;
    if (this.mode === 'over') {
      this.skipFinale();
      return;
    }
    if (p.getDistance() > 24 * this.host.dpr) return;
    const t = this.hitTest(p.worldX, p.worldY);
    if (t) this.host.onWorldTap(t);
  }

  hitTest(wx: number, wy: number): WorldTarget | null {
    if (this.hero?.hitTest(wx, wy)) return { kind: 'hero' };
    const pile = this.camp?.hitPile(wx, wy);
    if (pile) return { kind: 'pile', wood: pile };
    for (const side of SIDES) {
      const pit = pitWorld(side);
      const dx = (wx - pit.x) / (0.62 * CELL);
      const dy = (wy - (pit.y - 0.3 * CELL)) / (0.8 * CELL);
      if (dx * dx + dy * dy <= 1) return { kind: 'fire', side };
    }
    if (wx >= 0 && wx < 2 * CELL && wy >= 0 && wy < 2 * CELL) {
      const col = Math.floor(wx / CELL);
      const row = Math.floor(wy / CELL);
      return { kind: 'cell', cell: (row * 2 + col) as Cell };
    }
    return null;
  }

  // ── События раунда → картинка и слова ─────────────────────────

  private word(w: SfxWord, x: number, y: number, tone: WordTone = 'caption', scale = 1): void {
    const dict = this.host.wordsLang === 'ru' ? sfxRu : sfxDe;
    this.juice.word(dict[w], x, y, tone, scale);
  }

  private onEvents(events: GameEvent[], state: GameState): void {
    const hero = this.hero;
    const camp = this.camp;
    if (!hero || !camp) return;
    for (const e of events) {
      switch (e.type) {
        case 'STEP':
          hero.stepTo(e.to);
          break;
        case 'PICKUP':
        case 'SWAP':
          hero.pickup();
          this.word('klonk', camp.pilePos.x, camp.pilePos.y - 0.9 * CELL, 'caption', 0.85);
          break;
        case 'FED': {
          const fire = this.fires[e.fire];
          const pit = pitWorld(e.fire);
          hero.throwTo({ x: pit.x, y: pit.y - 0.1 * CELL }, e.kind);
          if (e.kind === 'birch') {
            fire.flare(e.relit ? 1.2 : 1);
            this.word('fauch', pit.x, pit.y - 1.0 * CELL, 'caption');
            if (e.relit) {
              fire.wolfJumpBack();
              this.time.delayedCall(260, () => this.word('jaul', pit.x + 0.5 * CELL, pit.y - 1.3 * CELL, 'danger', 0.9));
            }
          } else this.word('plumps', pit.x, pit.y - 0.8 * CELL, 'chalk');
          break;
        }
        case 'OAK_CAUGHT': {
          const pit = pitWorld(e.fire);
          this.fires[e.fire].flare(1);
          this.word('fauch', pit.x, pit.y - 1.0 * CELL, 'caption');
          if (e.relit) this.fires[e.fire].wolfJumpBack();
          break;
        }
        case 'FIRE_LOW': {
          const pit = pitWorld(e.fire);
          const o = OUTWARD_OF(e.fire);
          if (e.level === 1) this.word('knurr', pit.x + o.x * 1.1 * CELL, pit.y + o.y * 0.9 * CELL - 0.3 * CELL, 'danger', 0.85);
          else if (this.timeMs - this.lastHowl > timing.howlCooldownMs) {
            this.lastHowl = this.timeMs;
            this.word('auuuh', pit.x + o.x * 1.1 * CELL, pit.y + o.y * 0.9 * CELL - 0.3 * CELL, 'danger', 0.95);
          }
          break;
        }
        case 'EMBERS': {
          const pit = pitWorld(e.fire);
          this.word('zisch', pit.x, pit.y - 0.7 * CELL, 'chalk');
          this.time.delayedCall(700, () => {
            if (this.ctl?.state.fires[e.fire].embers !== null) this.word('glimm', pit.x, pit.y - 0.6 * CELL, 'danger', 0.85);
          });
          this.juice.shake(this.cameras.main, timing.shakeSmallPx * this.host.dpr);
          break;
        }
        case 'EMBER_COUNTDOWN': {
          const pit = pitWorld(e.fire);
          const w: SfxWord = e.n === 3 ? 'drei' : e.n === 2 ? 'zwei' : 'eins';
          this.word(w, pit.x, pit.y - 0.55 * CELL, 'chalk', 1.1);
          break;
        }
        case 'WIND_WARN': {
          const pit = pitWorld(e.side);
          const o = OUTWARD_OF(e.side);
          this.word('saus', pit.x + o.x * 1.2 * CELL, pit.y + o.y * 1.0 * CELL - 0.4 * CELL, 'wind', 0.9);
          break;
        }
        case 'WIND_START': {
          const pit = pitWorld(e.side);
          this.word('wusch', pit.x, pit.y - 1.2 * CELL, 'wind');
          break;
        }
        case 'DAWN_START': {
          this.word('tschilp', this.view.x + this.view.w * 0.3, this.sky.bottom - 0.1 * CELL, 'caption', 0.9);
          if (!this.yawned) {
            this.yawned = true;
            hero.yawn();
            const hp = hero.headPosition();
            this.time.delayedCall(500, () => this.word('gaehn', hp.x, hp.y - 0.25 * CELL, 'chalk', 0.8));
          }
          break;
        }
        case 'DENIED': {
          if (e.reason === 'noFit' && e.fire !== undefined) {
            this.fires[e.fire].blinkGauge();
            hero.shrug();
            const pit = pitWorld(e.fire);
            this.word('passtNicht', pit.x, pit.y - 0.9 * CELL, 'chalk', 0.85);
          } else if (e.reason === 'oakOnEmbers') {
            camp.winkBirch();
            hero.shrug();
            const pp = camp.pilePos;
            this.word('nurBirke', pp.x, pp.y - 1.05 * CELL, 'chalk', 0.85);
          } else hero.shrug();
          break;
        }
        case 'WOLF_IN':
          this.startLoseFinale(e.fire);
          break;
        case 'DAWN':
          this.startWinFinale(state);
          break;
        default:
          break;
      }
    }
    camp.selected = state.selectedWood;
    hero.setCarry(state.hero.hands.kind, state.hero.hands.count);
    if (this.mode !== 'attract') this.host.onRoundEvents(events, state);
  }

  // ── Финалы ─────────────────────────────────────────────────────

  private startLoseFinale(side: Side): void {
    this.mode = 'over';
    const camp = this.camp;
    const hero = this.hero;
    if (!camp || !hero) return;
    const pit = pitWorld(side);
    const o = OUTWARD_OF(side);
    const from = { x: pit.x + o.x * 1.6 * CELL, y: pit.y + o.y * 1.3 * CELL };
    const to = { x: camp.sausages.x, y: camp.sausages.y };
    const wolf = artImage(this, from.x, from.y, K.wolfRun(0), 0).setDepth(DEPTH.over - 1);
    wolf.setFlipX(to.x < from.x);
    this.finale = { kind: 'lost', t: 0, dur: timing.finaleMaxMs, wolf, from, to, stage: 0 };
    hero.diveInto({ x: camp.tentPos.x, y: camp.tentPos.y - 0.1 * CELL });
    this.juice.shake(this.cameras.main, timing.shakeBigPx * this.host.dpr);
    this.time.delayedCall(250, () => {
      const hp = { x: camp.tentPos.x, y: camp.tentPos.y - 1.3 * CELL };
      this.word('huch', hp.x, hp.y, 'chalk');
    });
  }

  private startWinFinale(state: GameState): void {
    this.mode = 'over';
    this.finale = { kind: 'won', t: 0, dur: timing.finaleMaxMs, stage: 0 };
    this.hero?.setPose('win');
    const anyEmbers = state.fires.some((f) => f.embers !== null);
    this.word('kikeriki', this.view.x + this.view.w * 0.7, this.sky.bottom + 0.1 * CELL, 'caption');
    this.time.delayedCall(900, () => {
      const hp = this.hero?.headPosition();
      if (hp) this.word(anyEmbers ? 'knapp' : 'gutenMorgen', hp.x, hp.y - 0.25 * CELL, 'caption', 1.05);
    });
  }

  private updateFinale(dt: number): void {
    const f = this.finale;
    if (!f) return;
    const before = f.t;
    f.t += dt;
    if (f.kind === 'lost' && f.wolf && f.from && f.to) {
      const p = Math.min(1, f.t / 700);
      const x = f.from.x + (f.to.x - f.from.x) * p;
      const y = f.from.y + (f.to.y - f.from.y) * p;
      setArt(f.wolf, K.wolfRun(Math.floor(f.t / 110) % 2), this.boil.variant());
      f.wolf.setPosition(x, y - (this.host.reducedMotion ? 0 : Math.abs(Math.sin(f.t / 70)) * 0.06 * CELL));
      if (p >= 1 && f.stage === 0) {
        f.stage = 1;
        this.word('haps', x, y - 0.9 * CELL, 'danger', 1.15);
        this.camp?.shakeTent();
      }
      if (f.stage === 1 && this.camp) {
        // Волк утаскивает колбаски в лес.
        const away = Math.min(1, (f.t - 700) / 900);
        const ax = f.to.x + (f.to.x > f.from.x ? 1 : -1) * away * 2.2 * CELL;
        f.wolf.setPosition(ax, f.to.y + away * 0.6 * CELL);
        f.wolf.setFlipX(f.to.x <= f.from.x);
        this.camp.sausages.setPosition(ax + (f.to.x > f.from.x ? 0.25 : -0.25) * CELL, f.to.y - 0.35 * CELL + away * 0.6 * CELL);
        f.wolf.setAlpha(1 - Math.max(0, away - 0.6) / 0.4);
        this.camp.sausages.setAlpha(1 - Math.max(0, away - 0.6) / 0.4);
      }
    }
    if (f.kind === 'won') this.sunrise = Math.min(1, f.t / timing.sunriseMs);
    if (before < f.dur && f.t >= f.dur) this.host.onFinaleDone();
  }

  // ── Кадр ───────────────────────────────────────────────────────

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.timeMs += dt;
    this.boil.enabled = !this.host.reducedMotion && this.host.quality === 'high';
    this.boil.update(dt);
    this.juice.reducedMotion = this.host.reducedMotion;
    const ctl = this.ctl;
    if (ctl) {
      if (this.mode === 'play') ctl.tick(delta);
      if (this.mode === 'attract') this.updateAttract(dt);
    }
    this.updateFinale(dt);
    this.renderWorld(dt);
    this.trackFps(delta);
  }

  private updateAttract(dt: number): void {
    const ctl = this.ctl;
    if (!ctl || !this.attractPlan) return;
    if (ctl.state.status !== 'playing') {
      this.beginAttract();
      return;
    }
    ctl.tick(dt);
    if (this.timeMs >= this.attractNext) {
      const st = ctl.state;
      const ev: GameEvent[] = [];
      // Бот задаёт намерение на копии и мы повторяем его действием через контроллер.
      const copy = cloneState(st);
      this.attractPlan(copy, ev);
      if (copy.selectedWood !== st.selectedWood) ctl.selectWood(copy.selectedWood);
      const it = copy.hero.intent;
      if (it && JSON.stringify(it) !== JSON.stringify(ctl.state.hero.intent)) {
        if (it.kind === 'feed') ctl.feed(it.fire);
        else if (it.kind === 'pile') ctl.pile();
        else ctl.move(it.cell);
      }
      if (!ctl.state.hero.ready) ctl.answer(true, 4000);
      this.attractNext = this.timeMs + st.A * 1000 * 1.25;
    }
  }

  private renderWorld(dt: number): void {
    const ctl = this.ctl;
    const rm = this.host.reducedMotion;
    const t = this.timeMs;
    if (!ctl || !this.hero || !this.camp) {
      this.sky.update(t, 0, 0, 0, rm);
      this.dark.draw(light.nightAlpha, [], { top: this.sky.top, bottom: this.sky.bottom + 0.2 * CELL, strength: 0.5 });
      this.juice.update(dt);
      return;
    }
    const s = ctl.state;
    const share = Math.min(1, s.t / s.nightA);
    const dawnK = share < 1 - balance.dawnShare ? 0 : (share - (1 - balance.dawnShare)) / balance.dawnShare;
    const flags = hintFlags(s.level.hints);
    const hintsOn = this.host.hintsEnabled && this.mode !== 'attract';
    const target = s.hero.intent && s.hero.intent.kind === 'feed' ? s.hero.intent.fire : null;
    const warned = warnedGust(s);
    const dawnDone = this.finale?.kind === 'won';

    // Костры.
    for (const fv of this.fires) {
      const f = s.fires[fv.side];
      let ring: RingLevel | null = null;
      if (hintsOn && (flags.ringsAll || (flags.ringTarget && target === fv.side))) ring = urgency(s, fv.side).level;
      const ghost = hintsOn && flags.oak && oakHint(s, fv.side);
      fv.update(dt, t, {
        fire: f,
        gust: activeGust(s, fv.side) !== null && s.status === 'playing',
        warned: warned !== null && warned.side === fv.side && s.status === 'playing',
        ring: this.mode === 'over' ? null : ring,
        oakGhost: this.mode === 'over' ? false : ghost,
        reducedMotion: rm,
        dawnDone,
      });
    }

    // Герой: смотрит в сторону цели, греет руки у ближайшего костра, тревожится за угли.
    const hero = this.hero;
    hero.reducedMotion = rm;
    const ember = s.fires.find((f) => f.embers !== null);
    if (this.mode !== 'over') {
      if (ember) {
        hero.setPose('alarm');
        hero.face(pitWorld(ember.side).x);
      } else if (s.hero.ready && this.mode === 'play') hero.setPose('ready');
      else if (warned && activeGust(s, warned.side) === null && s.gusts.some((g) => g.phase === 2)) hero.setPose('wind');
      else hero.setPose(s.gusts.some((g) => g.phase === 2) ? 'wind' : 'idle');
      const it = s.hero.intent;
      if (it && !ember) {
        if (it.kind === 'feed') hero.face(pitWorld(it.fire).x);
        else if (it.kind === 'move') hero.face(cellCenter(it.cell).x);
        else hero.face(this.camp.pilePos.x);
      }
      const near = nearestFire(s.hero.cell);
      hero.warmAt(it ? null : pitWorld(near));
    }
    hero.update(dt, t, share);
    this.camp.update(dt, t, rm);

    // Маршрут и «×2».
    if (hintsOn && flags.route && s.hero.intent && this.mode === 'play') {
      const cells = route(s);
      const pts: Array<{ x: number; y: number }> = [{ x: hero.x, y: hero.y - 0.05 * CELL }];
      for (const c of cells) {
        const p = cellCenter(c);
        pts.push({ x: p.x, y: p.y - 0.05 * CELL });
      }
      const it = s.hero.intent;
      if (it.kind === 'feed') {
        const pit = pitWorld(it.fire);
        const last = pts[pts.length - 1];
        const dx = pit.x - last.x;
        const dy = pit.y - last.y;
        const l = Math.hypot(dx, dy) || 1;
        pts.push({ x: pit.x - (dx / l) * 0.5 * CELL, y: pit.y - (dy / l) * 0.42 * CELL });
      } else if (it.kind === 'pile') {
        pts.push({ x: this.camp.pilePos.x, y: this.camp.pilePos.y - 0.1 * CELL });
      }
      this.hints.setRoute(pts);
    } else this.hints.setRoute([]);
    this.hints.setX2(s.hero.x2 && target !== null ? { x: pitWorld(target).x + 0.45 * CELL, y: pitWorld(target).y - 0.95 * CELL } : null);
    this.hints.update(t, rm);

    // Небо и сценарий ночи (8.4).
    this.sky.update(t, share, Math.max(dawnK, this.sunrise), this.sunrise, rm);
    const moon = share < 1 - balance.dawnShare ? light.moonStrength : Math.max(0, light.moonStrength * (1 - (share - 0.8) / 0.05));
    const nightAlpha = light.nightAlpha + (light.dawnEndAlpha - light.nightAlpha) * dawnK;
    const fill = nightAlpha * (1 - moon) * (1 - this.sunrise);
    const stamps: LightStamp[] = [];
    const lp = { x: CELL, y: CELL * 1.02 };
    stamps.push({ x: lp.x, y: lp.y, r: 1.75 + (rm ? 0 : Math.sin(t / 900) * 0.02), strength: light.lanternStrength, brush: K.brushSoft });
    const lantern = this.camp.lanternPos();
    stamps.push({ x: lantern.x, y: lantern.y + 0.4 * CELL, r: 0.75, strength: 0.55, brush: K.brushSoft });
    for (const fv of this.fires) {
      const src = fv.lightSource();
      stamps.push({ x: src.x, y: src.y, r: src.r, strength: src.strength, brush: K.brush((this.boil.variant(fv.side) + fv.side) % 3) });
    }
    this.dark.draw(fill, stamps, { top: this.sky.top, bottom: this.sky.bottom + 0.15 * CELL, strength: 0.5 * (1 - dawnK) });
    this.juice.update(dt);
  }

  private trackFps(delta: number): void {
    this.fpsAcc += delta;
    this.fpsFrames++;
    if (this.fpsAcc >= timing.fpsSampleMs) {
      this.host.onFps?.((this.fpsFrames * 1000) / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  /** Снимок кадра для итогов. */
  snapshot(cb: (img: HTMLImageElement) => void): void {
    this.game.renderer.snapshot((img) => cb(img as HTMLImageElement));
  }
}

function OUTWARD_OF(side: Side): { x: number; y: number } {
  return [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ][side];
}

function nearestFire(cell: Cell): Side {
  // Ближайший — с которым клетка граничит по строке (север/юг).
  return (cellRow(cell) === 0 ? 0 : 2) as Side;
}

