// Источник вопросов серии (раздел 12): игра получает вопросы через интерфейс
// и не знает, откуда они берутся.

export interface Question {
  id: string;
  /** Текст задания. */
  prompt: string;
  promptLang: 'de' | 'ru';
  /** 2–4 варианта. */
  options: string[];
  optionsLang: 'de' | 'ru';
  correctIndex: number;
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
