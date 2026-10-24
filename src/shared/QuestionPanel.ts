// Панель вопроса серии (раздел 11.2): шапка «что сделает верный ответ», задание на светлой
// табличке, 2–4 варианта. Следующий вопрос загружается заранее; время ответа — от момента,
// когда вопрос стал активным, до клика.

import type { Question, QuestionProvider } from './questions/types.ts';

export interface QuestionPanelStrings {
  group: string;
  option: (i: number) => string;
}

export interface QuestionPanelOptions {
  host: HTMLElement;
  provider: QuestionProvider;
  strings: QuestionPanelStrings;
  /** Вызывается в момент клика по варианту. */
  onAnswer: (correct: boolean, timeMs: number, q: Question) => void;
  wrongMs: number;
  correctGlowMs: number;
  drawInMs: number;
  guardMs: number;
  /** Картинка «HOPPLA!» для ошибки. */
  hoppla?: () => string;
  promptMaxPx?: number;
  promptMinPx?: number;
}

export type PanelMode = 'intro' | 'active' | 'locked' | 'paused' | 'over';

export class QuestionPanel {
  private readonly o: QuestionPanelOptions;
  private readonly head: HTMLElement;
  private readonly headIcon: HTMLImageElement;
  private readonly headText: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly options: HTMLElement;
  private readonly hoppla: HTMLImageElement;
  private current: Question | null = null;
  private next: Promise<Question> | null = null;
  private activeAt = 0;
  private shownAt = 0;
  private pausedAt = 0;
  private busy = false;
  private mode: PanelMode = 'intro';
  private lockedByReady = false;
  private timers: number[] = [];

  constructor(o: QuestionPanelOptions) {
    this.o = o;
    const h = o.host;
    h.setAttribute('aria-label', o.strings.group);
    h.innerHTML = `
      <div class="bf-qhead"><img alt="" aria-hidden="true"><span class="bf-qhead-text" aria-live="polite"></span></div>
      <img class="bf-hoppla" alt="" aria-hidden="true">
      <div class="bf-card bf-prompt"><span></span></div>
      <div class="bf-options"></div>`;
    this.head = h.querySelector('.bf-qhead')!;
    this.headIcon = this.head.querySelector('img')!;
    this.headText = this.head.querySelector('.bf-qhead-text')!;
    this.prompt = h.querySelector('.bf-prompt')!;
    this.promptText = this.prompt.querySelector('span')!;
    this.options = h.querySelector('.bf-options')!;
    this.hoppla = h.querySelector('.bf-hoppla')!;
    if (o.hoppla) this.hoppla.src = o.hoppla();
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

  /** Загрузить первый вопрос и сразу же следующий. */
  async start(): Promise<void> {
    this.next = this.o.provider.next();
    await this.advance(false);
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
    if (prev !== 'active' && mode === 'active' && !this.lockedByReady) this.activate();
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
    if (correct) {
      buttons[i]?.classList.add('is-correct');
      this.later(this.o.correctGlowMs, () => void this.advance(true));
    } else {
      buttons[i]?.classList.add('is-wrong');
      buttons[q.correctIndex]?.classList.add('is-correct');
      this.hoppla.classList.add('is-on');
      this.later(this.o.wrongMs, () => {
        this.hoppla.classList.remove('is-on');
        void this.advance(true);
      });
    }
  }

  private later(ms: number, fn: () => void): void {
    const t = window.setTimeout(fn, ms);
    this.timers.push(t);
  }

  private async advance(animate: boolean): Promise<void> {
    const q = await (this.next ?? this.o.provider.next());
    this.next = this.o.provider.next();
    this.current = q;
    this.render(q);
    this.busy = false;
    this.shownAt = performance.now();
    this.activate();
    if (animate) {
      const h = this.o.host;
      h.classList.remove('is-drawing');
      void h.offsetWidth;
      h.classList.add('is-drawing');
      this.later(this.o.drawInMs + 20, () => h.classList.remove('is-drawing'));
    }
  }

  private render(q: Question): void {
    this.promptText.textContent = q.prompt;
    this.promptText.lang = q.promptLang;
    const n = q.options.length;
    this.options.className = `bf-options n${n}`;
    this.options.innerHTML = '';
    q.options.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bf-card bf-option';
      b.dataset.i = String(i);
      b.lang = q.optionsLang;
      b.setAttribute('aria-label', `${this.o.strings.option(i + 1)}: ${text}`);
      b.innerHTML = `<span class="bf-key" aria-hidden="true">${i + 1}</span><span></span>`;
      (b.lastChild as HTMLElement).textContent = text;
      this.options.appendChild(b);
    });
    this.applyLock();
    this.fitPrompt();
  }

  /** Если текст не помещается, шрифт ужимается с 24 до 16 px. */
  fitPrompt(): void {
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

  destroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.o.host.innerHTML = '';
  }
}
