// Раскладка экрана серии (раздел 11.1): панель мира и панель вопроса, портрет и ландшафт,
// просветы 10–14 px, safe-area. Темы задают картинки и цвета через CSS-переменные.

import {
  chalkFrame,
  ctx2d,
  makeCanvas,
  makePen,
  mulberry32,
  strip,
  toothTile,
} from './pastelKit.ts';

export interface ThemeColors {
  paper: string;
  paperTooth: string;
  chalk: string;
  card: string;
  ink: string;
  caption: string;
  good: string;
  bad: string;
}

export interface Layout {
  root: HTMLElement;
  world: HTMLElement;
  canvasHost: HTMLElement;
  question: HTMLElement;
  overlay: HTMLElement;
  bubbles: HTMLElement;
  isLandscape(): boolean;
  onResize(cb: () => void): () => void;
  destroy(): void;
}

const LANDSCAPE_RATIO = 1.2;
/** Ширина панели мира (CSS px), ниже которой плашка снаряжения — одной строкой. */
const NARROW_WORLD = 520;

/** Картинки темы «мел»: зерно бумаги, меловая рамка, фактура табличек. */
export function chalkThemeImages(c: ThemeColors): Record<string, string> {
  const tooth = toothTile(mulberry32(5), 128, c.paper, c.paperTooth).toDataURL();
  const frame = chalkFrame(21, 84, 14, 2.6, c.chalk).toDataURL();
  const cardFrame = chalkFrame(33, 54, 9, 2.0, c.ink).toDataURL();
  // Фактура табличек: светлая пастель с лёгкой штриховкой.
  const card = makeCanvas(256, 128);
  const x = ctx2d(card);
  x.fillStyle = c.card;
  x.fillRect(0, 0, 256, 128);
  const pen = makePen(41, 0, 0);
  for (let i = 0; i < 70; i++) {
    const y = pen.rng() * 140 - 6;
    const x0 = pen.rng() * 256 - 40;
    strip(
      x,
      pen,
      x0,
      y,
      x0 + 50 + pen.rng() * 80,
      y - 14 - pen.rng() * 10,
      7,
      pen.rng() < 0.5 ? '#ffffff' : c.paperTooth,
      0.09,
    );
  }
  return {
    '--bf-tooth': `url(${tooth})`,
    '--bf-frame': `url(${frame})`,
    '--bf-card-frame': `url(${cardFrame})`,
    '--bf-card-tex': `url(${card.toDataURL()})`,
  };
}

export function createLayout(
  container: HTMLElement,
  colors: ThemeColors,
  images: Record<string, string>,
): Layout {
  const root = document.createElement('div');
  root.className = 'bf';
  root.setAttribute('data-theme', 'chalk');
  const vars: Record<string, string> = {
    '--bf-paper': colors.paper,
    '--bf-chalk': colors.chalk,
    '--bf-card': colors.card,
    '--bf-ink': colors.ink,
    '--bf-caption': colors.caption,
    '--bf-good': colors.good,
    '--bf-bad': colors.bad,
    ...images,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.innerHTML = `
    <div class="bf-stage">
      <section class="bf-panel bf-world">
        <div class="bf-canvas"></div>
        <div class="bf-bubbles"></div>
      </section>
      <section class="bf-panel bf-question" role="group"></section>
    </div>
    <div class="bf-overlay"></div>`;
  container.appendChild(root);
  const world = root.querySelector<HTMLElement>('.bf-world')!;
  const canvasHost = root.querySelector<HTMLElement>('.bf-canvas')!;
  const question = root.querySelector<HTMLElement>('.bf-question')!;
  const overlay = root.querySelector<HTMLElement>('.bf-overlay')!;
  const bubbles = root.querySelector<HTMLElement>('.bf-bubbles')!;
  if (matchMedia('(pointer: coarse)').matches) root.classList.add('is-touch');

  const listeners = new Set<() => void>();
  let landscape = false;
  const apply = () => {
    const r = root.getBoundingClientRect();
    const next = r.width / Math.max(1, r.height) >= LANDSCAPE_RATIO;
    if (next !== landscape) {
      landscape = next;
      root.classList.toggle('is-landscape', landscape);
    }
    // Узкая панель мира: плашки в ней собираются в одну строку.
    root.classList.toggle('is-narrow', world.getBoundingClientRect().width < NARROW_WORLD);
    for (const l of listeners) l();
  };
  const ro = new ResizeObserver(() => apply());
  ro.observe(root);
  ro.observe(canvasHost);
  apply();

  return {
    root,
    world,
    canvasHost,
    question,
    overlay,
    bubbles,
    isLandscape: () => landscape,
    onResize(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      ro.disconnect();
      listeners.clear();
      root.remove();
    },
  };
}
