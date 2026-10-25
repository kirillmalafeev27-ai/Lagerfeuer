import { type RawExercise, answerLetterToIndex } from './exerciseValidation.ts';

/** Задание, разобранное из текстового ответа модели (ещё не проверенное). */
export interface ParsedExercise extends RawExercise {
  format: string | null;
  text: string;
  display: string | undefined;
  options: string[];
  correct: number;
  correctAnswer: string;
}

/** Метка строки с немецким материалом задания. */
const DISPLAY_LABEL = /^(Aufgabe|Satz|Wörter|Woerter|Dialog)\s*:\s*/i;
/** Служебные строки задания: в материал не входят. */
const META_LABEL = /^(Format|Anweisung)\s*:/i;
/** «Antwort: — Ja, …»: у реплики диалога метка лишняя, на экране остаётся сама реплика. */
const REPLICA_LABEL = /^(Frage|Antwort)\s*:\s*(?=[—–-]\s)/i;
/**
 * Решение: на нём материал заканчивается, на экран оно не попадёт. «Antwort: — Ja, …» — это
 * реплика-ответ диалога, а «Antwort: C» — уже решение.
 */
const SOLUTION_LABEL =
  /^(?:(?:Lösung|Loesung|Richtige Antwort|Erklärung|Erklaerung)\s*:|Antwort\s*:\s*[ABCD](?:\s*[).:=(–—-]|\s*$))/i;

/**
 * Разбор текстового формата из exercisePrompt.ts (OUTPUT_TEXT), перенесено из Morskoy.
 *
 * Задания и ключ ответов стоят отдельно, и это намеренно: модель должна сначала решить каждое
 * задание, а потом выписать ответ — букву И текст. Если они не совпадают, ответ угадан, и задание
 * отбрасывается при проверке.
 *
 * Материал задания — строка «Aufgabe:» и все строки за ней до вариантов: реплики мини-диалога
 * модель часто пишет каждую с новой строки. В Morskoy бралась одна строка, и вторая реплика —
 * та, где пропуск, — терялась.
 */
export function parseTextExercises(rawText: unknown, expectedCount: number): ParsedExercise[] {
  const text = String(rawText || '')
    .replace(/\r/g, '')
    .trim();

  const solutionMarker = text.match(
    /\n\s*(?:={2,}\s*)?(?:LÖSUNGEN|LOESUNGEN|ANTWORTEN|SCHLÜSSEL|SCHLUESSEL|KEYS)(?:\s*={2,})?\s*\n/i,
  );
  if (!solutionMarker || solutionMarker.index === undefined) return [];

  const tasksText = text
    .slice(0, solutionMarker.index)
    .replace(/^\s*(?:={2,}\s*)?AUFGABEN(?:\s*={2,})?\s*/i, '')
    .trim();
  const keysText = text.slice(solutionMarker.index + solutionMarker[0].length).trim();

  const keyMap = new Map<number, { index: number; answerText: string }>();
  const keyRegex = /(?:^|\n)\s*(\d{1,2})\s*[.):=-]\s*([ABCD])(?:\s*=\s*(.+?))?\s*(?=\n|$)/gi;
  let keyMatch: RegExpExecArray | null;
  while ((keyMatch = keyRegex.exec(keysText))) {
    const number = Number(keyMatch[1]);
    const index = answerLetterToIndex(keyMatch[2]);
    if (number > 0 && index >= 0) {
      keyMap.set(number, { index, answerText: keyMatch[3] ? keyMatch[3].trim() : '' });
    }
  }

  const blocks = tasksText
    .split(/\n(?=\s*\d{1,2}\.\s+)/)
    .map((block) => block.trim())
    .filter(Boolean);

  const parsed: ParsedExercise[] = [];
  for (const block of blocks) {
    const numberMatch = block.match(/^\s*(\d{1,2})\.\s*(.*)$/m);
    if (!numberMatch) continue;

    const key = keyMap.get(Number(numberMatch[1]));
    if (!key) continue;

    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const optionLines: { label: string; value: string }[] = [];
    const bodyLines: string[] = [];
    // Материал — строки до вариантов, начиная со строки с меткой (если она есть).
    const material: string[] = [];
    let labelled = false;
    let solved = false;
    for (const line of lines) {
      const optionMatch = line.match(/^([ABCD])[).:]\s*(.+)$/i);
      if (optionMatch) {
        optionLines.push({ label: optionMatch[1].toUpperCase(), value: optionMatch[2].trim() });
        continue;
      }
      if (/^\d{1,2}\.\s*$/.test(line)) continue;
      const body = line.replace(/^\d{1,2}\.\s*/, '').trim();
      bodyLines.push(body);
      if (optionLines.length || solved || META_LABEL.test(body)) continue;
      if (SOLUTION_LABEL.test(body)) {
        solved = true;
        continue;
      }
      if (DISPLAY_LABEL.test(body)) {
        if (!labelled) material.length = 0;
        labelled = true;
      }
      material.push(body.replace(DISPLAY_LABEL, '').replace(REPLICA_LABEL, ''));
    }

    if (optionLines.length !== 4) continue;
    const options = ['A', 'B', 'C', 'D'].map(
      (label) => optionLines.find((option) => option.label === label)?.value || '',
    );
    if (options.some((option) => !option)) continue;

    const pick = (pattern: RegExp) => bodyLines.find((line) => pattern.test(line));
    const formatLine = pick(/^Format\s*:/i);
    const instructionLine = pick(/^Anweisung\s*:/i);

    // Строки материала сохраняют переносы: реплики диалога панель покажет каждую с новой строки.
    const display =
      material
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n') || undefined;

    parsed.push({
      format: formatLine
        ? formatLine
            .replace(/^Format\s*:\s*/i, '')
            .trim()
            .toLowerCase()
        : null,
      text: instructionLine
        ? instructionLine.replace(/^Anweisung\s*:\s*/i, '').trim()
        : 'Выбери правильный вариант.',
      display,
      options,
      correct: key.index,
      correctAnswer: key.answerText || options[key.index] || '',
    });

    if (parsed.length >= expectedCount) break;
  }

  return parsed;
}
