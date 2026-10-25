import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type AiConfig,
  type Env,
  type FetchLike,
  HttpError,
  aiConfigFromEnv,
  requestAiText,
} from './ai.ts';
import { type AudioQuestion, buildAudioPrompt, parseAudioAnswer } from './generation/audioTasks.ts';
import { buildExercisePrompt, normalizeLevel } from './generation/exercisePrompt.ts';
import { type GeneratedQuestion, validateBatch } from './generation/exerciseValidation.ts';
import { resolveTopic } from './generation/grammarRules.ts';
import { parseTextExercises } from './generation/textFormat.ts';
import { TtsService, ttsConfigFromEnv } from './tts.ts';
import { type VocabQuestion, findVocabSet, pickVocabQuestions } from './vocab/vocabSets.ts';

/**
 * API вопросов (перенесено из Morskoy, quiz-generation.js): генерация заданий по грамматике,
 * задания на аудирование, озвучка, статус. Один обработчик в стиле connect работает и в
 * dev-сервере Vite (плагин в vite.config.ts), и в боевом сервере (server/index.ts).
 */

export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export interface QuizApiOptions {
  env: Env;
  fetch?: FetchLike;
  log?: Logger;
  /** Случайность выбора и перемешивания (для тестов). */
  random?: () => number;
}

/** Сколько лишних заданий держать про запас на один ключ (тема × уровень × лексика). */
const POOL_LIMIT = 60;
const MAX_EXCLUDE = 30;
const MAX_TEXT = 300;
const MAX_LEXICAL = 80;

export interface GenerateRequest {
  level?: unknown;
  lexicalTopic?: unknown;
  grammarTopic?: unknown;
  isWortstellung?: unknown;
  count?: unknown;
  exclude?: unknown;
}

function clampCount(count: unknown): number {
  return Math.max(1, Math.min(20, Number(count) || 10));
}

/** Строки из клиента — только строки, без переводов строк и разумной длины. */
function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT))
    .filter(Boolean)
    .slice(-MAX_EXCLUDE);
}

function cleanLexical(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'lexicalTopic must be a string');
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > MAX_LEXICAL) throw new HttpError(400, 'lexicalTopic is too long');
  return text || null;
}

export class QuizService {
  readonly ai: AiConfig;
  readonly tts: TtsService;
  private readonly fetchImpl: FetchLike;
  private readonly logger: Logger;
  private readonly random: () => number;
  private readonly questionPool = new Map<string, GeneratedQuestion[]>();
  private readonly audioPool = new Map<string, AudioQuestion[]>();

  constructor(opts: QuizApiOptions) {
    this.ai = aiConfigFromEnv(opts.env);
    this.fetchImpl = opts.fetch ?? fetch;
    this.tts = new TtsService(ttsConfigFromEnv(opts.env), this.fetchImpl);
    this.logger = opts.log ?? console;
    this.random = opts.random ?? Math.random;
  }

  status() {
    return {
      ok: true,
      generationConfigured: Boolean(this.ai.key),
      ttsConfigured: this.tts.configured,
      models: this.ai.models,
    };
  }

  /** Блок заданий по грамматической теме или по своему набору слов. */
  async generateQuestions(
    body: GenerateRequest,
  ): Promise<{ questions: (GeneratedQuestion | VocabQuestion)[] }> {
    const { level, grammarTopic } = body;
    if (!level || !grammarTopic) throw new HttpError(400, 'level and grammarTopic are required');
    // Свой набор слов: задания написаны заранее, модель не нужна (и ключ генерации тоже).
    const vocab = findVocabSet(grammarTopic);
    if (vocab) {
      return {
        questions: pickVocabQuestions(
          vocab,
          clampCount(body.count),
          cleanList(body.exclude),
          this.random,
        ),
      };
    }
    // В отличие от Morskoy, тема обязана быть из каталога: иначе API становится бесплатным
    // доступом к модели с любым текстом в промпте.
    const topic = resolveTopic(grammarTopic);
    if (!topic) throw new HttpError(400, 'unknown grammarTopic');
    const lexicalTopic = cleanLexical(body.lexicalTopic);
    const isWortstellung = Boolean(body.isWortstellung);
    const questionsCount = clampCount(body.count);
    const levelKey = normalizeLevel(level);

    const cacheKey = `${levelKey}:${topic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;
    const pooled = this.questionPool.get(cacheKey);
    if (pooled && pooled.length >= questionsCount)
      return { questions: pooled.splice(0, questionsCount) };

    // Просим чуть больше, чем нужно: проверка субстанции и дублей регулярно отсеивает
    // отдельные задания.
    const requestCount = Math.min(20, questionsCount + 4);
    const exclude = cleanList(body.exclude);

    const prompt = buildExercisePrompt({
      level: levelKey,
      lexicalTopic,
      grammarTopic: topic,
      isWortstellung,
      count: requestCount,
      exclude,
      output: 'text',
    });

    const text = await requestAiText(this.ai, prompt, 8192, this.fetchImpl);
    const parsed = parseTextExercises(text, requestCount);
    const { questions, rejected, formatCounts } = validateBatch(parsed, {
      grammarTopic: topic,
      isWortstellung,
      count: questionsCount,
      exclude,
    });

    const label = `${topic} ${levelKey}`;
    if (rejected.length) {
      this.logger.warn(
        `[${label}] ${questions.length}/${parsed.length} Aufgaben übernommen; aussortiert: ${rejected.join('; ')}`,
      );
    }
    if (questions.length) this.logger.log(`[${label}] Formate:`, formatCounts);

    if (!questions.length) {
      throw new HttpError(
        502,
        'No valid questions in LLM response',
        rejected.slice(0, 5).join('; ') || 'Antwort ließ sich nicht parsen',
      );
    }

    if (questions.length > questionsCount) {
      const pool = this.questionPool.get(cacheKey) ?? [];
      pool.push(...questions.slice(questionsCount));
      this.questionPool.set(cacheKey, pool.slice(-POOL_LIMIT));
    }
    return { questions: questions.slice(0, questionsCount) };
  }

  /** Блок заданий на аудирование. */
  async generateAudioQuestions(body: GenerateRequest): Promise<{ questions: AudioQuestion[] }> {
    if (!body.level) throw new HttpError(400, 'level is required');
    const level = normalizeLevel(body.level);
    const lexicalTopic = cleanLexical(body.lexicalTopic);
    const questionsCount = clampCount(body.count);
    const cacheKey = `audio:${level}:${lexicalTopic || ''}`;
    const pooled = this.audioPool.get(cacheKey);
    if (pooled && pooled.length >= questionsCount)
      return { questions: pooled.splice(0, questionsCount) };

    const wanted = Math.max(questionsCount, 10);
    const prompt = buildAudioPrompt({
      level,
      lexicalTopic,
      questionsCount: wanted,
      exclude: cleanList(body.exclude),
    });
    const text = await requestAiText(this.ai, prompt, 4096, this.fetchImpl);
    const valid = parseAudioAnswer(text, wanted, level, lexicalTopic);
    if (!valid.length) throw new HttpError(502, 'No valid audio questions in LLM response');

    if (valid.length > questionsCount) {
      const pool = this.audioPool.get(cacheKey) ?? [];
      pool.push(...valid.slice(questionsCount));
      this.audioPool.set(cacheKey, pool.slice(-POOL_LIMIT));
    }
    return { questions: valid.slice(0, questionsCount) };
  }
}

// ───────────────────────────── HTTP ─────────────────────────────

export type Next = (error?: unknown) => void;
export type Handler = (req: IncomingMessage, res: ServerResponse, next?: Next) => void;

const BODY_LIMIT = 1_000_000;

async function readJson(req: IncomingMessage): Promise<GenerateRequest> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, 'request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as GenerateRequest) : {};
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(data));
  res.end(data);
}

function sendError(res: ServerResponse, error: unknown, fallback: string): void {
  const status = error instanceof HttpError ? error.statusCode : 502;
  const message = error instanceof Error && error.message ? error.message : fallback;
  const detail = error instanceof HttpError ? error.detail : undefined;
  sendJson(res, status, detail ? { error: message, detail } : { error: message });
}

/** Обработчик маршрутов API. Всё, что не API, уходит дальше в next(). */
export function createQuizHandler(service: QuizService): Handler {
  const routes: Record<
    string,
    { method: 'GET' | 'POST'; run: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  > = {
    '/healthz': {
      method: 'GET',
      run: async (_req, res) => sendJson(res, 200, { ok: true }),
    },
    '/api/quiz/status': {
      method: 'GET',
      run: async (_req, res) => sendJson(res, 200, service.status()),
    },
    '/api/generate-questions': {
      method: 'POST',
      run: async (req, res) => {
        try {
          sendJson(res, 200, await service.generateQuestions(await readJson(req)));
        } catch (error) {
          sendError(res, error, 'Failed to generate questions');
        }
      },
    },
    '/api/generate-audio-questions': {
      method: 'POST',
      run: async (req, res) => {
        try {
          sendJson(res, 200, await service.generateAudioQuestions(await readJson(req)));
        } catch (error) {
          sendError(res, error, 'Failed to generate audio questions');
        }
      },
    },
    '/api/tts': {
      method: 'POST',
      run: async (req, res) => {
        try {
          const body = (await readJson(req)) as { text?: unknown };
          const audio = await service.tts.speak(body.text);
          res.statusCode = 200;
          res.setHeader('Content-Type', audio.contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('X-TTS-Cache', audio.cached ? 'HIT' : 'MISS');
          res.setHeader('Content-Length', audio.buffer.length);
          res.end(audio.buffer);
        } catch (error) {
          sendError(res, error, 'ElevenLabs TTS request failed');
        }
      },
    },
  };

  return (req, res, next) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const route = routes[path];
    if (!route) {
      if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
      if (next) return next();
      return sendJson(res, 404, { error: 'not found' });
    }
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (method !== route.method) {
      res.setHeader('Allow', route.method);
      return sendJson(res, 405, { error: 'method not allowed' });
    }
    route.run(req, res).catch((error: unknown) => {
      if (!res.headersSent) sendError(res, error, 'internal error');
      else res.end();
    });
  };
}
