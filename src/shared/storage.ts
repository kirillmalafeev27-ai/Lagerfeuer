// Хранилище настроек и прогресса: по умолчанию localStorage, любые ошибки доступа глушатся.

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage с префиксом; если он недоступен — память. */
export function localKeyValue(prefix: string): KeyValueStorage {
  const mem = new Map<string, string>();
  return {
    get(key) {
      try {
        const v = window.localStorage.getItem(prefix + key);
        return v ?? mem.get(key) ?? null;
      } catch {
        return mem.get(key) ?? null;
      }
    },
    set(key, value) {
      mem.set(key, value);
      try {
        window.localStorage.setItem(prefix + key, value);
      } catch {
        /* приватный режим или запрет — живём в памяти */
      }
    },
  };
}

export function readJson<T>(s: KeyValueStorage, key: string, fallback: T): T {
  const raw = s.get(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function writeJson(s: KeyValueStorage, key: string, value: unknown): void {
  s.set(key, JSON.stringify(value));
}
