/**
 * Клиент ИИ (перенесено из Morskoy, quiz-generation.js): OpenAI-совместимый /chat/completions
 * через AI Tunnel. Модели перебираются по порядку, пока одна не ответит.
 */

export type Env = Record<string, string | undefined>;

export const DEFAULT_MODELS = 'gpt-5.4,gpt-5.2,gpt-5,gpt-5-mini,gpt-4o,gpt-4o-mini';

export interface AiConfig {
  key: string;
  baseUrl: string;
  models: string[];
  /** Сколько ждать ответа одной модели, мс. */
  timeoutMs: number;
}

export function aiConfigFromEnv(env: Env): AiConfig {
  const key = env.AITUNNEL_API_KEY || env.OPENAI_API_KEY || '';
  let baseUrl: string;
  if (env.AI_BASE_URL) baseUrl = env.AI_BASE_URL.replace(/\/$/, '');
  else if (env.OPENAI_BASE_URL) baseUrl = env.OPENAI_BASE_URL.replace(/\/$/, '');
  else baseUrl = env.AITUNNEL_API_KEY ? 'https://api.aitunnel.ru/v1' : 'https://api.openai.com/v1';
  const models = (env.AITUNNEL_MODELS || DEFAULT_MODELS)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const timeoutMs = Number(env.AI_TIMEOUT_MS) > 0 ? Number(env.AI_TIMEOUT_MS) : 120_000;
  return { key, baseUrl, models, timeoutMs };
}

/** Ошибка с HTTP-кодом для ответа клиенту. */
export class HttpError extends Error {
  readonly statusCode: number;
  /** Подробности для клиента (например, почему отсеяны задания). */
  detail?: string;

  constructor(statusCode: number, message: string, detail?: string) {
    super(message);
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Запросить текст у первой ответившей модели. Без ключа — 503, если не ответила ни одна — 502
 * со списком причин по каждой модели.
 */
export async function requestAiText(
  config: AiConfig,
  prompt: string,
  maxTokens: number,
  fetchImpl: FetchLike = fetch,
  systemPrompt = '',
): Promise<string> {
  if (!config.key) throw new HttpError(503, 'AITUNNEL_API_KEY is not configured');

  const errors: string[] = [];
  for (const model of config.models) {
    // Модели рассуждающих семейств (gpt-5, o-серия) у OpenAI не принимают max_tokens и просят
    // max_completion_tokens. Если прокси передаёт запрос как есть, повторяем ту же модель с ним,
    // а не переходим молча к следующей, более слабой.
    for (const tokenField of ['max_tokens', 'max_completion_tokens'] as const) {
      try {
        const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            [tokenField]: maxTokens,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt },
            ],
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        const bodyText = await response.text();
        if (!response.ok) {
          if (
            tokenField === 'max_tokens' &&
            response.status === 400 &&
            /max_completion_tokens/.test(bodyText)
          )
            continue;
          errors.push(`${model}: HTTP ${response.status} ${bodyText.slice(0, 220)}`);
          break;
        }

        const data = JSON.parse(bodyText) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) return content.trim();
        errors.push(`${model}: empty response`);
        break;
      } catch (error) {
        errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }

  throw new HttpError(502, `AI Tunnel: all models failed: ${errors.join(' | ')}`);
}
