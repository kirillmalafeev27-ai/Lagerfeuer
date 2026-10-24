// Симуляция ночей ботами на настоящем движке правил, без графики (раздел 14).
// npm run sim -- --level 4 --runs 2000 [--bot mixed|birch|oak|planner|all] [--tmed 5] [--p 0.8]

import { type LevelId, LEVEL_IDS } from '../src/config/levels.ts';
import { type BotName, makeBot } from '../src/core/bots.ts';
import { generateLevel } from '../src/core/levelGen.ts';
import { hashSeed, mulberry32 } from '../src/core/rng.ts';
import { playNight } from '../src/core/simulate.ts';

interface Args {
  levels: LevelId[];
  runs: number;
  bots: BotName[];
  tMed: number;
  p: number;
  seed: number;
  plannerRuns: number;
  json: boolean;
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
  const bots: BotName[] = b === 'all' ? ['mixed', 'birch', 'oak', 'planner'] : (b.split(',') as BotName[]);
  const runs = Number(get('runs') ?? 1000);
  return {
    levels,
    runs,
    bots,
    tMed: Number(get('tmed') ?? 5),
    p: Number(get('p') ?? 0.8),
    seed: Number(get('seed') ?? 1),
    plannerRuns: Number(get('planner-runs') ?? Math.min(runs, 300)),
    json: argv.includes('--json'),
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
}

export function simulate(level: LevelId, bot: BotName, runs: number, tMed: number, p: number, seed: number): BotReport {
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
  };
  const levelNum = level === 'inf' ? 99 : level;
  for (let i = 0; i < runs; i++) {
    const s0 = hashSeed(seed, levelNum, i);
    const gen = generateLevel(level, s0, { tMed, p }, { warn: () => {} });
    if (gen.stretched) rep.stretched++;
    const s = gen.state;
    const rng = mulberry32(hashSeed(s0, 0xb07));
    const plan = makeBot(bot, mulberry32(hashSeed(s0, 0x91a)));
    playNight(s, plan, rng);
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
      lost ? `lost: near ${pct(r.causeNear, lost)} far ${pct(r.causeFar, lost)} gust ${pct(r.causeGust, lost)}` : 'lost: —',
      `birch ${(r.birch / n).toFixed(1)} oak ${(r.oak / n).toFixed(1)} embers ${(r.embers / n).toFixed(2)}`,
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
    add(`mixed L${String(level)} in ${lo}–${hi}%`, win(m) >= lo && win(m) <= hi, `${win(m).toFixed(1)}%`);
    if (level !== 1 && level !== 2 && level !== 3) {
      const b = simulate(level, 'birch', runs, 5, 0.8, seed);
      add(`birch-only L${String(level)} ≥10 pts below mixed`, win(b) <= win(m) - 10, `${win(b).toFixed(1)}% vs ${win(m).toFixed(1)}%`);
      const o = simulate(level, 'oak', runs, 5, 0.8, seed);
      add(`oak-only ★★ L${String(level)} ≤ half of mixed`, s2(o) <= s2(m) / 2, `${s2(o).toFixed(1)}% vs ${s2(m).toFixed(1)}%`);
    }
    const pl = simulate(level, 'planner', plannerRuns, 5, 0.8, seed);
    add(`planner L${String(level)} ≥ mixed − 3`, win(pl) >= win(m) - 3, `${win(pl).toFixed(1)}% vs ${win(m).toFixed(1)}%`);
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

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain && process.argv.includes('--check')) {
  const a = parseArgs(process.argv.slice(2));
  const ok = checkTargets(a.runs, a.plannerRuns, a.seed);
  process.exit(ok ? 0 : 1);
} else if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  console.log(`sim: T_med=${a.tMed}s p=${a.p} runs=${a.runs} (planner ${a.plannerRuns})`);
  const all: BotReport[] = [];
  for (const level of a.levels) {
    for (const bot of a.bots) {
      if (bot === 'oak' && level === 1) continue;
      const t0 = performance.now();
      const r = simulate(level, bot, bot === 'planner' ? a.plannerRuns : a.runs, a.tMed, a.p, a.seed);
      all.push(r);
      if (!a.json) {
        printReport(r);
        if (bot === 'planner') console.log(`        (planner ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
      }
    }
  }
  if (a.json) console.log(JSON.stringify(all));
}
