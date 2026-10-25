// Панель вопроса серии (раздел 11.2): шапка «что сделает верный ответ», задание на светлой
// табличке, 2–4 варианта. Следующий вопрос загружается заранее; время ответа — от момента,
// когда вопрос стал активным, до клика.
//
// Задания генератора (формат Morskoy) приходят с инструкцией по-русски, немецким материалом и
// четырьмя вариантами, часто — целыми предложениями. Такие варианты стоят столбиком во всю
// ширину с текстом по левому краю: так четыре предложения, которые отличаются одной деталью,
// легко сравнить. Шрифт задания и вариантов подбирается вместе, пока всё не встанет в панель.

import type { Question, QuestionProvider } from './questions/types.ts';

/** Шрифт вариантов в заданиях генератора: с какого начинаем и ниже какого не ужимаем. */
const SHEET_FONT_MAX_PX = 20;
const SHEET_FONT_MIN_PX = 12;
/** С этого размера раскладка задания уплотняется, прежде чем ужимать шрифт дальше. */
const DENSE_FROM_PX = 14;

export interface QuestionPanelStrings {
  group: string;
  option: (i: number) => string;
  /** Кнопка повтора фразы в аудировании. */
  listen: string;
}

export interface QuestionPanelOptions {
  host: HTMLElement;
  provider: QuestionProvider;
  strings: QuestionPanelStrings;
  /** Вызывается в момент клика по варианту. */
  onAnswer: (correct: boolean, timeMs: number, q: Question) => void;
  wrongMs: number;
  /** То же для заданий генератора (с инструкцией): предложение нужно успеть прочитать. */
  wrongGeneratedMs: number;
  correctGlowMs: number;
  drawInMs: number;
  guardMs: number;
  /** Картинка «HOPPLA!» для ошибки. */
  hoppla?: () => string;
  promptMaxPx?: number;
  promptMinPx?: number;
}

/** Озвучка фразы аудирования (shared/questions/speech.ts). */
export interface PanelSpeaker {
  speak(text: string): void;
  stop(): void;
}

export type PanelMode = 'intro' | 'active' | 'locked' | 'paused' | 'over';

/**
 * Варианты-предложения — столбиком. Порог по числу слов: в банке нет вариантов длиннее двух
 * слов, поэтому его вопросы остаются в сетке, как в плане (11.2.4).
 */
export function isLongOptions(options: readonly string[]): boolean {
  return options.some((o) => {
    const words = o.trim().split(/\s+/).length;
    return words >= 4 || (words >= 3 && o.replace(/­/g, '').length > 24);
  });
}

/**
 * Строки задания: переносы из задания сохраняются, а мини-диалог «— Реплика? — Ответ.» в одну
 * строку тоже делится — каждая реплика с новой строки.
 */
export function promptLines(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) => {
      const t = line.trim();
      const dash = /^([—–-])\s/.exec(t)?.[1];
      return dash ? t.split(new RegExp(`\\s+(?=${dash}\\s)`)) : [t];
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

export class QuestionPanel {
  private readonly o: QuestionPanelOptions;
  private readonly head: HTMLElement;
  private readonly headIcon: HTMLImageElement;
  private readonly headText: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly instruction: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly listenBtn: HTMLButtonElement;
  private readonly options: HTMLElement;
  private readonly hoppla: HTMLImageElement;
  private current: Question | null = null;
  private next: Promise<Question> | null = null;
  /** Следующий вопрос уже загружен (для peekKind). */
  private nextQuestion: Question | null = null;
  /** Номер загрузки: ответ, пришедший после смены тем или нового старта, не показывается. */
  private token = 0;
  private activeAt = 0;
  private shownAt = 0;
  private pausedAt = 0;
  private busy = false;
  private mode: PanelMode = 'intro';
  private lockedByReady = false;
  private timers: number[] = [];
  private speaker: PanelSpeaker | null = null;
  private autoSpeak: () => boolean = () => true;
  /** Фраза текущего вопроса уже прозвучала сама. */
  private spoken = false;
  private destroyed = false;

  constructor(o: QuestionPanelOptions) {
    this.o = o;
    const h = o.host;
    h.setAttribute('aria-label', o.strings.group);
    h.innerHTML = `
      <div class="bf-qhead"><img alt="" aria-hidden="true"><span class="bf-qhead-text" aria-live="polite"></span></div>
      <img class="bf-hoppla" alt="" aria-hidden="true">
      <div class="bf-qsheet">
        <div class="bf-card bf-prompt">
          <div class="bf-instruction" lang="ru" hidden></div>
          <span class="bf-material"></span>
          <button type="button" class="bf-listen" hidden></button>
        </div>
        <div class="bf-options"></div>
      </div>`;
    this.head = h.querySelector('.bf-qhead')!;
    this.headIcon = this.head.querySelector('img')!;
    this.headText = this.head.querySelector('.bf-qhead-text')!;
    this.sheet = h.querySelector('.bf-qsheet')!;
    this.prompt = h.querySelector('.bf-prompt')!;
    this.instruction = h.querySelector('.bf-instruction')!;
    this.promptText = h.querySelector('.bf-material')!;
    this.listenBtn = h.querySelector('.bf-listen')!;
    this.listenBtn.textContent = `▶ ${o.strings.listen}`;
    this.listenBtn.addEventListener('click', () => this.say());
    this.options = h.querySelector('.bf-options')!;
    this.hoppla = h.querySelector('.bf-hoppla')!;
    if (o.hoppla) this.hoppla.src = o.hoppla();
    this.sheet.addEventListener('scroll', () => this.markScrollEnd(), { passive: true });
    this.options.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.bf-option');
      if (b) b.classList.add('is-pressed');
    });
    this.options.addEventListener('pointerup', () =>
      this.options.querySelectorAll('.is-pressed').forEach((b) => b.classList.remove('is-pressed')),
    );
    this.options.addEventListener('pointerleave', () =>
      this.options.querySelectorAll('.is-pressed').forEach((b) => b.classList.remove('is-pressed')),
    );
    this.options.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.bf-option');
      if (b) this.pick(Number(b.dataset.i));
    });
  }

  setHeader(icon: string, text: string, ready = false): void {
    if (this.headIcon.src !== icon) this.headIcon.src = icon;
    if (this.headText.textContent !== text) this.headText.textContent = text;
    this.head.classList.toggle('is-ready', ready);
  }

  /** Озвучка аудирования: фраза звучит сама, когда вопрос становится активным, если auto(). */
  setSpeaker(speaker: PanelSpeaker | null, auto: () => boolean): void {
    this.speaker?.stop();
    this.speaker = speaker;
    this.autoSpeak = auto;
  }

  /**
   * Показать первый вопрос раунда (уже загруженный заранее, если он есть) и сразу загрузить
   * следующий. Пока вопроса нет, на табличке — waitText. Промис — когда вопрос на экране.
   */
  async start(waitText = ''): Promise<void> {
    const token = ++this.token;
    this.current = null;
    this.busy = true;
    if (!this.next) this.preload();
    this.renderWaiting(waitText);
    await this.advance(false, token);
  }

  /** Источник сменил темы: заранее загруженный вопрос больше не годится. */
  reload(): void {
    this.token++;
    this.current = null;
    this.next = null;
    this.nextQuestion = null;
  }

  /** На экране вопрос, на который можно отвечать (иначе раунд ждёт, 12.4). */
  isReady(): boolean {
    return this.current !== null && !this.busy;
  }

  /**
   * Какой вопрос сейчас перед игроком или следующим на очереди: задание генератора (формат
   * Morskoy, с инструкцией) или вопрос банка. null — ещё не загружен. Темп раунда берётся по
   * этому виду (shared/pace.ts).
   */
  peekKind(): 'generated' | 'bank' | null {
    const q = this.current ?? this.nextQuestion;
    if (!q) return null;
    return q.instruction ? 'generated' : 'bank';
  }

  setMode(mode: PanelMode): void {
    const prev = this.mode;
    this.mode = mode;
    const h = this.o.host;
    h.classList.toggle('is-blurred', mode === 'paused');
    this.applyLock();
    if (mode === 'paused' && prev !== 'paused') this.pausedAt = performance.now();
    if (prev === 'paused' && mode !== 'paused' && this.pausedAt) {
      // Пауза не идёт в зачёт времени ответа.
      const d = performance.now() - this.pausedAt;
      this.activeAt += d;
      this.pausedAt = 0;
    }
    if (mode !== 'active') this.speaker?.stop();
    if (prev !== 'active' && mode === 'active' && !this.lockedByReady) this.activate();
    this.maybeSpeak();
  }

  /** Готовое действие: таблички бледнеют и неактивны (2.5.5). */
  setReadyLock(on: boolean): void {
    if (this.lockedByReady === on) return;
    this.lockedByReady = on;
    this.applyLock();
    if (!on && this.mode === 'active') this.activate();
  }

  private applyLock(): void {
    const locked = this.mode !== 'active' || this.lockedByReady;
    this.o.host.classList.toggle('is-locked', locked);
    this.options
      .querySelectorAll<HTMLButtonElement>('.bf-option')
      .forEach((b) => (b.disabled = locked));
    this.listenBtn.disabled = !this.current || this.mode === 'paused' || this.mode === 'over';
  }

  private activate(): void {
    this.activeAt = performance.now();
  }

  /** Номер верного варианта текущего вопроса (только для отладки и e2e). */
  debugCorrectIndex(): number | null {
    return this.current && !this.busy && this.mode === 'active' && !this.lockedByReady
      ? this.current.correctIndex
      : null;
  }

  /** Показать конкретный вопрос (только для e2e: раскладка заданий генератора). */
  debugShow(q: Question): void {
    this.current = q;
    this.busy = false;
    this.render(q);
  }

  /** Клавиши 1–4. */
  answerKey(i: number): void {
    const b = this.options.querySelector<HTMLButtonElement>(`.bf-option[data-i="${i}"]`);
    if (!b) return;
    b.classList.add('is-pressed');
    const t = window.setTimeout(() => b.classList.remove('is-pressed'), 90);
    this.timers.push(t);
    this.pick(i);
  }

  private pick(i: number): void {
    const q = this.current;
    if (!q || this.busy || this.mode !== 'active' || this.lockedByReady) return;
    const now = performance.now();
    if (now - this.shownAt < this.o.guardMs) return; // защита от двойного тапа
    if (i < 0 || i >= q.options.length) return;
    this.busy = true;
    const correct = i === q.correctIndex;
    const timeMs = Math.max(0, now - this.activeAt);
    const buttons = this.options.querySelectorAll<HTMLButtonElement>('.bf-option');
    this.o.provider.report({ id: q.id, correct, timeMs });
    this.o.onAnswer(correct, timeMs, q);
    const token = this.token;
    if (correct) {
      buttons[i]?.classList.add('is-correct');
      this.later(this.o.correctGlowMs, () => void this.advance(true, token));
    } else {
      buttons[i]?.classList.add('is-wrong');
      buttons[q.correctIndex]?.classList.add('is-correct');
      this.hoppla.classList.add('is-on');
      this.later(q.instruction ? this.o.wrongGeneratedMs : this.o.wrongMs, () => {
        this.hoppla.classList.remove('is-on');
        void this.advance(true, token);
      });
    }
  }

  private later(ms: number, fn: () => void): void {
    const t = window.setTimeout(fn, ms);
    this.timers.push(t);
  }

  private preload(): Promise<Question> {
    const p = this.o.provider.next();
    this.next = p;
    this.nextQuestion = null;
    void p.then((q) => {
      if (this.next === p) this.nextQuestion = q;
    });
    return p;
  }

  private async advance(animate: boolean, token: number): Promise<void> {
    const q = await (this.next ?? this.preload());
    if (token !== this.token || this.destroyed) return;
    this.preload();
    this.current = q;
    this.render(q);
    this.busy = false;
    this.shownAt = performance.now();
    this.activate();
    this.maybeSpeak();
    if (animate) {
      const h = this.o.host;
      h.classList.remove('is-drawing');
      void h.offsetWidth;
      h.classList.add('is-drawing');
      this.later(this.o.drawInMs + 20, () => h.classList.remove('is-drawing'));
    }
  }

  /** Фраза аудирования звучит один раз сама, как только вопрос стал активным. */
  private maybeSpeak(): void {
    const q = this.current;
    if (!q?.audioText || this.spoken || this.busy || this.mode !== 'active') return;
    if (!this.autoSpeak()) return;
    this.spoken = true;
    this.speaker?.speak(q.audioText);
  }

  /** Кнопка «Слушать»: повторить фразу. На паузе вопрос спрятан — и звука нет. */
  private say(): void {
    const q = this.current;
    if (!q?.audioText || this.mode === 'paused' || this.mode === 'over') return;
    this.spoken = true;
    this.speaker?.speak(q.audioText);
  }

  /** Табличка без вопроса: подпись, пока генерация готовит первый. */
  private renderWaiting(text: string): void {
    this.speaker?.stop();
    this.o.host.classList.remove('is-task');
    this.prompt.classList.add('is-waiting');
    this.instruction.hidden = true;
    this.listenBtn.hidden = true;
    this.promptText.hidden = false;
    this.promptText.textContent = text;
    this.promptText.lang = 'ru';
    this.options.className = 'bf-options';
    this.options.innerHTML = '';
    this.fitPrompt();
  }

  private render(q: Question): void {
    this.speaker?.stop();
    this.spoken = false;
    // Задания генератора — с инструкцией; их раскладка подбирается целиком (fitSheet).
    const task = !!q.instruction;
    const audio = !!q.audioText;
    const n = q.options.length;
    this.o.host.classList.toggle('is-task', task);
    this.prompt.classList.remove('is-waiting');
    this.sheet.classList.remove('is-scroll', 'is-dense', 'is-scroll-end');
    this.sheet.scrollTop = 0;
    this.instruction.textContent = q.instruction ?? '';
    this.instruction.hidden = !q.instruction;
    this.listenBtn.hidden = !audio;
    this.listenBtn.setAttribute(
      'aria-label',
      audio ? `${this.o.strings.listen}: ${q.prompt}` : this.o.strings.listen,
    );
    // Текст — только textContent: задания приходят от модели и не должны стать разметкой.
    const lines = task ? promptLines(q.prompt) : [q.prompt];
    this.promptText.classList.toggle('is-dialog', lines.length > 1);
    this.promptText.replaceChildren(
      ...lines.map((line) => {
        const s = document.createElement('span');
        s.className = 'bf-pline';
        s.textContent = line;
        return s;
      }),
    );
    this.promptText.lang = q.promptLang;
    this.promptText.hidden = audio;
    const layout = task ? (isLongOptions(q.options) ? ' is-column' : ' is-grid') : '';
    this.options.className = `bf-options n${n}${layout}`;
    this.options.innerHTML = '';
    q.options.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bf-card bf-option';
      b.dataset.i = String(i);
      b.lang = q.optionsLang;
      b.setAttribute('aria-label', `${this.o.strings.option(i + 1)}: ${text}`);
      b.innerHTML = `<span class="bf-key" aria-hidden="true">${i + 1}</span><span class="bf-text"></span>`;
      (b.lastChild as HTMLElement).textContent = text;
      this.options.appendChild(b);
    });
    this.applyLock();
    this.fitPrompt();
  }

  /** Подогнать шрифт под панель: задание банка — с 24 до 16 px, задание генератора — целиком. */
  fitPrompt(): void {
    if (this.o.host.classList.contains('is-task')) {
      this.fitSheet();
      return;
    }
    for (const t of this.optionTexts()) t.style.fontSize = '';
    this.instruction.style.fontSize = '';
    const max = this.o.promptMaxPx ?? 24;
    const min = this.o.promptMinPx ?? 16;
    const el = this.prompt;
    let size = max;
    this.promptText.style.fontSize = `${size}px`;
    while (
      size > min &&
      (el.scrollHeight > el.clientHeight + 1 || this.promptText.scrollWidth > el.clientWidth + 1)
    ) {
      size--;
      this.promptText.style.fontSize = `${size}px`;
    }
  }

  private optionTexts(): HTMLElement[] {
    return Array.from(this.options.querySelectorAll<HTMLElement>('.bf-text'));
  }

  /**
   * Задание генератора: один шаг шрифта на всё сразу (инструкция, материал, варианты), сверху
   * вниз, пока лист не перестанет переполняться. С DENSE_FROM_PX поля и межстрочные интервалы
   * становятся плотнее — сначала они, потом ещё меньший шрифт. Если не встало и на минимуме —
   * лист прокручивается: лучше прокрутка, чем обрезанное предложение.
   */
  private fitSheet(): void {
    const texts = this.optionTexts();
    const promptMax = this.o.promptMaxPx ?? 24;
    const apply = (s: number, dense: boolean) => {
      this.sheet.classList.toggle('is-dense', dense);
      this.promptText.style.fontSize = `${Math.min(promptMax, s + 2)}px`;
      this.instruction.style.fontSize = `${Math.max(11, Math.min(15, s - 4))}px`;
      for (const t of texts) t.style.fontSize = `${s}px`;
    };
    const over = (e: HTMLElement) =>
      e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1;
    const overflows = () =>
      over(this.sheet) || over(this.prompt) || over(this.options) || texts.some((t) => over(t));
    this.sheet.classList.remove('is-scroll');
    let s = SHEET_FONT_MAX_PX;
    let dense = false;
    apply(s, dense);
    while (overflows()) {
      if (!dense && s <= DENSE_FROM_PX) dense = true;
      else if (s > SHEET_FONT_MIN_PX) s--;
      else break;
      apply(s, dense);
    }
    if (overflows()) this.sheet.classList.add('is-scroll');
    this.markScrollEnd();
  }

  private markScrollEnd(): void {
    const s = this.sheet;
    s.classList.toggle('is-scroll-end', s.scrollTop + s.clientHeight >= s.scrollHeight - 2);
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.speaker?.stop();
    this.o.host.innerHTML = '';
  }
}
