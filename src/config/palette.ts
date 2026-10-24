// Палитра (раздел 7.2). Цвета закреплены за смыслом:
// тёплые — только у огня, углей, искр, фонаря и шарфа героя; салатовый — только у глаз;
// белый с чёрными чёрточками — только у берёзы; голубой, сиреневый и малиновый — только у подсказок.

export const palette = {
  paper: '#15131c', // чёрная бумага: фон, просветы, тьма
  paperTooth: '#2b2734', // зерно бумаги
  chalk: '#f4eedd', // меловые контуры — самое светлое в рисунке
  card: '#f1ead6', // светлые пастельные таблички панели
  cardInk: '#1d1a24', // текст на табличках
  caption: '#ffe36e', // жёлтые подписи

  // ночь и рассвет
  sky: { night: '#1b1f45', high: '#2d2a63', star: '#e9e6ff', moon: '#fff3c4' },
  dawn: { violet: '#6b5aa8', pink: '#ff9fb2', peach: '#ffc49b', sun: '#ffe9a8' },
  forest: { trunk: '#3a3352', fir: '#2b4a4a', firLight: '#3f6b63', fern: '#4f6b3e' },
  ground: {
    base: '#6e5a45',
    light: '#93795a',
    dark: '#4a3b2d',
    needles: '#3d4f3a',
    root: '#5a4532',
  },
  stone: { base: '#7c8296', light: '#aab1c4', dark: '#4f5466' },

  // огонь — тёплые цвета только у огня, углей, искр и фонаря
  fire: { core: '#fff27a', mid: '#ffb02e', outer: '#ff5a1f', deep: '#d6262b' },
  ember: { hot: '#ff6b3d', dark: '#7a1d1d' },
  spark: '#ffd54a',
  glow: '#ff9a3c', // тёплый ореол — растёртая пастель
  smoke: '#8e8aa3',

  // дрова
  birch: { bark: '#f3f1ea', mark: '#26232c', inner: '#e8d9b5' },
  oak: { bark: '#5a3b24', light: '#7d5634', end: '#c58a4a', ring: '#8a5a2e' },

  // лагерь
  tent: { canvas: '#c9b37c', shade: '#97845a', patch: '#8c9a6a', lantern: '#ffd36b' }, // заплатки — шалфей: голубой занят подсказками
  sausage: '#a8674f',

  // герой — тот же искатель серии, по-ночному
  hero: {
    hat: '#f1e4c8',
    pompom: '#fffaf0',
    scarf: '#ff6a1a',
    jacket: '#1f8a8a',
    jacketDark: '#156565',
    pants: '#4a3a5e',
    boots: '#5a3a26',
    skin: '#f2c094',
  },

  // кислотно-салатовые глаза — только у волков; контровой свет — от углей
  wolf: { fur: '#5d6a86', furDark: '#3b4560', eyes: '#d8ff3e', rim: '#ff6b3d' },

  wind: '#e6f2ff',
  // подсказки — цвета, которых нет у огня
  hints: { calm: '#7fd3ff', soon: '#c58bff', late: '#ff3d8b', route: '#f4eedd' },
  good: '#3ddc84',
  bad: '#ff4d4d',
} as const;

/** '#rrggbb' → 0xrrggbb для Phaser. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

/** '#rrggbb' → [r, g, b] в 0..255. */
export function rgb(color: string): [number, number, number] {
  const n = hex(color);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '#rrggbb' + альфа → строка rgba() для Canvas 2D и CSS. */
export function rgba(color: string, alpha: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Смешивание двух цветов палитры (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
