import { shuffle } from '../generation/audioTasks.ts';
import { normalizeText } from '../generation/exerciseValidation.ts';
import { SASCHA } from './sascha.ts';

/**
 * Свои наборы слов: список учителя («слово + предлог + падеж») и задания к нему, написанные
 * вручную. Модель здесь не участвует: так в заданиях гарантированно только слова из списка, нет
 * ошибок в падеже и неоднозначных вариантов, а набор работает и без ключа генерации.
 *
 * На каждое слово четыре задания — по два на каждое умение:
 * - смысл: «wortwahl» — по немецкому контексту выбрать слово (предлог стоит в предложении);
 *   «uebersetzung» — по русской фразе выбрать немецкое предложение: верное, с неверным
 *   предлогом и два с другими словами списка (у них свои, верные предлоги);
 * - предлог: «praeposition» — выбрать один предлог; «kasus» — предлог вместе с формой слова,
 *   матрица 2 × 2: верный и неверный предлог × верный и неверный падеж.
 */

export type VocabKind = 'wortwahl' | 'uebersetzung' | 'praeposition' | 'kasus';

export const VOCAB_KINDS: readonly VocabKind[] = [
  'wortwahl',
  'uebersetzung',
  'praeposition',
  'kasus',
];

/** Инструкции по-русски, как у заданий генератора. */
export const VOCAB_INSTRUCTIONS: Record<VocabKind, string> = {
  wortwahl: 'Выбери слово, которое подходит по смыслу.',
  uebersetzung: 'Как сказать это по-немецки?',
  praeposition: 'Выбери правильный предлог.',
  kasus: 'Выбери предлог и правильную форму.',
};

export interface VocabTask {
  kind: VocabKind;
  /** Материал: немецкое предложение с пропуском «___»; у перевода — русская фраза. */
  display: string;
  /** Первый вариант — верный; при выдаче варианты перемешиваются. */
  options: readonly [string, string, string, string];
}

export interface VocabItem {
  /** Слово, как в списке учителя: «stolz», «Lust». */
  word: string;
  article?: 'der' | 'die' | 'das';
  prep: string;
  kasus: 'Akk' | 'Dat';
  /** Значение из списка учителя. */
  ru: string;
  /** Пример из списка учителя. */
  example: string;
  tasks: readonly VocabTask[];
}

export interface VocabSet {
  /** Название темы — под ним её выбирает клиент (src/shared/questions/topics.ts). */
  topic: string;
  items: readonly VocabItem[];
}

/** Задание набора в ответе API — в том же виде, что задания генератора. */
export interface VocabQuestion {
  format: VocabKind;
  text: string;
  display: string;
  /** Язык материала, если он не немецкий: у перевода — русский. */
  displayLang?: 'ru';
  options: string[];
  correct: number;
}

export const VOCAB_SETS: readonly VocabSet[] = [SASCHA];

export function findVocabSet(topic: unknown): VocabSet | null {
  const key = normalizeText(topic);
  return VOCAB_SETS.find((set) => normalizeText(set.topic) === key) ?? null;
}

/**
 * Блок заданий. В блоке каждое слово — не больше одного раза, виды заданий поровну. Задания
 * из exclude (показанные и ждущие в очереди клиента) не повторяются, а их слова уходят в конец
 * очереди — так блок за блоком проходят все слова, и одно слово не встречается дважды подряд.
 * Если свежих заданий не хватает, блок добирается из остальных.
 */
export function pickVocabQuestions(
  set: VocabSet,
  count: number,
  exclude: readonly string[],
  random: () => number = Math.random,
): VocabQuestion[] {
  const recent = new Set(exclude.map(normalizeText));
  const all = set.items.flatMap((item) => item.tasks.map((task) => ({ item, task })));
  const isRecent = (task: VocabTask) => recent.has(normalizeText(task.display));
  const recentWords = new Set(
    all.filter(({ task }) => isRecent(task)).map(({ item }) => item.word),
  );
  const fresh = shuffle(
    all.filter(({ task }) => !isRecent(task)),
    random,
  ).sort((a, b) => Number(recentWords.has(a.item.word)) - Number(recentWords.has(b.item.word)));

  const perKind = Math.ceil(count / VOCAB_KINDS.length);
  const picked: typeof all = [];
  const words = new Set<string>();
  const kinds = new Map<VocabKind, number>();
  for (const entry of fresh) {
    if (picked.length >= count) break;
    const used = kinds.get(entry.task.kind) ?? 0;
    if (words.has(entry.item.word) || used >= perKind) continue;
    picked.push(entry);
    words.add(entry.item.word);
    kinds.set(entry.task.kind, used + 1);
  }
  for (const entry of [...fresh, ...shuffle(all, random)]) {
    if (picked.length >= count) break;
    if (!picked.includes(entry)) picked.push(entry);
  }
  return picked.map(({ task }) => toQuestion(task, random));
}

function toQuestion(task: VocabTask, random: () => number): VocabQuestion {
  const options = shuffle(task.options, random);
  return {
    format: task.kind,
    text: VOCAB_INSTRUCTIONS[task.kind],
    display: task.display,
    ...(task.kind === 'uebersetzung' ? { displayLang: 'ru' as const } : {}),
    options,
    correct: options.indexOf(task.options[0]),
  };
}
