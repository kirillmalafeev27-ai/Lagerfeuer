// Приложение: раскладка, панель вопроса, плашка снаряжения, экраны, звук и Phaser-сцены.
// Связывает ввод игрока с контроллером раунда; само состояние игры не трогает.

import Phaser from 'phaser';
import { balance, timing } from '../config/balance.ts';
import { type LevelId, LEVEL_IDS, nextLevel } from '../config/levels.ts';
import { palette } from '../config/palette.ts';
import { type Cell, type Side, cellCol, cellInDirection, cellRow } from '../core/clearing.ts';
import type { GameEvent } from '../core/events.ts';
import { plannedAction } from '../core/intent.ts';
import { generateLevel } from '../core/levelGen.ts';
import { hashSeed } from '../core/rng.ts';
import type { GameState } from '../core/state.ts';
import type { WoodKind } from '../core/wood.ts';
import { GameController } from '../game/GameController.ts';
import { GameAudio } from '../audio/GameAudio.ts';
import { ru } from '../i18n/ru.ts';
import { sfxDe } from '../i18n/sfx.de.ts';
import { sfxRu } from '../i18n/sfx.ru.ts';
import { BootScene } from '../scenes/BootScene.ts';
import { GameScene, type SceneHost, type WorldTarget } from '../scenes/GameScene.ts';
import { Mixer } from '../shared/audio/mixer.ts';
import { type Layout, chalkThemeImages, createLayout } from '../shared/layout.ts';
import { PaceTracker, median } from '../shared/pace.ts';
import { QuestionPanel } from '../shared/QuestionPanel.ts';
import type { QuestionProvider } from '../shared/questions/types.ts';
import { type KeyValueStorage, localKeyValue, readJson, writeJson } from '../shared/storage.ts';
import { GearWidget } from './GearWidget.ts';
import { iconHands, iconLog, iconReady, iconStep, wordImage } from './icons.ts';
import {
  bubble,
  introScreen,
  levelsScreen,
  loadingScreen,
  menuScreen,
  pauseScreen,
  resultsScreen,
  settingsScreen,
  type SettingsData,
} from './screens/index.ts';

export interface FinishResult {
  level: number;
  won: boolean;
  stars: 0 | 1 | 2 | 3;
  embers: number;
  birch: number;
  oak: number;
  timeMs: number;
  cause?: 'wolf';
}

export interface MountOptions {
  questions: QuestionProvider;
  storage?: KeyValueStorage;
  level?: number;
  onFinish?: (r: FinishResult) => void;
  /** Режим разработки: отладочная панель (`) и сцена теста темноты. */
  dev?: boolean;
}

interface Settings extends SettingsData {
  reducedMotionSet: boolean;
}

interface Progress {
  unlocked: string[];
  best: Record<string, number>;
}

type Tutorial = 'start' | 'eyes' | 'oak' | 'embers' | 'wind';

type Screen = 'loading' | 'menu' | 'levels' | 'intro' | 'play' | 'paused' | 'over' | 'results';

const levelKey = (id: LevelId) => String(id);
const levelNum = (id: LevelId) => (id === 'inf' ? 7 : id);

export class App {
  private readonly opts: MountOptions;
  private readonly store: KeyValueStorage;
  private readonly paceStore: KeyValueStorage;
  private readonly layout: Layout;
  private readonly pace: PaceTracker;
  private readonly mixer: Mixer;
  private readonly audio: GameAudio;
  private readonly gear: GearWidget;
  private readonly panel: QuestionPanel;
  private settings: Settings;
  private progress: Progress;
  private tutorial: Record<Tutorial, boolean>;
  private game: Phaser.Game | null = null;
  private scene: GameScene | null = null;
  private ctl: GameController | null = null;
  private level: LevelId = 1;
  private screen: Screen = 'loading';
  private overlayEl: HTMLElement | null = null;
  private bubbleEl: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private introTimer = 0;
  private shot: string | null = null;
  private lowFpsSince = 0;
  private autoLowDone = false;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private readonly host: SceneHost;
  private readonly cleanups: Array<() => void> = [];
  private debugEl: HTMLElement | null = null;
  private loading: ReturnType<typeof loadingScreen> | null = null;
  private lastFrame = performance.now();
  private raf = 0;
  private finished = false;

  constructor(container: HTMLElement, opts: MountOptions) {
    this.opts = opts;
    this.store = opts.storage ?? localKeyValue('bonfires:');
    this.paceStore = opts.storage ?? localKeyValue('');
    const reducedPref = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = readJson<Settings>(this.store, 'settings', {
      sfx: 0.8,
      ambient: 0.6,
      muted: false,
      reducedMotion: reducedPref,
      reducedMotionSet: false,
      quality: 'high',
      autoLow: false,
      hints: true,
      words: 'de',
    });
    if (!s.reducedMotionSet) s.reducedMotion = reducedPref;
    this.settings = s;
    this.progress = readJson<Progress>(this.store, 'progress', { unlocked: ['1'], best: {} });
    this.tutorial = readJson<Record<Tutorial, boolean>>(this.store, 'tutorial', { start: false, eyes: false, oak: false, embers: false, wind: false });
    this.pace = new PaceTracker(this.paceStore, balance.pace);
    this.mixer = new Mixer({ sfx: s.sfx, ambient: s.ambient, muted: s.muted });
    this.audio = new GameAudio(this.mixer);

    const colors = {
      paper: palette.paper,
      paperTooth: palette.paperTooth,
      chalk: palette.chalk,
      card: palette.card,
      ink: palette.cardInk,
      caption: palette.caption,
      good: palette.good,
      bad: palette.bad,
    };
    this.layout = createLayout(container, colors, chalkThemeImages(colors));
    this.layout.world.setAttribute('aria-label', ru.a11y.world);
    this.layout.root.classList.toggle('is-reduced', s.reducedMotion);
    this.gear = new GearWidget(this.layout.world, {
      onWood: (k) => this.selectWood(k),
      onStay: () => this.stay(),
      onPause: () => this.pause(),
    });
    this.gear.setVisible(false);
    this.panel = new QuestionPanel({
      host: this.layout.question,
      provider: opts.questions,
      strings: { group: ru.question.group, option: ru.question.option },
      onAnswer: (correct, timeMs) => this.onAnswer(correct, timeMs),
      wrongMs: balance.wrongFeedbackMs,
      correctGlowMs: timing.correctGlowMs,
      drawInMs: timing.questionDrawInMs,
      guardMs: balance.doubleTapGuardMs,
      hoppla: () => wordImage(this.settings.words === 'ru' ? sfxRu.hoppla : sfxDe.hoppla),
    });
    this.panel.setHeader(iconStep(), ru.header.intro);
    this.panel.setMode('intro');

    this.host = {
      dpr: this.dpr,
      reducedMotion: s.reducedMotion,
      quality: s.quality,
      hintsEnabled: s.hints,
      wordsLang: s.words,
      darkFallback: new URLSearchParams(location.search).get('dark') === 'fallback',
      onWorldTap: (t) => this.onWorldTap(t),
      onRoundEvents: (ev, st) => this.onRoundEvents(ev, st),
      onFinaleDone: () => this.showResults(),
      onFps: (fps) => this.onFps(fps),
      onReady: () => this.onSceneReady(),
    };

    this.loading = loadingScreen();
    this.show(this.loading.root);
    this.bindGlobal();
    this.startPhaser();
    if (opts.dev) {
      // Хук для e2e и снимков: состояние, верный ответ, сцена.
      (window as unknown as { __bonfires?: object }).__bonfires = {
        game: () => this.game,
        scene: () => this.scene,
        state: () => this.ctl?.state ?? null,
        screen: () => this.screen,
        correct: () => this.panel.debugCorrectIndex(),
        answer: (i: number) => this.panel.answerKey(i),
      };
    }
    const loop = () => {
      const now = performance.now();
      const dt = now - this.lastFrame;
      this.lastFrame = now;
      this.audio.tick(dt, this.ctl?.state ?? this.scene?.ctl?.state ?? null, this.screen === 'play');
      if (this.screen === 'play') this.syncHud();
      this.updateDebug();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ── Phaser ─────────────────────────────────────────────────────

  private startPhaser(): void {
    const host = this.layout.canvasHost;
    const r = host.getBoundingClientRect();
    const w = Math.max(64, Math.round(r.width * this.dpr));
    const h = Math.max(64, Math.round(r.height * this.dpr));
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: palette.paper,
      banner: false,
      scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / this.dpr },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      input: { keyboard: false, gamepad: false },
      audio: { noAudio: true },
      disableContextMenu: true,
      scene: [],
    });
    const seed = 20261024;
    this.game.scene.add('game', GameScene, false);
    this.game.scene.add('boot', BootScene, true, {
      host: this.host,
      seed,
      onProgress: (p: { done: number; total: number }) => this.loading?.progress(p.done / p.total),
    });
    const off = this.layout.onResize(() => this.resizeCanvas());
    this.cleanups.push(off);
  }

  private resizeCanvas(): void {
    if (!this.game) return;
    const r = this.layout.canvasHost.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.host.dpr = this.dpr;
    const w = Math.max(64, Math.round(r.width * this.dpr));
    const h = Math.max(64, Math.round(r.height * this.dpr));
    this.game.scale.setZoom(1 / this.dpr);
    if (this.game.scale.width !== w || this.game.scale.height !== h) this.game.scale.resize(w, h);
    else this.scene?.layout();
    this.panel.fitPrompt();
    this.placeBubble();
  }

  private onSceneReady(): void {
    this.scene = this.game?.scene.getScene('game') as GameScene;
    this.resizeCanvas();
    const q = new URLSearchParams(location.search);
    if (this.opts.dev && q.get('scene') === 'dark') {
      this.startDarkTest(q.get('fires') ?? 'embers');
      return;
    }
    this.scene.beginAttract();
    const want = this.opts.level;
    if (want !== undefined) {
      const id = (want >= 7 ? 'inf' : want) as LevelId;
      this.startLevel(LEVEL_IDS.includes(id) ? id : 1);
    } else this.showMenu();
  }

  // ── Экраны ─────────────────────────────────────────────────────

  private show(elm: HTMLElement | null, inWorld = false): void {
    this.overlayEl?.remove();
    this.overlayEl = elm;
    if (elm) (inWorld ? this.layout.world : this.layout.overlay).appendChild(elm);
    this.layout.question.classList.toggle('is-idle', this.screen === 'menu' || this.screen === 'levels' || this.screen === 'loading');
  }

  private showMenu(): void {
    this.screen = 'menu';
    this.gear.setVisible(false);
    this.panel.setHeader(iconStep(), ru.header.intro);
    this.panel.setMode('intro');
    this.show(
      menuScreen({
        onPlay: () => {
          this.unlockAudio();
          this.showLevels();
        },
        onSettings: () => this.openSettings(),
      }),
      true,
    );
  }

  private showLevels(): void {
    this.screen = 'levels';
    this.show(
      levelsScreen({
        unlocked: (id) => this.progress.unlocked.includes(levelKey(id)),
        best: (id) => this.progress.best[levelKey(id)] ?? 0,
        onPick: (id) => {
          this.unlockAudio();
          this.startLevel(id);
        },
        onBack: () => this.showMenu(),
      }),
    );
  }

  private unlockAudio(): void {
    this.mixer.unlock();
    this.audio.ambientOn = true;
  }

  private openSettings(): void {
    if (this.settingsEl) return;
    const s = this.settings;
    this.settingsEl = settingsScreen(
      { ...s },
      (d) => this.applySettings(d),
      () => {
        this.settingsEl?.remove();
        this.settingsEl = null;
      },
    );
    this.layout.overlay.appendChild(this.settingsEl);
  }

  private applySettings(d: SettingsData): void {
    const prevQuality = this.settings.quality;
    this.settings = { ...this.settings, ...d, reducedMotionSet: true };
    writeJson(this.store, 'settings', this.settings);
    this.mixer.set({ sfx: d.sfx, ambient: d.ambient, muted: d.muted });
    this.host.reducedMotion = d.reducedMotion;
    this.host.hintsEnabled = d.hints;
    this.host.wordsLang = d.words;
    this.host.quality = d.quality;
    this.layout.root.classList.toggle('is-reduced', d.reducedMotion);
    if (prevQuality !== d.quality) this.scene?.layout();
  }

  // ── Раунд ──────────────────────────────────────────────────────

  private startLevel(id: LevelId): void {
    if (!this.scene) return;
    this.level = id;
    this.finished = false;
    this.shot = null;
    const pace = this.pace.snapshot();
    const forced = this.opts.dev ? Number(new URLSearchParams(location.search).get('seed')) : NaN;
    const seed = forced > 0 ? forced : hashSeed(Date.now() & 0x7fffffff, levelNum(id), Math.floor(Math.random() * 1e6));
    const gen = generateLevel(id, seed, pace);
    this.ctl = new GameController(gen.state);
    this.scene.beginRound(this.ctl, 'intro');
    // Палатка всегда по диагонали от поленницы: один из верхних углов свободен.
    const pileLeft = cellCol(gen.state.pile) === 0;
    this.gear.placeAt(cellRow(gen.state.pile) === 0 ? !pileLeft : pileLeft);
    this.gear.setVisible(true);
    this.panel.setMode('intro');
    this.panel.setHeader(iconStep(), ru.header.intro);
    this.panel.setReadyLock(false);
    void this.panel.start();
    this.screen = 'intro';
    this.scene.playIntro();
    this.audio.play('clap');
    const done = () => {
      if (this.screen !== 'intro') return;
      clearTimeout(this.introTimer);
      this.beginPlay();
    };
    this.show(introScreen(done));
    this.introTimer = window.setTimeout(done, this.settings.reducedMotion ? 900 : timing.introMaxMs);
  }

  private beginPlay(): void {
    if (!this.scene || !this.ctl) return;
    this.show(null);
    this.screen = 'play';
    this.scene.startPlay();
    this.panel.setMode('active');
    this.syncHud();
    if (!this.tutorial.start) this.tutorialBubble('start', ru.tutorial.start);
    else if (this.level === 2 && !this.tutorial.oak) this.tutorialBubble('oak', ru.tutorial.oak);
  }

  private onAnswer(correct: boolean, timeMs: number): void {
    const ctl = this.ctl;
    if (!ctl || this.screen !== 'play') return;
    this.pace.record(timeMs, correct);
    ctl.answer(correct, timeMs);
    if (correct) {
      this.audio.correct();
      this.scene?.correctStar();
    } else this.audio.wrong();
    this.syncHud();
  }

  private onRoundEvents(events: GameEvent[], st: GameState): void {
    this.audio.onEvents(events, st);
    for (const e of events) {
      if (e.type === 'FIRE_LOW' && !this.tutorial.eyes) this.tutorialBubble('eyes', ru.tutorial.eyes);
      if (e.type === 'EMBERS' && !this.tutorial.embers) this.tutorialBubble('embers', ru.tutorial.embers);
      if (e.type === 'WIND_WARN' && this.level === 3 && !this.tutorial.wind) this.tutorialBubble('wind', ru.tutorial.wind);
      if (e.type === 'WOLF_IN' || e.type === 'DAWN') this.onRoundOver(st);
    }
    this.syncHud();
  }

  private onRoundOver(st: GameState): void {
    if (this.finished) return;
    this.finished = true;
    this.screen = 'over';
    this.closeBubble();
    this.panel.setMode('over');
    this.panel.setHeader(iconStep(), ru.header.over);
    this.audio.silenceFires();
    // Снимок кадра — в момент рассвета или поражения (чуть позже, чтобы попала сцена финала).
    setTimeout(() => this.scene?.snapshot((img) => (this.shot = img.src)), st.status === 'won' ? 1300 : 900);
    const won = st.status === 'won';
    const key = levelKey(this.level);
    if (won) {
      const prev = this.progress.best[key] ?? 0;
      this.progress.best[key] = Math.max(prev, st.stars);
      const nx = nextLevel(this.level);
      if (nx !== null && !this.progress.unlocked.includes(levelKey(nx))) this.progress.unlocked.push(levelKey(nx));
      writeJson(this.store, 'progress', this.progress);
    }
    this.opts.onFinish?.({
      level: levelNum(this.level),
      won,
      stars: st.stars,
      embers: st.stats.embersCount,
      birch: st.stats.birchFed,
      oak: st.stats.oakFed,
      timeMs: Math.round(this.ctl?.playMs ?? 0),
      cause: won ? undefined : 'wolf',
    });
  }

  private showResults(): void {
    const st = this.ctl?.state;
    if (!st || this.screen === 'results') return;
    this.screen = 'results';
    const key = levelKey(this.level);
    const best = this.progress.best[key] ?? 0;
    const times = st.stats.times;
    const nx = nextLevel(this.level);
    const show = () =>
      this.show(
        resultsScreen(
          {
            won: st.status === 'won',
            stars: st.stars,
            shot: this.shot,
            birch: st.stats.birchFed,
            oak: st.stats.oakFed,
            embers: st.stats.embersCount,
            correct: st.stats.correct,
            wrong: st.stats.wrong,
            medianSec: times.length ? median(times) / 1000 : 0,
            gusts: st.stats.gusts,
            record: best,
            newRecord: st.status === 'won' && st.stars >= best && st.stars > 0,
            cause: st.stats.cause ? { near: st.stats.cause.near, gust: st.stats.cause.gust } : null,
            hasNext: nx !== null && this.progress.unlocked.includes(levelKey(nx)),
            staggerMs: this.settings.reducedMotion ? 0 : timing.results.cardStaggerMs,
            tallyMs: this.settings.reducedMotion ? 30 : timing.results.tallyStepMs,
            onTally: (i) => this.audio.play('tally', 0, 0.8 + Math.min(0.6, i * 0.03)),
          },
          {
            onAgain: () => this.startLevel(this.level),
            onNext: () => (nx !== null ? this.startLevel(nx) : this.showLevels()),
            onMenu: () => {
              this.scene?.beginAttract();
              this.ctl = null;
              this.showMenu();
            },
          },
        ),
      );
    if (this.shot) show();
    else this.scene?.snapshot((img) => {
      this.shot = img.src;
      show();
    });
  }

  // ── Пауза ──────────────────────────────────────────────────────

  private pause(): void {
    if (this.screen !== 'play' || !this.ctl) return;
    this.ctl.pause();
    this.screen = 'paused';
    this.panel.setMode('paused');
    this.panel.setHeader(iconStep(), ru.header.paused);
    this.mixer.suspend();
    this.show(
      pauseScreen({
        onResume: () => this.resume(),
        onRestart: () => {
          this.mixer.resume();
          this.startLevel(this.level);
        },
        onMenu: () => {
          this.mixer.resume();
          this.scene?.beginAttract();
          this.ctl = null;
          this.showMenu();
        },
        onSettings: () => this.openSettings(),
      }),
    );
  }

  private resume(): void {
    if (this.screen !== 'paused' || !this.ctl) return;
    this.show(null);
    this.mixer.resume();
    this.screen = 'play';
    if (!this.bubbleEl) {
      this.ctl.resume();
      this.panel.setMode('active');
    }
    this.syncHud();
  }

  // ── Обучение ───────────────────────────────────────────────────

  private tutorialBubble(key: Tutorial, text: string): void {
    if (this.tutorial[key] || this.bubbleEl || !this.ctl || this.screen !== 'play') return;
    this.tutorial[key] = true;
    writeJson(this.store, 'tutorial', this.tutorial);
    this.ctl.pause();
    this.panel.setMode('paused');
    const shownAt = performance.now();
    const close = () => {
      if (performance.now() - shownAt < timing.tutorialMinMs) return;
      this.closeBubble();
      if (this.screen === 'play') {
        this.ctl?.resume();
        this.panel.setMode('active');
      }
    };
    this.bubbleEl = bubble(text, this.scene?.heroHeadCss() ?? { x: 40, y: 140 }, close, ru.tutorial.ok);
    this.layout.bubbles.appendChild(this.bubbleEl);
    this.placeBubble();
  }

  private placeBubble(): void {
    const b = this.bubbleEl;
    const p = this.scene?.heroHeadCss();
    if (!b || !p) return;
    const host = this.layout.canvasHost.getBoundingClientRect();
    const bw = b.offsetWidth || 260;
    const bh = b.offsetHeight || 100;
    const x = Math.max(6, Math.min(host.width - bw - 6, p.x - bw / 2));
    const y = Math.max(6, Math.min(host.height - bh - 6, p.y - bh - 18));
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
  }

  private closeBubble(): void {
    this.bubbleEl?.remove();
    this.bubbleEl = null;
  }

  // ── Ввод ───────────────────────────────────────────────────────

  private canAct(): boolean {
    return this.screen === 'play' && !!this.ctl && !this.bubbleEl;
  }

  private onWorldTap(t: WorldTarget): void {
    if (!this.canAct() || !this.ctl) return;
    switch (t.kind) {
      case 'fire':
        this.ctl.feed(t.side);
        break;
      case 'cell':
        this.ctl.move(t.cell);
        break;
      case 'pile':
        this.ctl.pile(t.wood);
        break;
      case 'hero':
        this.ctl.stay();
        break;
    }
    this.syncHud();
  }

  private selectWood(k: WoodKind): void {
    if (!this.canAct() || !this.ctl) return;
    this.ctl.selectWood(k);
    this.syncHud();
  }

  private stay(): void {
    if (!this.canAct() || !this.ctl) return;
    this.ctl.stay();
    this.syncHud();
  }

  private bindGlobal(): void {
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    const onVis = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    const onBlur = () => this.pause();
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const k = e.key;
    if ((k === 'p' || k === 'P' || k === 'Escape') && !e.repeat) {
      if (this.screen === 'play') this.pause();
      else if (this.screen === 'paused' && !this.settingsEl) this.resume();
      else if (this.settingsEl && k === 'Escape') {
        this.settingsEl.remove();
        this.settingsEl = null;
      }
      e.preventDefault();
      return;
    }
    if (k === '`' && this.opts.dev) {
      this.toggleDebug();
      return;
    }
    if (this.screen === 'over') {
      if (k === ' ' || k === 'Enter') this.scene?.skipFinale();
      return;
    }
    if (!this.canAct() || !this.ctl) return;
    if (k >= '1' && k <= '4') {
      this.panel.answerKey(Number(k) - 1);
      e.preventDefault();
      return;
    }
    const dir: Record<string, Side> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
    if (k in dir) {
      const side = dir[k];
      if (e.shiftKey) this.ctl.feed(side);
      else {
        const to = cellInDirection(this.ctl.state.hero.cell, side) as Cell;
        if (to !== this.ctl.state.hero.cell) this.ctl.move(to);
      }
      e.preventDefault();
      this.syncHud();
      return;
    }
    if (k === 'b' || k === 'B' || k === 'и' || k === 'И') this.selectWood('birch');
    else if (k === 'e' || k === 'E' || k === 'у' || k === 'У') this.selectWood('oak');
    else if (k === 'h' || k === 'H' || k === 'р' || k === 'Р') {
      this.ctl.pile();
      this.syncHud();
    } else if (k === ' ') {
      this.stay();
      e.preventDefault();
    }
  }

  // ── Шапка и плашка ─────────────────────────────────────────────

  private syncHud(): void {
    const st = this.ctl?.state;
    if (!st) return;
    const h = st.hero;
    this.gear.update(h.hands.kind, h.hands.count, st.selectedWood, st.level.oak, Math.min(1, st.t / st.nightA));
    if (this.screen !== 'play') return;
    this.panel.setReadyLock(h.ready);
    if (h.ready) {
      this.panel.setHeader(iconReady(), ru.header.ready, true);
      return;
    }
    const plan = plannedAction(st);
    if (plan.type === 'step') this.panel.setHeader(iconStep(), ru.header.step);
    else if (plan.type === 'feed') {
      const kind = h.hands.kind ?? 'birch';
      const text = kind === 'oak' ? ru.header.oak : h.x2 ? ru.header.birch2 : ru.header.birch;
      this.panel.setHeader(iconLog(kind), text);
    } else this.panel.setHeader(iconHands(), ru.header.none);
  }

  // ── Качество ───────────────────────────────────────────────────

  private onFps(fps: number): void {
    if (this.autoLowDone || this.settings.quality === 'low') return;
    if (fps < timing.fpsLowThreshold) {
      this.lowFpsSince += timing.fpsSampleMs;
      if (this.lowFpsSince >= timing.fpsSampleMs) {
        this.autoLowDone = true;
        this.applySettings({ ...this.settings, quality: 'low', autoLow: true });
      }
    } else this.lowFpsSince = 0;
  }

  // ── Тест темноты (dev) ─────────────────────────────────────────

  private startDarkTest(fires: string): void {
    if (!this.scene) return;
    const gen = generateLevel(1, 4242, { tMed: 5, p: 0.8 }, { skipNominal: true });
    const s = gen.state;
    s.pile = 0;
    s.tent = 3;
    s.hero.cell = 0;
    for (const f of s.fires) {
      if (fires === 'embers') {
        f.fuel = 0;
        f.logs = [];
        f.embers = 2.8;
        f.lowLevel = 2;
      } else if (fires === 'low') {
        f.fuel = 0.4;
        f.logs = [{ kind: 'birch', amount: 0.4 }];
        f.lowLevel = 2;
      } else {
        f.fuel = 3;
        f.logs = [
          { kind: 'birch', amount: 1 },
          { kind: 'birch', amount: 1 },
          { kind: 'birch', amount: 1 },
        ];
        f.lowLevel = 0;
      }
    }
    if (fires === 'mixed') {
      s.fires[0].fuel = 3;
      s.fires[0].logs = [{ kind: 'oak', amount: 2 }, { kind: 'birch', amount: 1 }];
      s.fires[0].embers = null;
      s.fires[0].lowLevel = 0;
    }
    this.ctl = new GameController(s);
    this.host.hintsEnabled = false;
    this.scene.beginRound(this.ctl, 'intro');
    this.scene.mode = 'play';
    this.ctl.pause();
    this.gear.setVisible(false);
    this.show(null);
    this.layout.root.dataset.darkReady = '1';
  }

  // ── Отладка (dev) ──────────────────────────────────────────────

  private toggleDebug(): void {
    if (this.debugEl) {
      this.debugEl.remove();
      this.debugEl = null;
      return;
    }
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:50;font:12px monospace;background:rgba(0,0,0,.75);color:#f4eedd;padding:8px;border-radius:8px;max-width:340px;pointer-events:auto';
    d.innerHTML = '<pre style="margin:0;white-space:pre-wrap"></pre><div class="btns"></div>';
    const btns = d.querySelector('.btns')!;
    const add = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'margin:3px;font:11px monospace';
      b.addEventListener('click', fn);
      btns.appendChild(b);
    };
    const st = () => this.ctl?.state;
    add('заморозить костры', () => st()?.fires.forEach((f) => (f.mult = 0.0001)));
    add('все на угли', () =>
      st()?.fires.forEach((f) => {
        f.fuel = 0.0005;
        f.logs = [{ kind: 'birch', amount: 0.0005 }];
      }),
    );
    add('порыв сейчас', () => {
      const s = st();
      if (!s) return;
      const g = s.gusts.find((x) => x.phase === 0);
      if (g) {
        const d0 = g.warn - s.t;
        g.warn -= d0;
        g.start -= d0;
        g.end -= d0;
      }
    });
    add('рассвет через 5 с', () => {
      const s = st();
      if (s) s.t = Math.max(s.t, s.nightA - 5 / s.A);
    });
    add('бесконечные угли', () => st()?.fires.forEach((f) => f.embers !== null && (f.embers = 1e6)));
    add('тест темноты', () => (location.search = '?scene=dark&fires=embers'));
    this.layout.root.appendChild(d);
    this.debugEl = d;
  }

  private updateDebug(): void {
    if (!this.debugEl) return;
    const s = this.ctl?.state;
    const pre = this.debugEl.querySelector('pre')!;
    if (!s) {
      pre.textContent = 'нет раунда';
      return;
    }
    const fps = Math.round(this.game?.loop.actualFps ?? 0);
    const lines = [
      `FPS ${fps}  seed ${s.seed}`,
      `T_med ${s.tMed.toFixed(2)}  p ${s.p.toFixed(2)}  A ${s.A.toFixed(2)}`,
      `ночь ${(s.t / s.nightA).toFixed(3)}  (${s.t.toFixed(1)}/${s.nightA.toFixed(1)} A)`,
      ...s.fires.map((f) => `${['N', 'E', 'S', 'W'][f.side]} fuel ${f.fuel.toFixed(2)} ${f.embers !== null ? `угли ${f.embers.toFixed(2)}` : ''} ${f.catching !== null ? `дуб ${f.catching.toFixed(2)}` : ''} ×${f.mult}`),
      `ветер: ${s.gusts.map((g) => `${['N', 'E', 'S', 'W'][g.side]}@${g.start.toFixed(0)}${g.phase === 2 ? '*' : ''}`).join(' ')}`,
    ];
    pre.textContent = lines.join('\n');
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.introTimer);
    for (const c of this.cleanups) c();
    this.panel.destroy();
    this.game?.destroy(true);
    this.game = null;
    this.mixer.close();
    this.layout.destroy();
  }
}
