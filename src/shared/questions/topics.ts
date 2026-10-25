/**
 * Темы генерации вопросов — те же, что в Morskoy (public/js/questions.js): уровень, лексическая
 * тема и грамматические темы. Названия тем — немецкие и уходят в API как есть; у каждой есть
 * правила в server/generation/grammarRules.ts (это проверяет тест).
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export type GrammarGroupId =
  'verbs' | 'nouns' | 'adjectives' | 'prepositions' | 'syntax' | 'clauses' | 'advanced';

export const GRAMMAR_GROUPS: readonly { id: GrammarGroupId; topics: readonly string[] }[] = [
  {
    id: 'verbs',
    topics: [
      'Präsens',
      'Perfekt',
      'Präteritum',
      'Futur I',
      'Imperativ',
      'Modalverben',
      'Modalverben in Präteritum',
      'Trennbare Verben',
      'Reflexive Verben',
      'Verben mit Präpositionen',
      'Lassen',
    ],
  },
  {
    id: 'nouns',
    topics: [
      'Artikel',
      'Nominativ',
      'Akkusativ',
      'Dativ',
      'Genitiv',
      'N-Deklination',
      'Pronomen',
      'Pronomen in Akkusativ',
      'Pronomen in Dativ',
      'Pronominaladverbien',
      'Possessivpronomen in verschiedenen Kasus',
    ],
  },
  { id: 'adjectives', topics: ['Adjektivdeklination', 'Steigerung'] },
  {
    id: 'prepositions',
    topics: [
      'Wechselpräpositionen',
      'Lokale Präpositionen',
      'Temporale Präpositionen',
      'Kausale Präpositionen',
    ],
  },
  {
    id: 'syntax',
    topics: ['Negation', 'Satzklammer', 'Wortstellung im Hauptsatz', 'Wortstellung im Nebensatz'],
  },
  {
    id: 'clauses',
    topics: [
      'weil-Sätze',
      'dass-Sätze',
      'obwohl-Sätze',
      'wenn-Sätze',
      'Relativsätze',
      'Indirekte Fragen',
      'Infinitiv mit zu',
    ],
  },
  {
    id: 'advanced',
    topics: [
      'Konjunktiv II',
      'Passiv',
      'Zustandspassiv',
      'Plusquamperfekt',
      'Konjunktiv I',
      'Doppelkonjunktionen',
      'als vs. wenn',
      'Partizip I und II als Adjektive',
    ],
  },
];

export const GRAMMAR_TOPICS: readonly string[] = GRAMMAR_GROUPS.flatMap((g) => g.topics);

/**
 * Свои наборы слов: список учителя, задания к нему написаны заранее (server/vocab/), ИИ для них
 * не нужен. В выборе тем они стоят первыми и считаются вместе с грамматическими темами.
 */
export const VOCAB_TOPICS: readonly string[] = ['Wortschatz für Sascha und Präpositionen'];

export function isVocabTopic(topic: string): boolean {
  return VOCAB_TOPICS.includes(topic);
}

/** Все темы, которые можно выбрать. */
export const QUIZ_TOPICS: readonly string[] = [...VOCAB_TOPICS, ...GRAMMAR_TOPICS];

/** Лексические темы (Wortschatz). */
export const LEXICAL_TOPICS: readonly string[] = [
  'Begrüßung',
  'Familie',
  'Kindheit',
  'Schule',
  'Essen und Trinken',
  'Tagesablauf',
  'Wetter',
  'Stadt',
  'Hobbys und Freizeit',
  'Reisen und Urlaub',
  'Einkaufen',
  'Natur und Umwelt',
  'Wohnen',
  'Kleidung',
  'Körper und Gesundheit',
  'Berufe',
  'Verkehrsmittel',
  'Feste und Feiertage',
  'Medien und Technik',
];

/** Сколько тем можно выбрать сразу: в Morskoy их было пять, по слоту на бонус. */
export const MAX_GRAMMAR_TOPICS = 5;

/** Что выбрал игрок. Вопросы по темам чередуются. */
export interface QuizConfig {
  level: CefrLevel;
  /** null — лексика на усмотрение генератора. */
  lexicalTopic: string | null;
  /** Выбранные темы: грамматика и свои наборы слов (имя поля — как в сохранённых настройках). */
  grammarTopics: string[];
  /** Задания на порядок слов (слот Wortstellung из Morskoy) на материале первой грамматической темы. */
  wortstellung: boolean;
  /** Аудирование: немецкая фраза звучит вслух, выбрать точный перевод. */
  listening: boolean;
}

/** Проверить и починить сохранённые настройки: неизвестные темы отбрасываются. */
export function sanitizeQuizConfig(raw: unknown): QuizConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Record<keyof QuizConfig, unknown>>;
  const level = CEFR_LEVELS.find((l) => l === r.level);
  if (!level) return null;
  const grammarTopics = (Array.isArray(r.grammarTopics) ? r.grammarTopics : [])
    .filter((t): t is string => typeof t === 'string' && QUIZ_TOPICS.includes(t))
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, MAX_GRAMMAR_TOPICS);
  const lexicalTopic =
    typeof r.lexicalTopic === 'string' && LEXICAL_TOPICS.includes(r.lexicalTopic)
      ? r.lexicalTopic
      : null;
  const listening = r.listening === true;
  if (!grammarTopics.length && !listening) return null;
  return {
    level,
    lexicalTopic,
    grammarTopics,
    wortstellung: r.wortstellung === true && grammarTopics.some((t) => !isVocabTopic(t)),
    listening,
  };
}
