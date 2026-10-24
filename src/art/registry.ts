// Сведения о текстурах для сцен: точка привязки и масштаб (текстуры рисуются в C px на клетку,
// мир — в 128 единицах на клетку).

export interface ArtMeta {
  ox: number;
  oy: number;
}

const meta = new Map<string, ArtMeta>();
let res = 1;

export function setArtRes(r: number): void {
  res = r;
}

/** Масштаб спрайта: единиц мира на пиксель текстуры. */
export function artScale(): number {
  return 1 / res;
}

export function baseKey(key: string): string {
  const i = key.indexOf('#');
  return i < 0 ? key : key.slice(0, i);
}

export function setArtMeta(key: string, m: ArtMeta): void {
  meta.set(baseKey(key), m);
}

export function artMeta(key: string): ArtMeta {
  return meta.get(baseKey(key)) ?? { ox: 0.5, oy: 0.5 };
}
