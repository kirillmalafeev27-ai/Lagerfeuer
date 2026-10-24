# Костры до рассвета · Bis zum Morgengrauen

Ночь в лесу, четыре костра вокруг крошечной поляны и волки, которые боятся огня. Каждый верный
ответ на вопрос по немецкому — шаг героя или полено в костёр. Берёза вспыхивает сразу, дуб горит
вдвое дольше, но разгорается медленно. Продержись до рассвета.

Весь арт рисуется кодом при запуске — «масляная пастель на чёрной бумаге»; свет костров
«вытирает» тьму, а на рассвете картинка проявляется в цвете. Звуки синтезируются WebAudio.
Никаких внешних запросов: шрифты Rubik и Rubik Scribble подключены локально.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # проверка типов и сборка в dist/
npm run preview    # собранная версия
```

## Проверки

```bash
npm test           # правила (src/core) — Vitest
npm run lint
npm run sim -- --check --runs 2000   # симуляция ботами и цели баланса (раздел 14 плана)
npm run test:e2e   # ночь в браузере ботом-игроком: пауза, обучение, итоги, следующий уровень
npm run test:dark  # тест темноты: контрасты WCAG на двух размерах и двух качествах
```

`test:e2e` и `test:dark` используют установленный в системе Playwright с Chromium.
Скриншоты: `node tools/shots.mjs "level=3" shots/l3 390x844 1280x720`, ключевые моменты ночи:
`node tools/tour.mjs`, арт-лаборатория: `npm run dev` и `/lab.html?only=flames`.

## Управление

| Действие                    | Касание / мышь                       | Клавиатура      |
| --------------------------- | ------------------------------------ | --------------- |
| Ответить                    | табличка варианта                    | 1–4             |
| Шаг                         | клетка поляны                        | стрелка         |
| Подбросить, повторно — «×2» | костёр                               | Shift + стрелка |
| Берёза / дуб                | половина поленницы или переключатель | B / E           |
| К поленнице                 | поленница                            | H               |
| Стоять                      | герой или «Стоять»                   | Пробел          |
| Пауза                       | ❚❚                                   | P, Esc          |

В dev-сборке: `` ` `` — отладочная панель; параметры `?level=`, `?seed=`, `?speed=`,
`?quality=high|low`, `?dark=fallback`, `?scene=dark&fires=embers|full|mixed`.

## Встраивание

```ts
import { mountBonfires, LocalBankProvider } from './src/embed.ts';

const game = mountBonfires(container, {
  questions: new LocalBankProvider(bank), // или свой QuestionProvider
  onFinish: (r) => console.log(r.won, r.stars),
});
// game.destroy();
```

## Устройство

- `src/core` — чистые детерминированные правила (`reduce(state, action)`), боты, генератор уровней.
- `src/config` — все числа (`balance.ts`, `levels.ts`, `look.ts`) и все цвета (`palette.ts`).
- `src/shared/pastelKit.ts` — пастельный кит: мазки, штриховка, зерно бумаги, кисти света.
- `src/art` — рецепты текстур; `src/render` и `src/scenes` — Phaser 4; `src/ui` — DOM-интерфейс.
- `DECISIONS.md` — где и почему реализация отступает от плана.
