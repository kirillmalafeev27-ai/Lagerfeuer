// Подбор чисел уровней: перебор slotA / nightA для смешанного бота (вспомогательный скрипт).
// node --experimental-strip-types tools/tune.ts --level 6 --slot 9.5,9.8,10 --night 44 --runs 2000
import { levels, type LevelId } from '../src/config/levels.ts';
import { simulate } from './sim.ts';

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
const cfg = levels.find((l) => l.id === level) as { slotA: number; nightA: number };
const slot0 = cfg.slotA;
const night0 = cfg.nightA;
for (const sl of slots.length ? slots : [slot0]) {
  for (const ni of nights.length ? nights : [night0]) {
    cfg.slotA = sl;
    cfg.nightA = ni;
    const parts: string[] = [];
    for (const b of bots) {
      const r = simulate(level, b, runs, Number(get('tmed') ?? 5), Number(get('p') ?? 0.8), 7);
      parts.push(
        `${b} ${((100 * r.win) / r.runs).toFixed(1)}% ★★+ ${((100 * (r.stars[2] + r.stars[3])) / r.runs).toFixed(0)}% ★★★ ${((100 * r.stars[3]) / r.runs).toFixed(0)}%`,
      );
    }
    console.log(`L${String(level)} slotA=${sl} nightA=${ni}: ${parts.join(' | ')}`);
  }
}
