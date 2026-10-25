import { type FormatId, WORTSTELLUNG_FORMATS, isFormatId } from './exerciseFormats.ts';
import { getTopicFormats, resolveTopic } from './grammarRules.ts';

/**
 * Проверка ответа модели (перенесено из Morskoy, lib/exercise-validation.js): то, чего промпт
 * не гарантирует, проверяет код. Причины отказа пишутся в лог по-немецки, как в Morskoy, — по ним
 * видно, на чём модель спотыкается.
 *
 * Сколько «субстанции» должно быть в варианте — машинная сторона правила субстанции из
 * qualityRules.ts. Темы, где целевое явление действительно одно слово (союз, предлог, значение
 * модального глагола, форма глагола, местоимение), не входят ни в один список: там вариант
 * из одного слова правилен.
 */

/** Целевая структура — именная группа: одного артикля мало. */
export const PHRASE_TOPICS: ReadonlySet<string> = new Set([
  'Nominativ',
  'Akkusativ',
  'Dativ',
  'Genitiv',
  'N-Deklination',
  'Adjektivdeklination',
  'Reflexive Verben',
  'Wechselpräpositionen',
]);

/** Целевая структура — группа слов или целое предложение. */
export const SENTENCE_TOPICS: ReadonlySet<string> = new Set([
  'Infinitiv mit zu',
  'Relativsätze',
  'Wortstellung im Hauptsatz',
  'Wortstellung im Nebensatz',
  'Satzklammer',
  'Trennbare Verben',
  'Passiv',
  'Zustandspassiv',
  'Plusquamperfekt',
  'Konjunktiv I',
  'Konjunktiv II',
  'Partizip I und II als Adjektive',
  'Indirekte Fragen',
  'Doppelkonjunktionen',
  'Lassen',
]);

/** Минимум слов, которого должен достичь хотя бы один вариант. */
export function minOptionWords(grammarTopic: unknown, isWortstellung?: boolean): number {
  if (isWortstellung) return 3;
  const topic = resolveTopic(grammarTopic);
  if (!topic) return 1;
  if (SENTENCE_TOPICS.has(topic)) return 3;
  if (PHRASE_TOPICS.has(topic)) return 2;
  return 1;
}

/** Форматы, где варианты обязаны быть целыми предложениями. */
export const SENTENCE_FORMATS: ReadonlySet<string> = new Set([
  'satzvarianten',
  'umformung',
  'verbindung',
  'fehlerkorrektur',
  'wortstellung',
]);

const MIN_SENTENCE_WORDS = 4;

/** Форматы, где по описанию в каталоге пропуск стоит в материале: без него задание не решить. */
export const GAP_FORMATS: ReadonlySet<string> = new Set(['luecke', 'mehrfachluecke', 'dialog']);

/** Пропуск в материале: «___», «…» или нумерованный «(1)». */
const GAP = /_{2,}|…|\.{3}|\(\s*\d\s*\)/;

export function normalizeText(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .replace(/[„“”«»"']/g, '')
    .trim()
    .toLowerCase();
}

export function wordCount(value: unknown): number {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/).length : 0;
}

export function answerLetterToIndex(letter: unknown): number {
  return ['A', 'B', 'C', 'D'].indexOf(
    String(letter || '')
      .trim()
      .toUpperCase(),
  );
}

/** Задание в формате генератора — так его отдаёт API (как в Morskoy). */
export interface GeneratedQuestion {
  format: FormatId | null;
  /** Короткая инструкция по-русски. */
  text: string;
  /** Немецкий материал задания. */
  display: string;
  options: string[];
  correct: number;
}

/** Сырое задание из ответа модели: поля могут быть любыми. */
export interface RawExercise {
  format?: unknown;
  text?: unknown;
  display?: unknown;
  options?: unknown;
  correct?: unknown;
  correctAnswer?: unknown;
  answer?: unknown;
  loesung?: unknown;
}

export interface ValidationContext {
  grammarTopic?: unknown;
  isWortstellung?: boolean;
  count?: number;
  exclude?: readonly string[];
}

export type ValidationResult =
  { ok: true; question: GeneratedQuestion } | { ok: false; reason: string };

/**
 * Проверка одного задания. Возвращает очищенное задание или причину отказа — причины попадают
 * в лог и показывают, на чём модель сейчас ошибается.
 */
export function validateQuestion(raw: unknown, context: ValidationContext = {}): ValidationResult {
  const reject = (reason: string): ValidationResult => ({ ok: false, reason });

  if (!raw || typeof raw !== 'object') return reject('kein Objekt');
  const item = raw as RawExercise;

  const text = String(item.text || '').trim();
  const display = String(item.display || '').trim();
  if (!text) return reject('Anweisung fehlt');
  if (!display) return reject('Aufgabenmaterial fehlt');

  const options = Array.isArray(item.options)
    ? item.options.map((option) =>
        String(option == null ? '' : option)
          .replace(/\s+/g, ' ')
          .trim(),
      )
    : [];
  if (options.length !== 4) return reject(`${options.length} statt 4 Optionen`);
  if (options.some((option) => !option)) return reject('leere Option');
  if (options.some((option) => option.includes('___'))) return reject('Lücke steht in der Option');
  if (new Set(options.map(normalizeText)).size !== 4) return reject('doppelte Optionen');

  // Оборванные предложения: модель остановилась на полуслове.
  const truncated = [display, ...options].some((value) => /(\.\.\.|…)\s*$/.test(value));
  if (truncated) return reject('abgeschnittener Satz');

  let correct = Number.isInteger(item.correct) ? (item.correct as number) : Number.NaN;
  if (!Number.isInteger(correct)) correct = answerLetterToIndex(item.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3)
    return reject('ungültiger correct-Index');

  // Перекрёстная проверка: индекс и выписанный текст ответа должны указывать на один вариант.
  // Если они расходятся, модель сбилась при счёте.
  const claimed = item.correctAnswer || item.answer || item.loesung;
  if (claimed) {
    const claimedText = normalizeText(claimed);
    if (claimedText && claimedText !== normalizeText(options[correct])) {
      const fallback = options.findIndex((option) => normalizeText(option) === claimedText);
      if (fallback < 0) return reject('correctAnswer passt zu keiner Option');
      correct = fallback;
    }
  }

  // Допустимы только форматы, которые для этой темы есть в каталоге. Формат, придуманный
  // моделью, не даёт права на исключения.
  const allowedFormats: readonly string[] = context.isWortstellung
    ? WORTSTELLUNG_FORMATS
    : context.grammarTopic
      ? getTopicFormats(context.grammarTopic)
      : [];
  const declared = String(item.format || '')
    .trim()
    .toLowerCase();
  const format =
    declared && allowedFormats.includes(declared) && isFormatId(declared) ? declared : null;

  // Задание на пропуск без пропуска: например, до экрана дошла только первая реплика диалога,
  // а варианты подставляются во вторую. Смотрим на заявленный формат, даже если теме он не положен.
  if (GAP_FORMATS.has(declared) && !GAP.test(display))
    return reject('Lücke fehlt im Aufgabenmaterial');

  // ПРОВЕРКА СУБСТАНЦИИ — главная защита от примитивных заданий. Если ВСЕ четыре варианта
  // меньше минимума темы, это запрещённое задание на служебное слово: например,
  // «zu / – / zum / um zu» по теме «Infinitiv mit zu» или «den / der / dem / dessen» по
  // относительным придаточным.
  const minWords = minOptionWords(context.grammarTopic, context.isWortstellung);
  if (minWords > 1 && options.every((option) => wordCount(option) < minWords)) {
    return reject(`Füllwort-Optionen: Thema verlangt mindestens ${minWords} Wörter je Option`);
  }

  // Форматам-предложениям нужны предложения, а не обрывки.
  const needsSentences = context.isWortstellung || (format ? SENTENCE_FORMATS.has(format) : false);
  if (needsSentences) {
    const sentenceLike = options.filter((option) => wordCount(option) >= MIN_SENTENCE_WORDS).length;
    if (sentenceLike < 3)
      return reject(`Format "${format || 'wortstellung'}" verlangt vollständige Sätze`);
  }

  // Варианты очень разной длины выдают ответ.
  const lengths = options.map((option) => option.length);
  if (Math.max(...lengths) > 5 * Math.min(...lengths)) {
    return reject('Optionen zu unterschiedlich lang');
  }

  return {
    ok: true,
    question: { format, text, display, options, correct },
  };
}

export interface BatchResult {
  questions: GeneratedQuestion[];
  rejected: string[];
  formatCounts: Record<string, number>;
}

/**
 * Проверка всего блока: убирает дубли и ограничивает частоту одного формата, чтобы игрок не
 * получил десять раз один и тот же шаблон.
 */
export function validateBatch(rawQuestions: unknown, context: ValidationContext = {}): BatchResult {
  const list: unknown[] = Array.isArray(rawQuestions) ? rawQuestions : [];
  const wanted = Math.max(1, Number(context.count) || 10);
  const maxPerFormat = Math.max(2, Math.ceil(wanted * 0.4));

  const accepted: GeneratedQuestion[] = [];
  const overflow: GeneratedQuestion[] = [];
  const rejected: string[] = [];
  const seenDisplays = new Set(
    (Array.isArray(context.exclude) ? context.exclude : []).map(normalizeText).filter(Boolean),
  );
  const formatCounts: Record<string, number> = Object.create(null);

  for (const raw of list) {
    const result = validateQuestion(raw, context);
    if (!result.ok) {
      rejected.push(result.reason);
      continue;
    }

    const key = normalizeText(result.question.display);
    if (seenDisplays.has(key)) {
      rejected.push('Aufgabe doppelt');
      continue;
    }
    seenDisplays.add(key);

    const format = result.question.format || 'unbekannt';
    const used = formatCounts[format] || 0;
    // Сверх лимита задание уходит в конец очереди, а не в брак: лучше однообразный блок,
    // чем пустой.
    if (used >= maxPerFormat) {
      overflow.push(result.question);
      continue;
    }

    formatCounts[format] = used + 1;
    accepted.push(result.question);
  }

  return {
    questions: [...accepted, ...overflow],
    rejected,
    formatCounts,
  };
}
