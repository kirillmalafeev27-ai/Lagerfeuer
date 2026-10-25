// Источник вопросов серии (раздел 12): игра получает вопросы через интерфейс
// и не знает, откуда они берутся.

export interface Question {
  id: string;
  /** Текст задания. У сгенерированных — немецкий материал (display в Morskoy). */
  prompt: string;
  promptLang: 'de' | 'ru';
  /**
   * Короткая инструкция по-русски над заданием («Соедини два предложения в одно.»), как text в
   * формате Morskoy. У вопросов банка её нет: задание говорит само за себя.
   */
  instruction?: string;
  /** 2–4 варианта. Сгенерированные задания всегда дают четыре, часто — целыми предложениями. */
  options: string[];
  optionsLang: 'de' | 'ru';
  correctIndex: number;
  /** Формат задания из каталога генератора: satzvarianten, umformung, dialog… */
  format?: string;
  /** Грамматическая тема, по которой задание создано. */
  topic?: string;
  /** Аудирование: немецкая фраза звучит вслух, на экране её нет. */
  audioText?: string;
}

export interface AnswerReport {
  id: string;
  correct: boolean;
  timeMs: number;
}

export interface QuestionProvider {
  next(): Promise<Question>;
  report(r: AnswerReport): void;
}
