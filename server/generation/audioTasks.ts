import { answerLetterToIndex, normalizeText } from './exerciseValidation.ts';

/**
 * Задания на аудирование (перенесено из Morskoy, quiz-generation.js): немецкая фраза звучит вслух,
 * ученик выбирает точный русский перевод из четырёх. Модель пишет JSON; если он не разобрался,
 * берутся пары «фраза — перевод» и дистракторы строятся заменами частых слов.
 */

export interface AudioQuestion {
  mode: 'audio';
  level: string;
  topic: string;
  /** Инструкция по-русски. */
  text: string;
  /** Что видно на экране вместо фразы. */
  display: string;
  /** Немецкая фраза для озвучки. */
  audioText: string;
  options: string[];
  correct: number;
}

const AUDIO_TEXT = 'Прослушай немецкое предложение и выбери точный русский перевод.';
// В Morskoy здесь было «…Выбери перевод на грибе.» — из другой игры серии; в «Кострах» нейтрально.
const AUDIO_DISPLAY = 'Немецкая фраза звучит вслух. Выбери точный перевод.';

const CYRILLIC = /[А-Яа-яЁё]/;

export function stripOuterQuotes(value: unknown): string {
  return String(value || '')
    .replace(/^[\s"'`«»„“”]+|[\s"'`«»„“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isValidAudioQuestion(q: AudioQuestion | null): q is AudioQuestion {
  const optionCount = Array.isArray(q?.options) ? q.options.length : 0;
  return Boolean(
    q &&
    typeof q.text === 'string' &&
    typeof q.display === 'string' &&
    optionCount === 4 &&
    typeof q.correct === 'number' &&
    q.correct >= 0 &&
    q.correct < optionCount,
  );
}

export interface AudioPair {
  de: string;
  ru: string;
}

/** Запасной разбор: строки вида «немецкая фраза — русский перевод». */
export function parseAudioPairs(rawText: unknown, expectedCount: number): AudioPair[] {
  const text = String(rawText || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
    .trim();
  const chunks = text
    .split(/\n+|(?=\s*\d{1,2}[).]\s+)/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: AudioPair[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const line = chunk.replace(/^\s*(?:[-*•]\s*)?(?:\d{1,2}[).:-]\s*)?/, '').trim();
    if (!line || /^(paare|pairs|sätze|saetze|sentences|antworten|translations)/i.test(line))
      continue;

    let match = line.match(
      /^(?:DE|Deutsch|Original)\s*:\s*(.+?)\s*(?:RU|Russisch|Russian|Русский|Перевод)\s*:\s*(.+)$/i,
    );
    if (!match) match = line.match(/^(.+?)\s*(?:—|–|->|=>|\|)\s*(.+)$/);
    if (!match) match = line.match(/^(.+?)\s+-\s+(.+)$/);
    if (!match) match = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (!match) continue;

    const de = stripOuterQuotes(match[1]);
    const ru = stripOuterQuotes(match[2]);
    if (!de || !ru) continue;
    if (CYRILLIC.test(de)) continue;
    if (!CYRILLIC.test(ru)) continue;
    if (de.length < 8 || ru.length < 8 || de.length > 220 || ru.length > 220) continue;

    const key = normalizeText(de);
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ de, ru });
    if (parsed.length >= expectedCount) break;
  }
  return parsed;
}

/** Дистракторы для запасного разбора: замены частых слов и соседние переводы. */
export function buildRussianDistractors(correct: string, allPairs: readonly AudioPair[]): string[] {
  const base = stripOuterQuotes(correct).replace(/\s+/g, ' ');
  const normalizedCorrect = normalizeText(base);
  const options: string[] = [];
  const add = (value: string) => {
    const option = stripOuterQuotes(value).replace(/\s+/g, ' ');
    if (!option) return;
    const norm = normalizeText(option);
    if (!norm || norm === normalizedCorrect) return;
    if (options.some((existing) => normalizeText(existing) === norm)) return;
    options.push(option);
  };

  const swaps: [string, string][] = [
    ['может', 'должен'],
    ['должен', 'может'],
    ['могу', 'должен'],
    ['покупаю', 'продаю'],
    ['купить', 'продать'],
    ['купил', 'продал'],
    ['прибывает', 'отправляется'],
    ['пришел', 'ушел'],
    ['пришла', 'ушла'],
    ['оставил', 'положил'],
    ['оставила', 'положила'],
    ['стоит', 'лежит'],
    ['лежит', 'стоит'],
    ['поставил', 'положил'],
    ['положил', 'поставил'],
    ['знаю', 'умею'],
    ['умею', 'знаю'],
    ['получил', 'стал'],
    ['к врачу', 'в аптеку'],
    ['в аптеку', 'к врачу'],
    ['на столе', 'в столе'],
    ['в городе', 'за городом'],
    ['к станции', 'на станции'],
    ['на станции', 'к станции'],
  ];

  for (const [from, to] of swaps) {
    const re = new RegExp(`(^|[\\s,.;:!?("«])(${from})(?=$|[\\s,.;:!?)"»])`, 'iu');
    if (re.test(base)) add(base.replace(re, `$1${to}`));
  }

  const neighbors = (allPairs || [])
    .map((pair) => pair.ru)
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.length - base.length) - Math.abs(b.length - base.length));
  for (const neighbor of neighbors) add(neighbor);

  return options.slice(0, 3);
}

export function formatAudioQuestion(
  pair: AudioPair,
  allPairs: readonly AudioPair[],
  level: string,
  lexicalTopic: string | null | undefined,
  random: () => number = Math.random,
): AudioQuestion | null {
  const distractors = buildRussianDistractors(pair.ru, allPairs);
  if (distractors.length < 3) return null;
  const correctAnswer = stripOuterQuotes(pair.ru);
  const options = shuffle([correctAnswer, ...distractors], random).slice(0, 4);
  const correct = options.findIndex(
    (option) => normalizeText(option) === normalizeText(correctAnswer),
  );
  if (correct < 0) return null;
  if (new Set(options.map(normalizeText)).size !== 4) return null;

  return {
    mode: 'audio',
    level,
    topic: lexicalTopic || 'Audio',
    text: AUDIO_TEXT,
    display: AUDIO_DISPLAY,
    audioText: pair.de,
    options,
    correct,
  };
}

interface RawAudio {
  audioText?: unknown;
  audio?: unknown;
  de?: unknown;
  satz?: unknown;
  sentence?: unknown;
  options?: unknown;
  correct?: unknown;
  correctAnswer?: unknown;
}

export function normalizeAudioQuestion(
  raw: unknown,
  level: string,
  lexicalTopic: string | null | undefined,
): AudioQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as RawAudio;
  const audioText = stripOuterQuotes(
    item.audioText || item.audio || item.de || item.satz || item.sentence,
  );
  if (!audioText || CYRILLIC.test(audioText)) return null;

  const options = Array.isArray(item.options)
    ? item.options.map((option) => stripOuterQuotes(option)).filter(Boolean)
    : [];
  if (options.length !== 4 || options.some((option) => !CYRILLIC.test(option))) return null;

  let correct = typeof item.correct === 'number' ? item.correct : Number.NaN;
  if (!Number.isInteger(correct)) correct = answerLetterToIndex(item.correct);
  if (correct < 0 && item.correctAnswer) {
    const correctAnswer = normalizeText(item.correctAnswer);
    correct = options.findIndex((option) => normalizeText(option) === correctAnswer);
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return null;
  if (new Set(options.map(normalizeText)).size !== 4) return null;

  // Инструкцию и подпись задаёт игра, а не модель: в Morskoy их тоже можно было переопределить
  // из ответа, но тогда в игру попадал бы чужой текст.
  const question: AudioQuestion = {
    mode: 'audio',
    level,
    topic: lexicalTopic || 'Audio',
    text: AUDIO_TEXT,
    display: AUDIO_DISPLAY,
    audioText,
    options,
    correct,
  };
  return isValidAudioQuestion(question) ? question : null;
}

export function parseJsonAudioQuestions(
  rawText: unknown,
  expectedCount: number,
  level: string,
  lexicalTopic: string | null | undefined,
): AudioQuestion[] {
  const text = String(rawText || '').trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  const parsed: unknown = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeAudioQuestion(item, level, lexicalTopic))
    .filter((q): q is AudioQuestion => q !== null)
    .slice(0, expectedCount);
}

/** Разобрать ответ модели: сначала JSON, при неудаче — пары «фраза — перевод». */
export function parseAudioAnswer(
  rawText: unknown,
  expectedCount: number,
  level: string,
  lexicalTopic: string | null | undefined,
): AudioQuestion[] {
  let valid: AudioQuestion[];
  try {
    valid = parseJsonAudioQuestions(rawText, expectedCount, level, lexicalTopic);
  } catch {
    valid = [];
  }
  if (!valid.length) {
    const pairs = parseAudioPairs(rawText, expectedCount);
    valid = pairs
      .map((pair) => formatAudioQuestion(pair, pairs, level, lexicalTopic))
      .filter(isValidAudioQuestion);
  }
  return valid;
}

export interface AudioPromptOptions {
  level: string;
  lexicalTopic?: string | null;
  questionsCount: number;
  exclude?: readonly string[];
}

/** Промпт для заданий на аудирование — дословно как в Morskoy. */
export function buildAudioPrompt({
  level,
  lexicalTopic,
  questionsCount,
  exclude,
}: AudioPromptOptions): string {
  const excludePart =
    exclude && exclude.length
      ? `\nDo not reuse these German sentences: ${exclude
          .slice(-12)
          .map((item) => `"${item}"`)
          .join(', ')}\n`
      : '';

  return `You are an experienced DaF teacher building listening-comprehension tasks with strong, fair distractors.

Create exactly ${questionsCount} short German listening tasks with one exact Russian translation and three wrong Russian options.
Level: ${level}. Do not use grammar or vocabulary above ${level}.
Lexical topic: ${lexicalTopic || 'Alltag'}.
${excludePart}
Rules:
1. Every German sentence is natural, complete, and 6 to 14 words long.
2. The correct Russian option is an exact translation.
3. Wrong options are realistic learner traps: similar word field, separable prefix, modal verb, preposition, case relation, movement direction, false friend, or verb valency.
4. All four options are Russian, similarly short, plausible, and distinct.

Output only a JSON array, no Markdown:
[
  {
    "audioText": "Ich hole das Rezept in der Apotheke ab.",
    "options": [
      "Я забираю рецепт в аптеке.",
      "Я отдаю рецепт в аптеке.",
      "Я забираю чек в аптеке.",
      "Я забираю рецепт у врача."
    ],
    "correct": 0
  }
]

Write exactly ${questionsCount} objects now.`;
}
