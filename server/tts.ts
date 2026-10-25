import { type Env, type FetchLike, HttpError } from './ai.ts';

/**
 * Озвучка немецких фраз для аудирования (перенесено из Morskoy): ElevenLabs, ответы держатся
 * в памяти (LRU), чтобы одна и та же фраза не синтезировалась дважды.
 */
export interface TtsConfig {
  key: string;
  voiceId: string;
  modelId: string;
  cacheLimit: number;
}

export function ttsConfigFromEnv(env: Env): TtsConfig {
  return {
    key: env.ELEVENLABS_API_KEY || env.ELEVEN_API_KEY || '',
    voiceId: env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    modelId: env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5',
    cacheLimit: Number(env.TTS_CACHE_LIMIT || 180),
  };
}

export interface TtsAudio {
  buffer: Buffer;
  contentType: string;
  cached: boolean;
}

export const TTS_MAX_CHARS = 420;

export class TtsService {
  readonly config: TtsConfig;
  private readonly fetchImpl: FetchLike;
  private readonly cache = new Map<string, { buffer: Buffer; contentType: string }>();

  constructor(config: TtsConfig, fetchImpl: FetchLike = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  get configured(): boolean {
    return Boolean(this.config.key);
  }

  async speak(rawText: unknown): Promise<TtsAudio> {
    const text = String(rawText || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) throw new HttpError(400, 'text is required');
    if (text.length > TTS_MAX_CHARS) throw new HttpError(400, 'text is too long');
    if (!this.config.key) throw new HttpError(503, 'ELEVENLABS_API_KEY is not configured');

    const { voiceId, modelId } = this.config;
    const cacheKey = `${voiceId}:${modelId}:${text}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return { ...hit, cached: true };

    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: {
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.config.key,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.75,
              use_speaker_boost: true,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch (error) {
      throw new HttpError(
        502,
        `ElevenLabs TTS request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HttpError(502, `ElevenLabs TTS failed: ${detail.slice(0, 500)}`);
    }
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new HttpError(502, 'ElevenLabs returned empty audio');

    this.put(cacheKey, { buffer, contentType });
    return { buffer, contentType, cached: false };
  }

  private put(key: string, entry: { buffer: Buffer; contentType: string }): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, entry);
    while (this.cache.size > this.config.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
