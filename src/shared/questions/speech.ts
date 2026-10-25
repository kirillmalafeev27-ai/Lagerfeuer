/**
 * Озвучка немецкой фразы для аудирования. Сначала сервер игры (/api/tts → ElevenLabs, как в
 * Morskoy); если озвучки там нет — голос браузера (speechSynthesis, de-DE).
 */
export interface Speaker {
  speak(text: string): void;
  stop(): void;
  destroy(): void;
}

export interface SpeakerOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Громкость 0…1 на момент воспроизведения. */
  volume?: () => number;
}

export function createSpeaker(opts: SpeakerOptions = {}): Speaker {
  const urls = new Map<string, string>();
  let server = true;
  let audio: HTMLAudioElement | null = null;
  let token = 0;
  const fetchImpl = opts.fetch ?? ((input, init) => window.fetch(input, init));
  const endpoint = () =>
    opts.baseUrl !== undefined
      ? `${opts.baseUrl}api/tts`
      : new URL('api/tts', document.baseURI).href;

  const browserSpeak = (text: string) => {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.95;
    u.volume = opts.volume?.() ?? 1;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('de'));
    if (voice) u.voice = voice;
    synth.speak(u);
  };

  const load = async (text: string): Promise<string> => {
    const hit = urls.get(text);
    if (hit) return hit;
    const res = await fetchImpl(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      // Ключа озвучки нет или API нет вообще — дальше сразу голос браузера.
      if ([404, 405, 501, 503].includes(res.status)) server = false;
      throw new Error(`HTTP ${res.status}`);
    }
    const url = URL.createObjectURL(await res.blob());
    urls.set(text, url);
    return url;
  };

  const stop = () => {
    token++;
    audio?.pause();
    audio = null;
    window.speechSynthesis?.cancel();
  };

  return {
    speak(text: string) {
      stop();
      const my = token;
      if (!server) return browserSpeak(text);
      load(text)
        .then((url) => {
          if (my !== token) return;
          audio = new Audio(url);
          audio.volume = Math.max(0, Math.min(1, opts.volume?.() ?? 1));
          return audio.play();
        })
        .catch(() => {
          if (my === token) browserSpeak(text);
        });
    },
    stop,
    destroy() {
      stop();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
