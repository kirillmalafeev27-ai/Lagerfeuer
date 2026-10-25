# Деплой

С генерацией вопросов через ИИ «Костры» — уже не только статика: Node-сервер раздаёт собранную
игру из `dist/` и держит API вопросов (`/api/generate-questions` и остальные, см.
[`docs/GENERATION.md`](docs/GENERATION.md)). Устроено так же, как в Morskoy и «Льдинах», только
сервер — на встроенных модулях Node, без Express: образ не тянет `node_modules`.

```bash
npm ci
npm run build      # dist/ — игра, dist-server/index.js — сервер
npm start          # http://localhost:3000
```

## Northflank

### 1. Сервис

В проекте Northflank: **Create new service → Combined service**, подключить этот репозиторий и
ветку.

### 2. Сборка

| Поле            | Значение       |
| --------------- | -------------- |
| Build type      | **Dockerfile** |
| Dockerfile path | `/Dockerfile`  |
| Build context   | `/`            |

`Dockerfile` двухступенчатый: в первой ступени `npm ci` и `npm run build`, во вторую попадают
только `dist/`, `dist-server/` и `package.json`. Запуск — от непривилегированного пользователя
`node`, `HEALTHCHECK` — на `/healthz`.

Если в сервисе задана команда запуска `npm run start:northflank` (как у Morskoy), она тоже
работает — это тот же `node dist-server/index.js`.

### 3. Порт

**Ports & DNS → Add port:** `3000`, протокол `HTTP`, **Public** включён. Northflank сам `PORT` не
задаёт — в `Dockerfile` стоит `ENV PORT=3000`. Другой порт — задайте `PORT` в переменных и то же
число в Ports & DNS.

### 4. Health check

**Health checks:** тип `HTTP`, путь `/healthz`, порт `3000`. Эндпоинт отвечает `{"ok":true}` и не
зависит от ключей.

### 5. Переменные окружения

| Переменная            | По умолчанию                                          | Зачем                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AITUNNEL_API_KEY`    | —                                                     | ключ AI Tunnel для генерации. Без него `/api/generate-questions` по грамматике отвечает `503`, и игра берёт вопросы из встроенного банка (свои наборы слов работают и так) |
| `AITUNNEL_MODELS`     | `gpt-5.4,gpt-5.2,gpt-5,gpt-5-mini,gpt-4o,gpt-4o-mini` | модели через запятую; перебираются по порядку, пока одна не ответит                                                                                                        |
| `AI_BASE_URL`         | `https://api.aitunnel.ru/v1`                          | другой OpenAI-совместимый эндпоинт                                                                                                                                         |
| `OPENAI_API_KEY`      | —                                                     | используется, если `AITUNNEL_API_KEY` не задан (тогда по умолчанию `https://api.openai.com/v1`)                                                                            |
| `AI_TIMEOUT_MS`       | `120000`                                              | сколько ждать ответа одной модели                                                                                                                                          |
| `ELEVENLABS_API_KEY`  | —                                                     | озвучка фраз в аудировании; без неё `/api/tts` отвечает `503`, и браузер читает фразу своим голосом                                                                        |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM`                                | голос                                                                                                                                                                      |
| `ELEVENLABS_MODEL_ID` | `eleven_turbo_v2_5`                                   | модель синтеза                                                                                                                                                             |
| `TTS_CACHE_LIMIT`     | `180`                                                 | сколько озвученных фраз держать в памяти                                                                                                                                   |
| `PORT`                | `3000`                                                | порт сервера                                                                                                                                                               |

Ключи — только в переменных сервиса (secret). В репозиторий они не попадают: `.env*` в `.gitignore`.
Можно взять те же ключи, что у Morskoy и «Льдин».

### 6. Проверка после деплоя

```bash
curl https://<адрес-сервиса>/healthz
# {"ok":true}

curl https://<адрес-сервиса>/api/quiz/status
# {"ok":true,"generationConfigured":true,"ttsConfigured":false,"models":[...]}
```

`generationConfigured: false` — `AITUNNEL_API_KEY` не дошёл до контейнера: проверьте переменные
сервиса. В самой игре это видно в меню «Вопросы».

## Локальная разработка с генерацией

`npm run dev` и `npm run preview` поднимают тот же API через плагин в `vite.config.ts`. Ключ — в
переменной окружения или в `.env.local` (он не коммитится):

```bash
echo 'AITUNNEL_API_KEY=...' > .env.local
npm run dev        # http://localhost:5173 — меню → «Вопросы»
```

## Статическая раздача

Собранную `dist/` по-прежнему можно положить на любой статический хостинг — игра работает, но
API там нет, и вопросы берутся из встроенного банка.
