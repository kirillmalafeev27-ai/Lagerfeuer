// Приложение: раскладка, панель вопроса, плашка снаряжения, экраны, звук и Phaser-сцены.
// Связывает ввод игрока с контроллером раунда; само состояние игры не трогает.

import Phaser from 'phaser';
import { balance, timing } from '../config/balance.ts';
import { type LevelId, LEVEL_IDS, nextLevel } from '../config/levels.ts';
import { palette } from '../config/palette.ts';
import { type Cell, type Side, cellCol, cellInDirection, cellRow } from '../core/clearing.ts';
import type { GameEvent } from '../core/events.ts';
import { type PlanFn, makeMixedBot } from '../core/bots.ts';
import { plannedAction } from '../core/intent.ts';
import { assistEmberMul, generateLevel } from '../core/levelGen.ts';
import { hashSeed } from '../core/rng.ts';
import { type GameState, cloneState } from '../core/state.ts';
import type { WoodKind } from '../core/wood.ts';
import { GameController } from '../game/GameController.ts';
import { type QuestionKind, paceConfigFor, paceKeyFor } from '../game/pacing.ts';
import { GameAudio } from '../audio/GameAudio.ts';
import { ru } from '../i18n/ru.ts';
import { sfxDe } from '../i18n/sfx.de.ts';
import { sfxRu } from '../i18n/sfx.ru.ts';
import { BootScene } from '../scenes/BootScene.ts';
import { GameScene, type SceneHost, type WorldTarget } from '../scenes/GameScene.ts';
import { Mixer } from '../shared/audio/mixer.ts';
import { type Layout, chalkThemeImages, createLayout } from '../shared/layout.ts';
import { type PaceSnapshot, PaceTracker, median } from '../shared/pace.ts';
import { QuestionPanel } from '../shared/QuestionPanel.ts';
import {
  type ConfigurableQuestionProvider,
  isConfigurable,
} from '../shared/questions/AiQuestionProvider.ts';
import { type Speaker, createSpeaker } from '../shared/questions/speech.ts';
import {
  CEFR_LEVELS,
  type CefrLevel,
  type QuizConfig,
  isVocabTopic,
  sanitizeQuizConfig,
} from '../shared/questions/topics.ts';
import type { Question, QuestionProvider } from '../shared/questions/types.ts';
import { type KeyValueStorage, localKeyValue, readJson, writeJson } from '../shared/storage.ts';
import { GearWidget } from './GearWidget.ts';
import { iconHands, iconLog, iconReady, iconStep, warmIcons, wordImage } from './icons.ts';
import {
  bubble,
  introScreen,
  levelsScreen,
  loadingScreen,
  menuScreen,
  pauseScreen,
  quizScreen,
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
  /**
   * Источник вопросов. Если он умеет выбирать темы (AiQuestionProvider — задания от ИИ), в меню
   * есть «Вопросы»; LocalBankProvider — встроенный банк.
   */
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
  /** Поражений подряд на уровне — для помощи после неудач; победа обнуляет. */
  streak: Record<string, number>;
}

/**
 * Выбор тем вопросов. chosen — игрок уже решал (темы или встроенный набор): тогда «Играть»
 * больше не открывает выбор тем сам.
 */
interface QuizChoice {
  chosen?: unknown;
  config?: unknown;
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
  /** Темп по видам вопросов: банк — общий ключ серии, генератор — свой на каждый уровень A1–C1. */
  private readonly paces = new Map<string, PaceTracker>();
  /** Источник, которому игрок выбирает темы (ИИ-генерация); у встроенного банка — null. */
  private readonly quiz: ConfigurableQuestionProvider | null;
  private quizChosen = false;
  /** Генерация на сервере подключена (ответ /api/quiz/status); null — ответа ещё нет. */
  private generationOn: boolean | null = null;
  private quizEl: HTMLElement | null = null;
  private readonly speaker: Speaker;
  /** Номер ночи: поздний ответ генерации к прошлой ночи не начинает новую. */
  private roundSeq = 0;
  /** Интро кончилось, а первого вопроса ещё нет: ночь ждёт генерацию (12.4). */
  private waitingQuestions = false;
  /** Помощь после неудач, заработанная только что (для итогов), — ступень или 0. */
  private assistNext = 0;
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
  /** Сколько заняла генерация текстур, мс (бюджет 13.6 — до 2 с). */
  private genMs = 0;

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
      assist: true,
    });
    if (!s.reducedMotionSet) s.reducedMotion = reducedPref;
    // dev: ?quality=high|low — фиксированное качество без автопереключения (тесты, снимки).
    const forcedQuality = opts.dev ? new URLSearchParams(location.search).get('quality') : null;
    if (forcedQuality === 'high' || forcedQuality === 'low') {
      s.quality = forcedQuality;
      this.autoLowDone = true;
    }
    this.settings = s;
    this.progress = readJson<Progress>(this.store, 'progress', {
      unlocked: ['1'],
      best: {},
      streak: {},
    });
    this.tutorial = readJson<Record<Tutorial, boolean>>(this.store, 'tutorial', {
      start: false,
      eyes: false,
      oak: false,
      embers: false,
      wind: false,
    });
    // Темы — до первой ночи: панель сразу загружает первый вопрос (12.4). Если источник уже
    // настроил встраивающий его хозяин, его выбор главнее сохранённого.
    this.quiz = isConfigurable(opts.questions) ? opts.questions : null;
    if (this.quiz) {
      const saved = readJson<QuizChoice>(this.store, 'quiz', {});
      this.quizChosen = saved.chosen === true || this.quiz.config() !== null;
      if (saved.chosen === true && this.quiz.config() === null)
        this.quiz.configure(sanitizeQuizConfig(saved.config));
      void this.quiz.status().then((st) => {
        this.generationOn = st.generationConfigured;
        if (this.screen === 'menu' || this.screen === 'levels') this.syncGenLayout();
      });
    }
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
      strings: { group: ru.question.group, option: ru.question.option, listen: ru.question.listen },
      onAnswer: (correct, timeMs, q) => this.onAnswer(correct, timeMs, q),
      wrongMs: balance.wrongFeedbackMs,
      wrongGeneratedMs: balance.wrongFeedbackGeneratedMs,
      correctGlowMs: timing.correctGlowMs,
      drawInMs: timing.questionDrawInMs,
      guardMs: balance.doubleTapGuardMs,
      hoppla: () => wordImage(this.settings.words === 'ru' ? sfxRu.hoppla : sfxDe.hoppla),
    });
    this.panel.setHeader(iconStep(), ru.header.intro);
    this.panel.setMode('intro');
    // Аудирование: фраза звучит сама, если звук не выключен; кнопка «Слушать» — всегда.
    this.speaker = createSpeaker({ volume: () => this.settings.sfx });
    this.panel.setSpeaker(this.speaker, () => !this.settings.muted);
    this.syncGenLayout();

    this.host = {
      dpr: this.dpr,
      reducedMotion: s.reducedMotion,
      quality: s.quality,
      hintsEnabled: s.hints,
      wordsLang: s.words,
      darkFallback: new URLSearchParams(location.search).get('dark') === 'fallback',
      speed: opts.dev
        ? Math.max(
            1,
            Math.min(
              16,
              Math.round(Number(new URLSearchParams(location.search).get('speed')) || 1),
            ),
          )
        : 1,
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
    // Значки DOM — пока крутится загрузка (между рецептами арта есть паузы).
    setTimeout(() => warmIcons([sfxDe.hoppla, sfxRu.hoppla]), 30);
    if (opts.dev) {
      // Хук для e2e и снимков: состояние, верный ответ, сцена.
      (window as unknown as { __bonfires?: object }).__bonfires = {
        game: () => this.game,
        scene: () => this.scene,
        state: () => this.ctl?.state ?? null,
        screen: () => this.screen,
        genMs: () => this.genMs,
        correct: () => this.panel.debugCorrectIndex(),
        answer: (i: number) => this.panel.answerKey(i),
        options: () => this.layout.question.querySelectorAll('.bf-option').length,
        tap: (t: WorldTarget) => this.onWorldTap(t),
        wood: (k: WoodKind) => this.selectWood(k),
        /** Ход «игрока-бота»: смешанный бот выбирает цель, App получает это как тапы. */
        botStep: () => this.debugBotStep(),
        panelReady: () => this.panel.isReady(),
        showQuestion: (q: Question) => this.panel.debugShow(q),
        quiz: () => this.quiz?.config() ?? null,
        openQuiz: () => this.openQuiz(),
      };
    }
    const loop = () => {
      const now = performance.now();
      const dt = now - this.lastFrame;
      this.lastFrame = now;
      this.audio.tick(
        dt,
        this.ctl?.state ?? this.scene?.ctl?.state ?? null,
        this.screen === 'play',
      );
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
      // Шейдеры собираются параллельно, не подвешивая кадр (их варианты ещё и прогреваются при загрузке).
      render: {
        antialias: true,
        roundPixels: false,
        powerPreference: 'high-performance',
        skipUnreadyShaders: true,
      },
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
      onGenerated: (ms: number) => (this.genMs = ms),
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
    this.host.insetTop = this.gearInset();
    if (this.game.scale.width !== w || this.game.scale.height !== h) this.game.scale.resize(w, h);
    else this.scene?.layout();
    this.panel.fitPrompt();
    this.placeBubble();
  }

  /** В узкой панели мира плашка — строкой сверху: сцена вписывается ниже неё. */
  private gearInset(): number {
    if (!this.layout.root.classList.contains('is-narrow') || this.gear.el.style.display === 'none')
      return 0;
    return this.gear.el.offsetHeight + 8;
  }

  /** Плашку показали или спрятали — пересчитать отступ сцены. */
  private setGearVisible(on: boolean): void {
    this.gear.setVisible(on);
    const inset = this.gearInset();
    if (inset !== (this.host.insetTop ?? 0)) {
      this.host.insetTop = inset;
      this.scene?.layout();
    }
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

  /**
   * Показать экран: 'overlay' — поверх всего, 'world' — в панели мира, 'panel' — на месте
   * панели вопроса (меню и выбор уровня: сцена-заставка остаётся видна целиком).
   */
  private show(elm: HTMLElement | null, where: 'overlay' | 'world' | 'panel' = 'overlay'): void {
    this.overlayEl?.remove();
    this.overlayEl = elm;
    const host =
      where === 'world'
        ? this.layout.world
        : where === 'panel'
          ? this.layout.question
          : this.layout.overlay;
    if (elm) host.appendChild(elm);
    this.layout.question.classList.toggle(
      'is-idle',
      this.screen === 'menu' || this.screen === 'levels' || this.screen === 'loading',
    );
  }

  private showMenu(): void {
    this.screen = 'menu';
    this.setGearVisible(false);
    this.panel.setHeader(iconStep(), ru.header.intro);
    this.panel.setMode('intro');
    this.show(
      menuScreen({
        onPlay: () => void this.play(),
        onSettings: () => this.openSettings(),
        quiz: this.quiz
          ? { summary: this.quizSummary(), onOpen: () => this.openQuiz() }
          : undefined,
      }),
      'panel',
    );
  }

  /** «Играть»: в первый раз, если генерация на сервере есть, — сначала выбор тем. */
  private async play(): Promise<void> {
    this.unlockAudio();
    if (this.quiz && !this.quizChosen) {
      const st = await this.quiz.status();
      if (this.screen !== 'menu' || this.quizEl) return;
      if (st.generationConfigured) {
        this.openQuiz(() => this.showLevels());
        return;
      }
    }
    this.showLevels();
  }

  private quizSummary(): string {
    const cfg = this.quiz?.config();
    if (!cfg) return ru.quiz.summaryBank;
    const topics = [...cfg.grammarTopics];
    if (cfg.wortstellung) topics.push('Wortstellung');
    if (cfg.listening) topics.push(ru.quiz.listeningOnly);
    return ru.quiz.summary(cfg.level, topics);
  }

  /** Выбор тем (шаги меню Morskoy). then — что открыть после «Готово». */
  private openQuiz(then?: () => void): void {
    const quiz = this.quiz;
    if (!quiz || this.quizEl) return;
    const apply = (cfg: QuizConfig | null) => {
      writeJson(this.store, 'quiz', { chosen: true, config: cfg });
      this.quizChosen = true;
      // Те же темы — очереди не сбрасываем: уже готовые задания пригодятся.
      if (JSON.stringify(cfg) !== JSON.stringify(quiz.config())) {
        quiz.configure(cfg);
        this.panel.reload();
      }
      this.closeQuiz();
      this.syncGenLayout();
      if (then) then();
      else if (this.screen === 'menu') this.showMenu();
    };
    this.quizEl = quizScreen(quiz.config(), quiz.status(), {
      onDone: (cfg) => apply(cfg),
      onBank: () => apply(null),
      onCancel: () => this.closeQuiz(),
    });
    this.layout.overlay.appendChild(this.quizEl);
  }

  private closeQuiz(): void {
    this.quizEl?.remove();
    this.quizEl = null;
  }

  /**
   * Вопросы ночи: при выбранных темах — задания генератора, если сервер не ответил, что её нет
   * (свои наборы слов отдаются и без ключа); иначе — те, что на очереди. Сомнение — в пользу
   * генератора: его ночь щадящая, а ночь банка с заданиями-предложениями была бы непосильной.
   */
  private roundKind(): QuestionKind {
    const cfg = this.quiz?.config();
    if (cfg && (this.generationOn !== false || cfg.grammarTopics.some(isVocabTopic)))
      return 'generated';
    return this.panel.peekKind() ?? 'bank';
  }

  /** С заданиями генератора панель вопроса больше: им нужнее место, чем поляне. */
  private syncGenLayout(kind: QuestionKind = this.roundKind()): void {
    this.layout.root.classList.toggle('is-gen', kind === 'generated');
  }

  /** Выбраны только свои наборы слов (без аудирования): у их заданий свой темп. */
  private vocabOnly(): boolean {
    const cfg = this.quiz?.config();
    return !!cfg && !cfg.listening && cfg.grammarTopics.every(isVocabTopic);
  }

  /**
   * Учёт темпа для вида вопросов: банк, свои наборы слов или задания генератора уровня A1–C1
   * (выбранного).
   */
  private paceFor(kind: QuestionKind, cefr = this.quiz?.config()?.level ?? 'B1'): PaceTracker {
    const vocab = kind === 'generated' && this.vocabOnly();
    const key = paceKeyFor(kind, cefr, vocab);
    let t = this.paces.get(key);
    if (!t) {
      t = new PaceTracker(this.paceStore, paceConfigFor(kind, cefr, vocab), key);
      this.paces.set(key, t);
    }
    return t;
  }

  /**
   * Темп ночи. Первая ночь с заданиями генератора на новом уровне A1–C1 берёт темп с ближайшего
   * уровня, где ученик уже отвечал: это тот же ученик и те же форматы, а значение по умолчанию —
   * только догадка.
   */
  private roundPace(kind: QuestionKind): PaceSnapshot {
    const own = this.paceFor(kind);
    if (kind === 'generated' && !own.known() && !this.vocabOnly()) {
      const cefr = this.quiz?.config()?.level ?? 'B1';
      const i = CEFR_LEVELS.indexOf(cefr as CefrLevel);
      const near = CEFR_LEVELS.filter((l) => l !== cefr).sort(
        (a, b) => Math.abs(CEFR_LEVELS.indexOf(a) - i) - Math.abs(CEFR_LEVELS.indexOf(b) - i),
      );
      for (const l of near) {
        const t = this.paceFor(kind, l);
        if (t.known()) return t.snapshot();
      }
    }
    return own.snapshot();
  }

  /** Помощь после неудач подряд на уровне: 0, 1 или 2 ступени (balance.assist). */
  private assistFor(id: LevelId): number {
    if (!this.settings.assist) return 0;
    const n = this.progress.streak[levelKey(id)] ?? 0;
    const a = balance.assist;
    return n >= a.secondAfterLosses ? 2 : n >= a.afterLosses ? 1 : 0;
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
      // В альбомной раскладке сетка уровней помещается на место панели вопроса.
      this.layout.isLandscape() ? 'panel' : 'overlay',
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
    this.assistNext = 0;
    // Темп — по виду вопросов этой ночи (3, game/pacing.ts); у ночи с заданиями генератора —
    // свои параметры уровня и потолок длины, а после неудач подряд угли тлеют дольше.
    const kind = this.roundKind();
    const pace = this.roundPace(kind);
    const assist = this.assistFor(id);
    const forced = this.opts.dev ? Number(new URLSearchParams(location.search).get('seed')) : NaN;
    const seed =
      forced > 0
        ? forced
        : hashSeed(Date.now() & 0x7fffffff, levelNum(id), Math.floor(Math.random() * 1e6));
    this.syncGenLayout(kind);
    const gen = generateLevel(id, seed, pace, { generated: kind === 'generated', assist });
    this.ctl = new GameController(gen.state);
    this.scene.beginRound(this.ctl, 'intro');
    // Палатка всегда по диагонали от поленницы: один из верхних углов свободен.
    const pileLeft = cellCol(gen.state.pile) === 0;
    this.gear.placeAt(cellRow(gen.state.pile) === 0 ? !pileLeft : pileLeft);
    this.setGearVisible(true);
    // Плашка — сразу с дровами и луной: интро может ждать первое задание.
    this.syncHud();
    this.panel.setMode('intro');
    this.panel.setHeader(iconStep(), ru.header.intro);
    this.panel.setReadyLock(false);
    const seq = ++this.roundSeq;
    this.waitingQuestions = false;
    const first = this.panel.start(ru.header.preparing);
    this.screen = 'intro';
    this.scene.playIntro();
    this.audio.play('clap');
    const done = () => {
      if (this.screen !== 'intro' || seq !== this.roundSeq) return;
      clearTimeout(this.introTimer);
      if (this.panel.isReady()) {
        this.beginPlay();
        return;
      }
      // Ночь не начинается без вопроса: пока генерация готовит первый, всё стоит (12.4), а на
      // табличке задания — «Готовлю вопросы…».
      if (this.waitingQuestions) return;
      this.waitingQuestions = true;
      void first.then(() => {
        if (seq === this.roundSeq && this.screen === 'intro' && this.panel.isReady())
          this.beginPlay();
      });
    };
    // Подпись интро — над поляной: с большой панелью заданий генератора середина экрана
    // приходится на границу панелей.
    this.show(
      introScreen(done, assist ? ru.assist.on(assistEmberMul(assist)) : undefined),
      'world',
    );
    this.introTimer = window.setTimeout(
      done,
      this.settings.reducedMotion ? 900 : timing.introMaxMs,
    );
  }

  private beginPlay(): void {
    if (!this.scene || !this.ctl) return;
    this.waitingQuestions = false;
    this.show(null);
    this.screen = 'play';
    this.scene.startPlay();
    this.panel.setMode('active');
    this.syncHud();
    if (!this.tutorial.start) this.tutorialBubble('start', ru.tutorial.start);
    else if (this.level === 2 && !this.tutorial.oak) this.tutorialBubble('oak', ru.tutorial.oak);
  }

  private onAnswer(correct: boolean, timeMs: number, q: Question): void {
    const ctl = this.ctl;
    if (!ctl || this.screen !== 'play') return;
    this.paceFor(q.instruction ? 'generated' : 'bank').record(timeMs, correct);
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
      if (e.type === 'FIRE_LOW' && !this.tutorial.eyes)
        this.tutorialBubble('eyes', ru.tutorial.eyes);
      if (e.type === 'EMBERS' && !this.tutorial.embers)
        this.tutorialBubble('embers', ru.tutorial.embers);
      if (e.type === 'WIND_WARN' && this.level === 3 && !this.tutorial.wind)
        this.tutorialBubble('wind', ru.tutorial.wind);
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
    setTimeout(
      () => this.scene?.snapshot((img) => (this.shot = img.src)),
      st.status === 'won' ? 1300 : 900,
    );
    const won = st.status === 'won';
    const key = levelKey(this.level);
    const assistBefore = this.assistFor(this.level);
    this.progress.streak[key] = won ? 0 : (this.progress.streak[key] ?? 0) + 1;
    const assistAfter = this.assistFor(this.level);
    this.assistNext = !won && assistAfter > assistBefore ? assistAfter : 0;
    if (won) {
      const prev = this.progress.best[key] ?? 0;
      this.progress.best[key] = Math.max(prev, st.stars);
      const nx = nextLevel(this.level);
      if (nx !== null && !this.progress.unlocked.includes(levelKey(nx)))
        this.progress.unlocked.push(levelKey(nx));
    }
    writeJson(this.store, 'progress', this.progress);
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
            assistNext: this.assistNext ? assistEmberMul(this.assistNext) : 0,
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
    else
      this.scene?.snapshot((img) => {
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

  private debugBot: PlanFn | null = null;

  private debugBotStep(): void {
    if (!this.ctl || !this.canAct()) return;
    this.debugBot ??= makeMixedBot();
    const st = this.ctl.state;
    const copy = cloneState(st);
    // На копии готовое действие не исполняется, иначе оно сразу «съест» намерение бота.
    copy.hero.ready = false;
    this.debugBot(copy, []);
    if (copy.selectedWood !== st.selectedWood) this.selectWood(copy.selectedWood);
    const it = copy.hero.intent;
    if (!it || JSON.stringify(it) === JSON.stringify(this.ctl.state.hero.intent)) return;
    if (it.kind === 'feed') this.onWorldTap({ kind: 'fire', side: it.fire });
    else if (it.kind === 'pile') this.onWorldTap({ kind: 'pile', wood: copy.selectedWood });
    else if (it.kind === 'move') this.onWorldTap({ kind: 'cell', cell: it.cell });
    else this.stay();
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
    this.bubbleEl = bubble(
      text,
      this.scene?.heroHeadCss() ?? { x: 40, y: 140 },
      close,
      ru.tutorial.ok,
    );
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
    // Выбор тем — модальный: Esc закрывает его, остальные клавиши его кнопкам.
    if (this.quizEl) {
      if (k === 'Escape') this.closeQuiz();
      return;
    }
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
    this.gear.update(
      h.hands.kind,
      h.hands.count,
      st.selectedWood,
      st.level.oak,
      Math.min(1, st.t / st.nightA),
    );
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
      // mixed: северный костёр полный, остальные — на углях.
      if (fires === 'embers' || (fires === 'mixed' && f.side !== 0)) {
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
      s.fires[0].logs = [
        { kind: 'oak', amount: 2 },
        { kind: 'birch', amount: 1 },
      ];
      s.fires[0].embers = null;
      s.fires[0].lowLevel = 0;
    }
    this.ctl = new GameController(s);
    this.host.hintsEnabled = false;
    this.scene.beginRound(this.ctl, 'intro');
    this.scene.mode = 'play';
    this.ctl.pause();
    this.setGearVisible(false);
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
    d.style.cssText =
      'position:absolute;left:8px;bottom:8px;z-index:50;font:12px monospace;background:rgba(0,0,0,.75);color:#f4eedd;padding:8px;border-radius:8px;max-width:340px;pointer-events:auto';
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
    add('бесконечные угли', () =>
      st()?.fires.forEach((f) => f.embers !== null && (f.embers = 1e6)),
    );
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
      `FPS ${fps}  seed ${s.seed}  арт ${Math.round(this.genMs)} мс`,
      `T_med ${s.tMed.toFixed(2)}  p ${s.p.toFixed(2)}  A ${s.A.toFixed(2)}  ${s.generated ? 'генератор' : 'банк'}  угли ${s.emberA.toFixed(1)} A`,
      `ночь ${(s.t / s.nightA).toFixed(3)}  (${s.t.toFixed(1)}/${s.nightA.toFixed(1)} A)`,
      ...s.fires.map(
        (f) =>
          `${['N', 'E', 'S', 'W'][f.side]} fuel ${f.fuel.toFixed(2)} ${f.embers !== null ? `угли ${f.embers.toFixed(2)}` : ''} ${f.catching !== null ? `дуб ${f.catching.toFixed(2)}` : ''} ×${f.mult}`,
      ),
      `ветер: ${s.gusts.map((g) => `${['N', 'E', 'S', 'W'][g.side]}@${g.start.toFixed(0)}${g.phase === 2 ? '*' : ''}`).join(' ')}`,
    ];
    pre.textContent = lines.join('\n');
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.introTimer);
    for (const c of this.cleanups) c();
    this.panel.destroy();
    this.speaker.destroy();
    this.closeQuiz();
    this.game?.destroy(true);
    this.game = null;
    this.mixer.close();
    this.layout.destroy();
  }
}
