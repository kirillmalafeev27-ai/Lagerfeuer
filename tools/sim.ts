// Симуляция ночей ботами на настоящем движке правил, без графики (раздел 14).
// npm run sim -- --level 4 --runs 2000 [--bot mixed|birch|oak|planner|all] [--tmed 5] [--p 0.8]
//   [--mode bank|gen] [--cefr B1] [--history 20] [--sigma 0.65] [--wrong 1.8] [--assist 1] [--vocab]
// Без --mode игра знает темп игрока точно (σ = 0.5) — так проверяются цели раздела 14 (--check).
// Цели ночей с заданиями генератора: --check-gen.
// С --mode игрок отвечает по своей модели (--tmed, --sigma, --p), а темп ночи игра выставляет
// сама, как в игре: учётом темпа вида вопросов по --history его прошлым ответам (0 — первая
// ночь, значения по умолчанию), с поправкой на разброс, запасом и потолком длины ночи.

import { balance } from '../src/config/balance.ts';
import { type LevelId, LEVEL_IDS } from '../src/config/levels.ts';
import { type BotName, makeBot } from '../src/core/bots.ts';
import { type Pace, generateLevel } from '../src/core/levelGen.ts';
import { hashSeed, mulberry32 } from '../src/core/rng.ts';
import { type Player, playNight, sampleAnswerSec } from '../src/core/simulate.ts';
import { type QuestionKind, paceConfigFor } from '../src/game/pacing.ts';
import { PaceTracker } from '../src/shared/pace.ts';
import type { KeyValueStorage } from '../src/shared/storage.ts';

interface Args {
  levels: LevelId[];
  runs: number;
  bots: BotName[];
  tMed: number;
  p: number;
  seed: number;
  plannerRuns: number;
  json: boolean;
  /** Реалистичная симуляция: модель игрока и учёт темпа, как в игре. */
  real: SimOptions | null;
}

export interface SimOptions {
  /** Вид вопросов: учёт темпа и потолок ночи — как в игре. */
  mode: QuestionKind;
  cefr: string;
  /** Сколько прошлых ответов игрока знает учёт темпа: 0 — первая ночь. */
  history: number;
  sigma: number;
  /** Сколько виден верный вариант после ошибки, секунд. */
  wrongSec: number;
  /** Помощь после неудач: 0, 1 или 2 ступени (balance.assist). */
  assist: number;
  /** Выбраны только свои наборы слов: своё значение темпа по умолчанию (game/pacing.ts). */
  vocab?: boolean;
}

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

/** Темп, который игра выставит ночи, зная `history` прошлых ответов игрока. */
export function gamePaceFor(seed: number, player: Player, o: SimOptions): Pace {
  const tracker = new PaceTracker(memoryStorage(), paceConfigFor(o.mode, o.cefr, o.vocab));
  const rng = mulberry32(hashSeed(seed, 0x9ace));
  for (let i = 0; i < o.history; i++) {
    const t = sampleAnswerSec(rng, player.tMed, player.sigma);
    tracker.record(t * 1000, rng() < player.p);
  }
  const snap = tracker.snapshot();
  return { tMed: snap.tMed, p: snap.p };
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const lv = get('level');
  const levels: LevelId[] =
    lv === undefined || lv === 'all'
      ? [...LEVEL_IDS]
      : lv.split(',').map((x) => (x === 'inf' || x === '∞' ? 'inf' : (Number(x) as LevelId)));
  const b = get('bot') ?? 'all';
  const bots: BotName[] =
    b === 'all' ? ['mixed', 'birch', 'oak', 'planner'] : (b.split(',') as BotName[]);
  const runs = Number(get('runs') ?? 1000);
  const mode = get('mode');
  const gen = mode === 'gen';
  return {
    levels,
    runs,
    bots,
    tMed: Number(get('tmed') ?? (gen ? 12 : 5)),
    p: Number(get('p') ?? (gen ? 0.7 : 0.8)),
    seed: Number(get('seed') ?? 1),
    plannerRuns: Number(get('planner-runs') ?? Math.min(runs, 300)),
    json: argv.includes('--json'),
    real:
      mode === undefined
        ? null
        : {
            mode: gen ? 'generated' : 'bank',
            cefr: get('cefr') ?? 'B1',
            history: Number(get('history') ?? 20),
            sigma: Number(get('sigma') ?? (gen ? 0.65 : 0.5)),
            wrongSec: Number(
              get('wrong') ??
                (gen ? balance.wrongFeedbackGeneratedMs : balance.wrongFeedbackMs) / 1000,
            ),
            assist: Number(get('assist') ?? 0),
            vocab: argv.includes('--vocab'),
          },
  };
}

export interface BotReport {
  level: LevelId;
  bot: BotName;
  runs: number;
  win: number;
  stars: [number, number, number, number];
  causeNear: number;
  causeFar: number;
  causeGust: number;
  birch: number;
  oak: number;
  embers: number;
  stretched: number;
  /** Средняя длина ночи: единиц A и секунд. */
  nightA: number;
  nightSec: number;
  /** Ответов за ночь в среднем. */
  answers: number;
}

export function simulate(
  level: LevelId,
  bot: BotName,
  runs: number,
  tMed: number,
  p: number,
  seed: number,
  real: SimOptions | null = null,
): BotReport {
  const rep: BotReport = {
    level,
    bot,
    runs,
    win: 0,
    stars: [0, 0, 0, 0],
    causeNear: 0,
    causeFar: 0,
    causeGust: 0,
    birch: 0,
    oak: 0,
    embers: 0,
    stretched: 0,
    nightA: 0,
    nightSec: 0,
    answers: 0,
  };
  const levelNum = level === 'inf' ? 99 : level;
  const player: Player | undefined = real
    ? { tMed, sigma: real.sigma, p, wrongSec: real.wrongSec }
    : undefined;
  for (let i = 0; i < runs; i++) {
    const s0 = hashSeed(seed, levelNum, i);
    const pace = real && player ? gamePaceFor(s0, player, real) : { tMed, p };
    const gen = generateLevel(level, s0, pace, {
      warn: () => {},
      generated: real?.mode === 'generated',
      assist: real?.assist ?? 0,
    });
    if (gen.stretched) rep.stretched++;
    const s = gen.state;
    const rng = mulberry32(hashSeed(s0, 0xb07));
    const plan = makeBot(bot, mulberry32(hashSeed(s0, 0x91a)));
    playNight(s, plan, rng, { player });
    rep.nightA += s.nightA;
    rep.nightSec += s.nightA * s.A;
    rep.answers += s.stats.correct + s.stats.wrong;
    if (s.status === 'won') rep.win++;
    rep.stars[s.stars]++;
    if (s.stats.cause) {
      if (s.stats.cause.near) rep.causeNear++;
      else rep.causeFar++;
      if (s.stats.cause.gust) rep.causeGust++;
    }
    rep.birch += s.stats.birchFed;
    rep.oak += s.stats.oakFed;
    rep.embers += s.stats.embersCount;
  }
  return rep;
}

const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(0).padStart(3)}%`;

function printReport(r: BotReport): void {
  const n = r.runs;
  const lost = n - r.win;
  console.log(
    [
      `L${String(r.level).padEnd(3)}`,
      r.bot.padEnd(8),
      `win ${pct(r.win, n)}`,
      `★ ${pct(r.stars[1], n)} ★★ ${pct(r.stars[2], n)} ★★★ ${pct(r.stars[3], n)}`,
      lost
        ? `lost: near ${pct(r.causeNear, lost)} far ${pct(r.causeFar, lost)} gust ${pct(r.causeGust, lost)}`
        : 'lost: —',
      `birch ${(r.birch / n).toFixed(1)} oak ${(r.oak / n).toFixed(1)} embers ${(r.embers / n).toFixed(2)}`,
      `night ${(r.nightA / n).toFixed(1)}A ${(r.nightSec / n).toFixed(0)}s, ${(r.answers / n).toFixed(0)} answers`,
      r.stretched ? `stretched ${r.stretched}` : '',
    ].join(' | '),
  );
}

/** Проверка целей раздела 14.5. Возвращает true, если все выполнены. */
export function checkTargets(runs: number, plannerRuns: number, seed: number): boolean {
  const range: Record<string, [number, number]> = {
    '1': [97, 100],
    '2': [97, 100],
    '3': [88, 97],
    '4': [78, 90],
    '5': [72, 85],
    '6': [66, 80],
    inf: [50, 65],
  };
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];
  const add = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });
  const win = (r: BotReport) => (100 * r.win) / r.runs;
  const s2 = (r: BotReport) => (100 * (r.stars[2] + r.stars[3])) / r.runs;
  const s3 = (r: BotReport) => (100 * r.stars[3]) / r.runs;
  const mixed = new Map<LevelId, BotReport>();
  for (const level of LEVEL_IDS) {
    const m = simulate(level, 'mixed', runs, 5, 0.8, seed);
    mixed.set(level, m);
    const [lo, hi] = range[String(level)];
    add(
      `mixed L${String(level)} in ${lo}–${hi}%`,
      win(m) >= lo && win(m) <= hi,
      `${win(m).toFixed(1)}%`,
    );
    if (level !== 1 && level !== 2 && level !== 3) {
      const b = simulate(level, 'birch', runs, 5, 0.8, seed);
      add(
        `birch-only L${String(level)} ≥10 pts below mixed`,
        win(b) <= win(m) - 10,
        `${win(b).toFixed(1)}% vs ${win(m).toFixed(1)}%`,
      );
      const o = simulate(level, 'oak', runs, 5, 0.8, seed);
      add(
        `oak-only ★★ L${String(level)} ≤ half of mixed`,
        s2(o) <= s2(m) / 2,
        `${s2(o).toFixed(1)}% vs ${s2(m).toFixed(1)}%`,
      );
    }
    const pl = simulate(level, 'planner', plannerRuns, 5, 0.8, seed);
    add(
      `planner L${String(level)} ≥ mixed − 3`,
      win(pl) >= win(m) - 3,
      `${win(pl).toFixed(1)}% vs ${win(m).toFixed(1)}%`,
    );
    if (level === 4 || level === 5 || level === 6) {
      add(`planner ★★★ L${String(level)} ≥ 10%`, s3(pl) >= 10, `${s3(pl).toFixed(1)}%`);
    }
  }
  const p9 = simulate(4, 'mixed', runs, 5, 0.9, seed);
  add('L4 mixed p=0.9 ≥ 92%', win(p9) >= 92, `${win(p9).toFixed(1)}%`);
  const p65 = simulate(4, 'mixed', runs, 5, 0.65, seed);
  add('L4 mixed p=0.65 ≤ 55%', win(p65) <= 55, `${win(p65).toFixed(1)}%`);
  const w1 = simulate(1, 'mixed', runs, 5, 0.65, seed);
  add('L1 mixed p=0.65 ≥ 95%', win(w1) >= 95, `${win(w1).toFixed(1)}%`);
  const w2 = simulate(2, 'mixed', runs, 5, 0.65, seed);
  add('L2 mixed p=0.65 ≥ 80%', win(w2) >= 80, `${win(w2).toFixed(1)}%`);
  for (const tMed of [3, 8]) {
    for (const level of LEVEL_IDS) {
      const m = simulate(level, 'mixed', runs, tMed, 0.8, seed);
      const [lo, hi] = range[String(level)];
      add(
        `T_med=${tMed} mixed L${String(level)} in ${lo}–${hi}% ±5`,
        win(m) >= lo - 5 && win(m) <= Math.min(100, hi + 5),
        `${win(m).toFixed(1)}%`,
      );
    }
  }
  let ok = true;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(42)} ${r.detail}`);
    ok &&= r.ok;
  }
  console.log(ok ? 'all section 14 targets met' : 'some section 14 targets FAILED');
  return ok;
}

/** Реалистичная симуляция ночи с заданиями генератора. */
export function genOptions(o: Partial<SimOptions> = {}): SimOptions {
  return {
    mode: 'generated',
    cefr: 'B1',
    history: 20,
    sigma: 0.65,
    wrongSec: balance.wrongFeedbackGeneratedMs / 1000,
    assist: 0,
    ...o,
  };
}

/**
 * Цели для ночей с заданиями генератора (DECISIONS.md, «Сложность с заданиями генератора»).
 * Ночь с заданиями так же трудна, как ночь банка: ученик с 80% верных (10 с на задание, σ 0.6)
 * выполняет те же цели раздела 14, что эталон на банке. Игра знает 20 его прошлых ответов.
 */
export function checkGenerated(runs: number, plannerRuns: number, seed: number): boolean {
  const range: Record<string, [number, number]> = {
    '1': [97, 100],
    '2': [97, 100],
    '3': [88, 97],
    '4': [78, 90],
    '5': [72, 85],
    '6': [66, 80],
    inf: [50, 65],
  };
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];
  const add = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });
  const win = (r: BotReport) => (100 * r.win) / r.runs;
  const s3 = (r: BotReport) => (100 * r.stars[3]) / r.runs;
  const good = genOptions({ sigma: 0.6 });
  const typical = genOptions();
  for (const level of LEVEL_IDS) {
    const m = simulate(level, 'mixed', runs, 10, 0.8, seed, good);
    const [lo, hi] = range[String(level)];
    add(
      `gen mixed (p 0.8) L${String(level)} in ${lo}–${hi}%`,
      win(m) >= lo && win(m) <= hi,
      `${win(m).toFixed(1)}%`,
    );
    if (level !== 1 && level !== 2 && level !== 3) {
      const b = simulate(level, 'birch', runs, 10, 0.8, seed, good);
      add(
        `gen birch-only L${String(level)} ≥10 pts below mixed`,
        win(b) <= win(m) - 10,
        `${win(b).toFixed(1)}% vs ${win(m).toFixed(1)}%`,
      );
      const pl = simulate(level, 'planner', plannerRuns, 10, 0.8, seed, good);
      add(
        `gen planner L${String(level)} ≥ mixed − 3, ★★★ ≥ 10%`,
        win(pl) >= win(m) - 3 && s3(pl) >= 10,
        `${win(pl).toFixed(1)}% vs ${win(m).toFixed(1)}%, ★★★ ${s3(pl).toFixed(1)}%`,
      );
    }
  }
  // Знание окупается: типичный ученик (70% верных) заметно ниже, сильный (90%) — выше.
  const t4 = simulate(4, 'mixed', runs, 12, 0.7, seed, typical);
  const g4 = simulate(4, 'mixed', runs, 10, 0.8, seed, good);
  const s4 = simulate(4, 'mixed', runs, 9, 0.9, seed, good);
  add(
    'gen L4: p 0.7 ≥ 8 pts below p 0.8',
    win(t4) <= win(g4) - 8,
    `${win(t4).toFixed(1)}% vs ${win(g4).toFixed(1)}%`,
  );
  add('gen L4: p 0.9 ≥ 88%', win(s4) >= 88, `${win(s4).toFixed(1)}%`);
  // Начало не непосильно и для типичного ученика — и в первую ночь, по значениям по умолчанию.
  const t1 = simulate(1, 'mixed', runs, 12, 0.7, seed, typical);
  add('gen L1: p 0.7 ≥ 95%', win(t1) >= 95, `${win(t1).toFixed(1)}%`);
  const f1 = simulate(1, 'mixed', runs, 12, 0.7, seed, genOptions({ history: 0 }));
  add('gen first night L1: p 0.7 ≥ 95%', win(f1) >= 95, `${win(f1).toFixed(1)}%`);
  // Помощь после неудач заметна у слабого ученика.
  const weak = genOptions({ sigma: 0.7 });
  const w0 = simulate(6, 'mixed', runs, 15, 0.6, seed, weak);
  const w2 = simulate(6, 'mixed', runs, 15, 0.6, seed, { ...weak, assist: 2 });
  add(
    'gen weak L6: assist 2 ≥ +8 pts',
    win(w2) >= win(w0) + 8,
    `${win(w2).toFixed(1)}% vs ${win(w0).toFixed(1)}%`,
  );
  let ok = true;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(46)} ${r.detail}`);
    ok &&= r.ok;
  }
  console.log(ok ? 'all generated-night targets met' : 'some generated-night targets FAILED');
  return ok;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain && process.argv.includes('--check')) {
  const a = parseArgs(process.argv.slice(2));
  const ok = checkTargets(a.runs, a.plannerRuns, a.seed);
  process.exit(ok ? 0 : 1);
} else if (isMain && process.argv.includes('--check-gen')) {
  const a = parseArgs(process.argv.slice(2));
  const ok = checkGenerated(a.runs, a.plannerRuns, a.seed);
  process.exit(ok ? 0 : 1);
} else if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  const real = a.real;
  console.log(
    real
      ? `sim: player T_med=${a.tMed}s σ=${real.sigma} p=${a.p}; pace: ${real.mode === 'generated' ? `generator ${real.cefr}` : 'bank'}, ${real.history ? `${real.history} past answers` : 'first night'}${real.assist ? `, assist ${real.assist}` : ''}; runs=${a.runs} (planner ${a.plannerRuns})`
      : `sim: T_med=${a.tMed}s p=${a.p} runs=${a.runs} (planner ${a.plannerRuns})`,
  );
  const all: BotReport[] = [];
  for (const level of a.levels) {
    for (const bot of a.bots) {
      if (bot === 'oak' && level === 1) continue;
      const t0 = performance.now();
      const r = simulate(
        level,
        bot,
        bot === 'planner' ? a.plannerRuns : a.runs,
        a.tMed,
        a.p,
        a.seed,
        a.real,
      );
      all.push(r);
      if (!a.json) {
        printReport(r);
        if (bot === 'planner')
          console.log(`        (planner ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
      }
    }
  }
  if (a.json) console.log(JSON.stringify(all));
}
