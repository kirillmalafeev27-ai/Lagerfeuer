// Подбор чисел уровней: перебор slotA / nightA для смешанного бота (вспомогательный скрипт).
// node --experimental-strip-types tools/tune.ts --level 6 --slot 9.5,9.8,10 --night 44 --runs 2000
// Ночи с заданиями генератора (levels.generated): --mode gen, ученик — как в sim.ts
// (--tmed 12 --sigma 0.65 --p 0.7 --history 20); перебирается generated.slotA.
import { balance } from '../src/config/balance.ts';
import { levels, type LevelConfig, type LevelId } from '../src/config/levels.ts';
import { type SimOptions, simulate } from './sim.ts';

const argv = process.argv.slice(2);
const get = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const lv = get('level') ?? '6';
const level: LevelId = lv === 'inf' ? 'inf' : (Number(lv) as LevelId);
const slots = (get('slot') ?? '').split(',').filter(Boolean).map(Number);
const nights = (get('night') ?? '').split(',').filter(Boolean).map(Number);
const runs = Number(get('runs') ?? 2000);
const bots = (get('bot') ?? 'mixed').split(',') as Array<'mixed' | 'birch' | 'oak' | 'planner'>;
const gen = get('mode') === 'gen';
const real: SimOptions | null = gen
  ? {
      mode: 'generated',
      cefr: get('cefr') ?? 'B1',
      history: Number(get('history') ?? 20),
      sigma: Number(get('sigma') ?? 0.65),
      wrongSec: balance.wrongFeedbackGeneratedMs / 1000,
      assist: Number(get('assist') ?? 0),
    }
  : null;
const tMed = Number(get('tmed') ?? (gen ? 12 : 5));
const p = Number(get('p') ?? (gen ? 0.7 : 0.8));
const cfg = levels.find((l) => l.id === level) as {
  -readonly [K in keyof LevelConfig]: LevelConfig[K];
};
const genCfg = cfg.generated as { slotA: number };
const slot0 = gen ? genCfg.slotA : cfg.slotA;
const night0 = cfg.nightA;
for (const sl of slots.length ? slots : [slot0]) {
  for (const ni of nights.length ? nights : [night0]) {
    if (gen) genCfg.slotA = sl;
    else cfg.slotA = sl;
    cfg.nightA = ni;
    const parts: string[] = [];
    for (const b of bots) {
      const r = simulate(level, b, b === 'planner' ? Math.min(runs, 300) : runs, tMed, p, 7, real);
      parts.push(
        `${b} ${((100 * r.win) / r.runs).toFixed(1)}% ★★+ ${((100 * (r.stars[2] + r.stars[3])) / r.runs).toFixed(0)}% ★★★ ${((100 * r.stars[3]) / r.runs).toFixed(0)}%`,
      );
    }
    console.log(`L${String(level)} slotA=${sl} nightA=${ni}: ${parts.join(' | ')}`);
  }
}
