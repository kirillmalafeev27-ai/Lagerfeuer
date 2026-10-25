import { describe, expect, it } from 'vitest';
import { normalizeText } from '../server/generation/exerciseValidation.ts';
import { SASCHA } from '../server/vocab/sascha.ts';
import {
  VOCAB_INSTRUCTIONS,
  VOCAB_KINDS,
  VOCAB_SETS,
  type VocabItem,
  type VocabTask,
  findVocabSet,
  pickVocabQuestions,
} from '../server/vocab/vocabSets.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { VOCAB_TOPICS } from '../src/shared/questions/topics.ts';

/**
 * Свой набор слов «Wortschatz für Sascha und Präpositionen»: задания написаны вручную, поэтому
 * тесты проверяют сами задания — что в них только слова из списка, что верный ответ — это слово
 * со своим предлогом, а неверные варианты действительно неверны.
 */

/** Предлог и его слияния с артиклем: «vom» — это «von dem». */
const PREP_FORMS: Record<string, readonly string[]> = {
  an: ['an', 'am', 'ans'],
  auf: ['auf', 'aufs'],
  über: ['über', 'übers'],
  mit: ['mit'],
  von: ['von', 'vom'],
  nach: ['nach'],
  zu: ['zu', 'zum', 'zur'],
  vor: ['vor', 'vorm'],
  um: ['um', 'ums'],
};

const words = (s: string) => s.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
/** Есть ли в тексте слово набора (с окончанием: «Erinnerungen»). */
const hasWord = (s: string, item: VocabItem) =>
  words(s).some((w) => w.startsWith(item.word.toLowerCase()));
const hasPrep = (s: string, prep: string) => words(s).some((w) => PREP_FORMS[prep].includes(w));
/** Предлог, с которого начинается вариант («zum Fest» → «zu»). */
const leadingPrep = (s: string) =>
  Object.keys(PREP_FORMS).find((p) => PREP_FORMS[p].includes(words(s)[0] ?? '')) ?? null;
const CYRILLIC = /[а-яё]/i;

/** Предложение с верным ответом: пропуск заполнен, у перевода — сам вариант. */
const solved = (task: VocabTask) =>
  task.kind === 'uebersetzung' ? task.options[0] : task.display.replace('___', task.options[0]);

const each = (fn: (item: VocabItem, task: VocabTask) => void) => {
  for (const item of SASCHA.items) for (const task of item.tasks) fn(item, task);
};

describe('набор «Wortschatz für Sascha und Präpositionen»', () => {
  it('20 слов из списка учителя, на каждое — задание каждого вида', () => {
    expect(SASCHA.items.map((i) => i.word)).toEqual([
      'stolz',
      'neugierig',
      'gespannt',
      'wütend',
      'froh',
      'zufrieden',
      'befreundet',
      'begeistert',
      'verrückt',
      'interessiert',
      'Lust',
      'Interesse',
      'Traum',
      'Einladung',
      'Antwort',
      'Erinnerung',
      'Streit',
      'Suche',
      'Warnung',
      'Wette',
    ]);
    for (const item of SASCHA.items) {
      expect(item.tasks.map((t) => t.kind).sort(), item.word).toEqual([...VOCAB_KINDS].sort());
      expect(hasWord(item.example, item) && hasPrep(item.example, item.prep), item.example).toBe(
        true,
      );
    }
  });

  it('тема набора — та же, что выбирает клиент', () => {
    expect(VOCAB_SETS.map((s) => s.topic)).toEqual(VOCAB_TOPICS);
    for (const topic of VOCAB_TOPICS) expect(findVocabSet(topic)).not.toBeNull();
    expect(findVocabSet('Dativ')).toBeNull();
  });

  it('форма заданий: четыре разных варианта без пропуска; пропуск — в материале, у перевода — русская фраза', () => {
    const displays = new Set<string>();
    each((item, task) => {
      const tag = `${item.word}/${task.kind}`;
      expect(new Set(task.options.map(normalizeText)).size, tag).toBe(4);
      for (const option of task.options) {
        expect(option.trim(), tag).toBe(option);
        expect(option, tag).not.toContain('___');
      }
      if (task.kind === 'uebersetzung') {
        expect(task.display, tag).toMatch(CYRILLIC);
        for (const option of task.options) {
          expect(option, tag).not.toMatch(CYRILLIC);
          expect(option, tag).toMatch(/[.!?]$/);
        }
      } else {
        expect(task.display.split('___').length - 1, tag).toBe(1);
        expect(task.display, tag).not.toMatch(CYRILLIC);
      }
      const key = normalizeText(task.display);
      expect(displays.has(key), `повтор: ${task.display}`).toBe(false);
      displays.add(key);
    });
    expect(displays.size).toBe(80);
  });

  it('верный ответ — это слово со своим предлогом', () => {
    each((item, task) => {
      const sentence = solved(task);
      expect(hasWord(sentence, item) && hasPrep(sentence, item.prep), sentence).toBe(true);
      if (task.kind === 'praeposition') expect(task.options[0]).toBe(item.prep);
      if (task.kind === 'kasus') expect(leadingPrep(task.options[0]), sentence).toBe(item.prep);
      if (task.kind === 'wortwahl') expect(hasWord(task.options[0], item), sentence).toBe(true);
    });
  });

  it('по смыслу: все варианты — слова из списка, и верное слово среди них одно', () => {
    const fromList = (s: string) => SASCHA.items.some((other) => hasWord(s, other));
    each((item, task) => {
      if (task.kind !== 'wortwahl') return;
      for (const option of task.options) expect(fromList(option), option).toBe(true);
      expect(task.options.filter((o) => hasWord(o, item))).toHaveLength(1);
      // «neugierig» и «gespannt» почти синонимы: если одно из них верное, другого в вариантах нет.
      if (item.word === 'neugierig') expect(task.options).not.toContain('gespannt');
      if (item.word === 'gespannt') expect(task.options).not.toContain('neugierig');
    });
  });

  it('перевод: один вариант с неверным предлогом, два — другие слова списка со своими предлогами', () => {
    each((item, task) => {
      if (task.kind !== 'uebersetzung') return;
      const [, ...wrong] = task.options;
      const sameWord = wrong.filter((o) => hasWord(o, item));
      expect(sameWord, task.display).toHaveLength(1);
      expect(hasPrep(sameWord[0], item.prep), sameWord[0]).toBe(false);
      for (const option of wrong.filter((o) => !hasWord(o, item))) {
        const ok = SASCHA.items.some(
          (other) => other !== item && hasWord(option, other) && hasPrep(option, other.prep),
        );
        expect(ok, `не пара из списка: ${option}`).toBe(true);
      }
    });
  });

  it('предлог: неверные варианты — другие предлоги; с падежом — матрица 2 × 2', () => {
    each((item, task) => {
      if (task.kind === 'praeposition') {
        for (const option of task.options) expect(Object.keys(PREP_FORMS)).toContain(option);
      }
      if (task.kind === 'kasus') {
        const preps = task.options.map(leadingPrep);
        expect(
          preps.filter((p) => p === item.prep),
          task.display,
        ).toHaveLength(2);
        const other = preps.filter((p) => p !== item.prep);
        expect(other, task.display).toHaveLength(2);
        expect(other[0], task.display).not.toBeNull();
        expect(other[1], task.display).toBe(other[0]);
      }
    });
  });
});

describe('выдача блоков', () => {
  const byDisplay = new Map<string, { item: VocabItem; task: VocabTask }>();
  each((item, task) => byDisplay.set(task.display, { item, task }));

  it('в блоке десять разных слов, виды заданий поровну, верный вариант на своём месте', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const block = pickVocabQuestions(SASCHA, 10, [], mulberry32(seed));
      expect(block).toHaveLength(10);
      const source = block.map((q) => byDisplay.get(q.display)!);
      expect(new Set(source.map((s) => s.item.word)).size).toBe(10);
      for (const kind of VOCAB_KINDS) {
        const n = block.filter((q) => q.format === kind).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
      }
      block.forEach((q, i) => {
        const { task } = source[i];
        expect(q.text).toBe(VOCAB_INSTRUCTIONS[task.kind]);
        expect(q.options[q.correct]).toBe(task.options[0]);
        expect([...q.options].sort()).toEqual([...task.options].sort());
        expect(q.displayLang).toBe(task.kind === 'uebersetzung' ? 'ru' : undefined);
      });
    }
  });

  it('показанное и ждущее в очереди не повторяется: следующий блок — другие десять слов', () => {
    const rand = mulberry32(5);
    const first = pickVocabQuestions(SASCHA, 10, [], rand);
    const second = pickVocabQuestions(
      SASCHA,
      10,
      first.map((q) => q.display),
      rand,
    );
    const wordsOf = (block: typeof first) =>
      new Set(block.map((q) => byDisplay.get(q.display)!.item.word));
    const a = wordsOf(first);
    const b = wordsOf(second);
    expect(b.size).toBe(10);
    expect([...b].filter((w) => a.has(w))).toEqual([]);
  });

  it('если почти всё уже показано, блок всё равно полный', () => {
    const all = [...byDisplay.keys()];
    const block = pickVocabQuestions(SASCHA, 10, all.slice(0, 75), mulberry32(9));
    expect(block).toHaveLength(10);
    expect(new Set(block.map((q) => q.display)).size).toBe(10);
  });
});
