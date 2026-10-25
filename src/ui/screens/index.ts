// Экраны (раздел 11.5): DOM поверх живой сцены.

import { type LevelConfig, type LevelId, levels } from '../../config/levels.ts';
import { ru } from '../../i18n/ru.ts';
import { tipsRu } from '../../i18n/tips.ru.ts';
import type { AiStatus } from '../../shared/questions/AiQuestionProvider.ts';
import {
  CEFR_LEVELS,
  type CefrLevel,
  GRAMMAR_GROUPS,
  LEXICAL_TOPICS,
  MAX_GRAMMAR_TOPICS,
  type QuizConfig,
  VOCAB_TOPICS,
  isVocabTopic,
} from '../../shared/questions/topics.ts';
import { iconLog, iconStar } from '../icons.ts';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `bf-btn ${cls}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function screen(cls = 'is-dim'): HTMLElement {
  return el('div', `bf-screen ${cls}`);
}

export function loadingScreen(): { root: HTMLElement; progress(p: number): void } {
  const root = screen('is-dim bf-loading');
  const sheet = el('div', 'bf-sheet');
  sheet.appendChild(el('div', 'bf-lades', ru.loading));
  const tip = el('p', 'bf-tip', tipsRu[Math.floor(Math.random() * tipsRu.length)]);
  sheet.appendChild(tip);
  const bar = el('div', 'bf-progress');
  const fill = el('i');
  bar.appendChild(fill);
  sheet.appendChild(bar);
  root.appendChild(sheet);
  return { root, progress: (p) => (fill.style.width = `${Math.round(p * 100)}%`) };
}

/**
 * Меню. quiz — если источник вопросов умеет выбирать темы (ИИ-генерация): тогда под «Играть»
 * подпись с выбранными темами, а «Вопросы» и «Настройки» стоят в один ряд.
 */
export function menuScreen(h: {
  onPlay(): void;
  onSettings(): void;
  quiz?: { summary: string; onOpen(): void };
}): HTMLElement {
  const root = screen('is-clear');
  const box = el('div', 'bf-menu');
  const title = el('h1', 'bf-title', ru.title);
  const sub = el('p', 'bf-subtitle', ru.subtitle);
  sub.lang = 'de';
  box.append(title, sub);
  const play = button(ru.menu.play, 'is-primary', h.onPlay);
  box.appendChild(play);
  if (h.quiz) {
    const line = el('p', 'bf-quiz-summary', h.quiz.summary);
    line.lang = 'de';
    box.appendChild(line);
    const row = el('div', 'bf-menu-row');
    row.append(button(ru.menu.quiz, '', h.quiz.onOpen), button(ru.menu.settings, '', h.onSettings));
    box.appendChild(row);
  } else box.appendChild(button(ru.menu.settings, '', h.onSettings));
  box.appendChild(el('p', 'bf-hint', ru.menu.hint));
  root.appendChild(box);
  setTimeout(() => play.focus(), 50);
  return root;
}

/**
 * Выбор тем вопросов — шаги меню Morskoy в одной карточке: уровень, лексическая тема, темы
 * (до пяти, они чередуются: свои наборы слов и грамматика), слот Wortstellung и аудирование.
 */
export function quizScreen(
  initial: QuizConfig | null,
  status: Promise<AiStatus>,
  h: { onDone(config: QuizConfig): void; onBank(): void; onCancel(): void },
): HTMLElement {
  const t = ru.quiz;
  const cur: QuizConfig = initial
    ? { ...initial, grammarTopics: [...initial.grammarTopics] }
    : { level: 'A2', lexicalTopic: null, grammarTopics: [], wortstellung: false, listening: false };
  const root = screen('is-dim bf-quiz-screen');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t.title);
  const sheet = el('div', 'bf-sheet bf-quiz');
  sheet.append(el('h2', 'bf-h2', t.title), el('p', 'bf-quiz-intro', t.intro));
  const note = el('p', 'bf-note bf-quiz-status', t.checking);
  note.setAttribute('role', 'status');
  sheet.appendChild(note);
  void status.then((st) => {
    note.textContent = !st.available ? t.noServer : !st.generationConfigured ? t.noKey : '';
  });

  /** Группа кнопок-радио. */
  const radio = <T extends string | null>(
    label: string,
    options: Array<[T, string]>,
    value: () => T,
    set: (v: T) => void,
  ): HTMLElement => {
    const group = el('div', 'bf-tags');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    const buttons = options.map(([v, text]) => {
      const b = el('button', 'bf-tag', text);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        set(v);
        sync();
      });
      group.appendChild(b);
      return { b, v };
    });
    const sync = () => {
      for (const { b, v } of buttons) {
        const on = v === value();
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
    sync();
    return group;
  };

  const levelGroup = radio<CefrLevel>(
    t.level,
    CEFR_LEVELS.map((l): [CefrLevel, string] => [l, `${l} · ${t.levels[l]}`]),
    () => cur.level,
    (v) => (cur.level = v),
  );
  const lexicalGroup = radio<string | null>(
    t.lexical,
    [[null, t.lexicalAny], ...LEXICAL_TOPICS.map((x): [string, string] => [x, x])],
    () => cur.lexicalTopic,
    (v) => (cur.lexicalTopic = v),
  );
  lexicalGroup.lang = 'de';
  sheet.append(el('h3', 'bf-quiz-title', t.level), levelGroup);
  sheet.append(el('h3', 'bf-quiz-title', t.lexical), lexicalGroup);

  // Темы: свои наборы слов и грамматика, вместе не больше MAX_GRAMMAR_TOPICS.
  const topicsTitle = el('h3', 'bf-quiz-title');
  sheet.appendChild(topicsTitle);
  const topicButtons: Array<{ b: HTMLButtonElement; topic: string }> = [];
  const group = (title: string, topics: readonly string[], groupNote?: string) => {
    const box = el('div', 'bf-quiz-group');
    box.appendChild(el('div', 'bf-quiz-group-title', title));
    const tags = el('div', 'bf-tags');
    tags.lang = 'de';
    for (const topic of topics) {
      const b = el('button', 'bf-tag', topic);
      b.type = 'button';
      b.addEventListener('click', () => {
        const i = cur.grammarTopics.indexOf(topic);
        if (i >= 0) cur.grammarTopics.splice(i, 1);
        else if (cur.grammarTopics.length < MAX_GRAMMAR_TOPICS) cur.grammarTopics.push(topic);
        syncTopics();
      });
      tags.appendChild(b);
      topicButtons.push({ b, topic });
    }
    box.appendChild(tags);
    if (groupNote) box.appendChild(el('p', 'bf-note', groupNote));
    sheet.appendChild(box);
  };
  group(t.groups.vocab, VOCAB_TOPICS, t.vocabNote);
  for (const g of GRAMMAR_GROUPS) group(t.groups[g.id] ?? g.id, g.topics);

  const check = (label: string, value: () => boolean, set: (v: boolean) => void) => {
    const row = el('label', 'bf-quiz-check');
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      set(input.checked);
      syncTopics();
    });
    const text = el('span', '', label);
    const hint = el('span', 'bf-note');
    text.append(el('br'), hint);
    row.append(input, text);
    sheet.appendChild(row);
    return { input, hint, sync: () => (input.checked = value()) };
  };
  const word = check(
    t.wortstellung,
    () => cur.wortstellung,
    (v) => (cur.wortstellung = v),
  );
  const listen = check(
    t.listening,
    () => cur.listening,
    (v) => (cur.listening = v),
  );
  listen.hint.textContent = t.listeningHint;

  const need = el('p', 'bf-note bf-quiz-need');
  sheet.appendChild(need);
  const done = button(t.done, 'is-primary', () =>
    h.onDone({ ...cur, grammarTopics: [...cur.grammarTopics] }),
  );
  const row = el('div', 'bf-row');
  row.append(done, button(t.bank, '', h.onBank), button(t.cancel, 'is-small', h.onCancel));
  sheet.appendChild(row);

  const syncTopics = () => {
    const n = cur.grammarTopics.length;
    topicsTitle.textContent = t.topics(n, MAX_GRAMMAR_TOPICS);
    for (const { b, topic } of topicButtons) {
      const on = cur.grammarTopics.includes(topic);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !on && n >= MAX_GRAMMAR_TOPICS;
    }
    // Порядок слов — на материале первой грамматической темы: у наборов слов его нет.
    const firstGrammar = cur.grammarTopics.find((topic) => !isVocabTopic(topic)) ?? null;
    if (!firstGrammar) cur.wortstellung = false;
    word.input.disabled = !firstGrammar;
    word.hint.textContent = t.wortstellungHint(firstGrammar);
    word.sync();
    listen.sync();
    const ok = n > 0 || cur.listening;
    done.disabled = !ok;
    need.textContent = ok ? '' : t.needTopic;
  };
  syncTopics();

  root.appendChild(sheet);
  setTimeout(() => (levelGroup.querySelector<HTMLElement>('.is-on') ?? done).focus(), 50);
  return root;
}

function traits(l: LevelConfig): string {
  const t = ru.levels.traits;
  const parts: string[] = [l.oak ? t.oak : t.noOak, l.wind ? t.wind : t.noWind];
  parts.push(
    l.hints === 'all'
      ? t.hintsAll
      : l.hints === 'targetRing'
        ? t.hintsTarget
        : l.hints === 'oak'
          ? t.hintsOak
          : t.hintsNone,
  );
  return parts.join(' · ');
}

export function starsHtml(n: number): string {
  return [0, 1, 2].map((i) => `<span class="${i < n ? '' : 'off'}">★</span>`).join('');
}

export function levelsScreen(h: {
  unlocked: (id: LevelId) => boolean;
  best: (id: LevelId) => number;
  onPick(id: LevelId): void;
  onBack(): void;
}): HTMLElement {
  const root = screen('is-dim');
  const sheet = el('div', 'bf-sheet bf-levels-sheet');
  sheet.appendChild(el('h2', 'bf-h2', ru.levels.title));
  const grid = el('div', 'bf-levels');
  let first: HTMLButtonElement | null = null;
  for (const l of levels) {
    const id = String(l.id);
    const b = el('button', 'bf-level');
    b.type = 'button';
    const open = h.unlocked(l.id);
    b.disabled = !open;
    b.title = open ? ru.levels.name(id) : ru.levels.locked;
    b.innerHTML = `<span class="bf-level-num">${ru.levels.short(id)}</span><span class="bf-level-name"></span><span class="bf-stars">${starsHtml(h.best(l.id))}</span><span class="bf-traits"></span>`;
    (b.querySelector('.bf-level-name') as HTMLElement).textContent = ru.levels.name(id);
    (b.querySelector('.bf-traits') as HTMLElement).textContent = traits(l);
    b.setAttribute(
      'aria-label',
      `${ru.levels.name(id)}. ${open ? `${ru.levels.best}: ${h.best(l.id)} ★` : ru.levels.locked}`,
    );
    b.addEventListener('click', () => h.onPick(l.id));
    grid.appendChild(b);
    if (open) first = b;
  }
  sheet.appendChild(grid);
  const row = el('div', 'bf-row');
  row.appendChild(button(ru.levels.back, '', h.onBack));
  sheet.appendChild(row);
  root.appendChild(sheet);
  setTimeout(() => first?.focus(), 50);
  return root;
}

/** Интро ночи; note — помощь после неудач («Сухой мох: угли тлеют дольше»). */
export function introScreen(onSkip: () => void, note?: string): HTMLElement {
  const root = screen('is-clear bf-intro');
  root.append(el('div', 'bf-line', ru.intro.line1), el('div', 'bf-line', ru.intro.line2));
  if (note) root.appendChild(el('div', 'bf-caption bf-assist-note', note));
  root.addEventListener('pointerdown', onSkip);
  return root;
}

export function pauseScreen(h: {
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
  onSettings(): void;
}): HTMLElement {
  const root = screen('is-dim');
  const sheet = el('div', 'bf-sheet');
  sheet.appendChild(el('h2', 'bf-h2', ru.pause.title));
  const row = el('div', 'bf-row');
  const resume = button(ru.pause.resume, 'is-primary', h.onResume);
  row.append(
    resume,
    button(ru.pause.restart, '', h.onRestart),
    button(ru.pause.settings, '', h.onSettings),
    button(ru.pause.menu, '', h.onMenu),
  );
  sheet.appendChild(row);
  root.appendChild(sheet);
  setTimeout(() => resume.focus(), 50);
  return root;
}

export interface ResultsData {
  won: boolean;
  stars: number;
  shot: string | null;
  birch: number;
  oak: number;
  embers: number;
  correct: number;
  wrong: number;
  medianSec: number;
  gusts: number;
  record: number;
  newRecord: boolean;
  cause: { near: boolean; gust: boolean } | null;
  hasNext: boolean;
  /** Во сколько раз дольше будут тлеть угли в следующий раз, если помощь только что заработана. */
  assistNext: number;
  staggerMs: number;
  tallyMs: number;
  onTally?: (i: number) => void;
}

export function resultsScreen(
  d: ResultsData,
  h: { onAgain(): void; onNext(): void; onMenu(): void },
): HTMLElement {
  const r = ru.results;
  const root = screen('is-dim');
  root.style.flexDirection = 'column';
  root.style.gap = '12px';
  root.style.overflow = 'auto';
  const head = el('h2', 'bf-h2', d.won ? r.won : r.lost);
  head.style.margin = '0';
  root.appendChild(head);
  const cards = el('div', 'bf-results');
  // 1. Снимок кадра.
  const c1 = el('div', 'bf-rcard');
  if (d.shot) {
    const img = el('img', 'bf-shot');
    img.src = d.shot;
    img.alt = r.frame(d.won);
    c1.appendChild(img);
  }
  c1.appendChild(el('div', '', r.frame(d.won)));
  // 2. Поленья по одному летят в итоги.
  const c2 = el('div', 'bf-rcard');
  c2.appendChild(el('div', '', r.fed));
  const tally = el('div', 'bf-tally');
  c2.appendChild(tally);
  const counts = el('div', '');
  counts.textContent = `${r.birch(d.birch)} · ${r.oak(d.oak)}`;
  c2.appendChild(counts);
  c2.appendChild(el('p', '', r.embers(d.embers)));
  // 3. Звёзды и статистика.
  const c3 = el('div', 'bf-rcard');
  const stars = el('div', 'bf-bigstars');
  stars.setAttribute('aria-label', `${r.starsTitle}: ${d.stars}`);
  stars.innerHTML = [0, 1, 2]
    .map((i) => `<img src="${iconStar(i < d.stars)}" alt="" style="height:46px">`)
    .join('');
  c3.appendChild(stars);
  const lines: Array<[string, string]> = [];
  if (d.stars >= 1) lines.push(['★', r.star1]);
  if (d.stars >= 2) lines.push(['★★', r.star2]);
  if (d.stars >= 3) lines.push(['★★★', r.star3]);
  lines.push(
    [r.correct, String(d.correct)],
    [r.wrong, String(d.wrong)],
    [r.median, r.sec(d.medianSec)],
    [r.gusts, String(d.gusts)],
    [r.record, '★'.repeat(d.record) || '—'],
  );
  if (d.cause) lines.push([r.cause, r.causeText(d.cause.near, d.cause.gust)]);
  for (const [a, b] of lines) {
    const row = el('div', 'bf-stat');
    row.append(el('span', '', a), el('b', '', b));
    c3.appendChild(row);
  }
  if (d.newRecord) c3.appendChild(el('p', 'bf-caption', r.newRecord));
  if (d.assistNext)
    c3.appendChild(el('p', 'bf-caption bf-assist-next', ru.assist.next(d.assistNext)));
  [c1, c2, c3].forEach((c, i) => (c.style.animationDelay = `${i * d.staggerMs}ms`));
  cards.append(c1, c2, c3);
  root.appendChild(cards);
  const row = el('div', 'bf-row');
  const again = button(r.again, 'is-primary', h.onAgain);
  row.appendChild(again);
  if (d.hasNext) row.appendChild(button(r.next, '', h.onNext));
  row.appendChild(button(r.menu, '', h.onMenu));
  root.appendChild(row);
  // Подсчёт: поленья по одному летят в итоги, стук с растущей высотой.
  const logs: Array<'birch' | 'oak'> = [];
  for (let i = 0; i < d.birch; i++) logs.push('birch');
  for (let i = 0; i < d.oak; i++) logs.push('oak');
  let i = 0;
  const start = d.staggerMs + 200;
  const tick = () => {
    if (i >= logs.length || !root.isConnected) return;
    const img = el('img');
    img.src = iconLog(logs[i]);
    img.alt = '';
    tally.appendChild(img);
    d.onTally?.(i);
    i++;
    setTimeout(tick, d.tallyMs);
  };
  setTimeout(tick, start);
  setTimeout(() => again.focus(), 60);
  return root;
}

export interface SettingsData {
  sfx: number;
  ambient: number;
  muted: boolean;
  reducedMotion: boolean;
  quality: 'high' | 'low';
  autoLow: boolean;
  hints: boolean;
  words: 'de' | 'ru';
  /** Помощь после неудач подряд: угли тлеют дольше (balance.assist). */
  assist: boolean;
}

export function settingsScreen(
  d: SettingsData,
  onChange: (d: SettingsData) => void,
  onClose: () => void,
): HTMLElement {
  const s = ru.settings;
  const root = screen('is-dim');
  const sheet = el('div', 'bf-sheet bf-settings');
  sheet.appendChild(el('h2', 'bf-h2', s.title));
  const v = { ...d };
  const row = (label: string, input: HTMLElement) => {
    const l = el('label');
    l.append(el('span', '', label), input);
    sheet.appendChild(l);
  };
  const range = (val: number, set: (x: number) => void) => {
    const i = el('input');
    i.type = 'range';
    i.min = '0';
    i.max = '1';
    i.step = '0.05';
    i.value = String(val);
    i.addEventListener('input', () => {
      set(Number(i.value));
      onChange({ ...v });
    });
    return i;
  };
  const check = (val: boolean, set: (x: boolean) => void) => {
    const i = el('input');
    i.type = 'checkbox';
    i.checked = val;
    i.addEventListener('change', () => {
      set(i.checked);
      onChange({ ...v });
    });
    return i;
  };
  const select = (opts: Array<[string, string]>, val: string, set: (x: string) => void) => {
    const sel = el('select');
    for (const [k, t] of opts) {
      const o = el('option', '', t);
      o.value = k;
      sel.appendChild(o);
    }
    sel.value = val;
    sel.addEventListener('change', () => {
      set(sel.value);
      onChange({ ...v });
    });
    return sel;
  };
  row(
    s.sound,
    check(!v.muted, (x) => (v.muted = !x)),
  );
  row(
    s.sfx,
    range(v.sfx, (x) => (v.sfx = x)),
  );
  row(
    s.ambient,
    range(v.ambient, (x) => (v.ambient = x)),
  );
  row(
    s.reducedMotion,
    check(v.reducedMotion, (x) => (v.reducedMotion = x)),
  );
  row(
    s.quality,
    select(
      [
        ['high', s.qualityHigh],
        ['low', s.qualityLow],
      ],
      v.quality,
      (x) => (v.quality = x as 'high' | 'low'),
    ),
  );
  if (v.autoLow) sheet.appendChild(el('p', 'bf-note', s.qualityAuto));
  row(
    s.hints,
    select(
      [
        ['on', s.hintsOn],
        ['off', s.hintsOff],
      ],
      v.hints ? 'on' : 'off',
      (x) => (v.hints = x === 'on'),
    ),
  );
  row(
    s.assist,
    check(v.assist, (x) => (v.assist = x)),
  );
  row(
    s.words,
    select(
      [
        ['de', s.wordsDe],
        ['ru', s.wordsRu],
      ],
      v.words,
      (x) => (v.words = x as 'de' | 'ru'),
    ),
  );
  const r = el('div', 'bf-row');
  const close = button(s.close, 'is-primary', onClose);
  r.appendChild(close);
  sheet.appendChild(r);
  root.appendChild(sheet);
  setTimeout(() => close.focus(), 50);
  return root;
}

/** Пузырь героя с подсказкой обучения. */
export function bubble(
  text: string,
  at: { x: number; y: number },
  onOk: () => void,
  ok: string,
): HTMLElement {
  const b = el('div', 'bf-bubble');
  b.setAttribute('role', 'dialog');
  b.appendChild(el('div', '', text));
  const btn = button(ok, 'is-small is-primary', onOk);
  b.appendChild(btn);
  b.style.left = `${Math.max(8, at.x - 140)}px`;
  b.style.top = `${Math.max(8, at.y - 110)}px`;
  setTimeout(() => btn.focus(), 30);
  return b;
}
