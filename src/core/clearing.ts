// Поляна 2 × 2 (раздел 2.1): клетки, костры по сторонам, поленница и палатка в углах.

/** Стороны и костры: север, восток, юг, запад. */
export type Side = 0 | 1 | 2 | 3;
/** Клетки: СЗ, СВ, ЮЗ, ЮВ. Углы снаружи поляны нумеруются так же. */
export type Cell = 0 | 1 | 2 | 3;

export const N = 0 as const;
export const E = 1 as const;
export const S = 2 as const;
export const W = 3 as const;

export const NW = 0 as const;
export const NE = 1 as const;
export const SW = 2 as const;
export const SE = 3 as const;

export const SIDES: readonly Side[] = [N, E, S, W];
export const CELLS: readonly Cell[] = [NW, NE, SW, SE];

export const SIDE_NAMES = ['N', 'E', 'S', 'W'] as const;
export const CELL_NAMES = ['NW', 'NE', 'SW', 'SE'] as const;

export function cellCol(c: Cell): number {
  return c & 1;
}

export function cellRow(c: Cell): number {
  return c >> 1;
}

export function cellAt(col: number, row: number): Cell {
  return (row * 2 + col) as Cell;
}

/** Соседние по стороне клетки. */
export function cellNeighbors(c: Cell): [Cell, Cell] {
  return [cellAt(1 - cellCol(c), cellRow(c)), cellAt(cellCol(c), 1 - cellRow(c))];
}

/** Число шагов между клетками (диагональ — два шага). */
export function stepDist(a: Cell, b: Cell): number {
  return Math.abs(cellCol(a) - cellCol(b)) + Math.abs(cellRow(a) - cellRow(b));
}

/** Две клетки, которые граничат с костром. */
export function fireCells(side: Side): [Cell, Cell] {
  switch (side) {
    case N:
      return [NW, NE];
    case S:
      return [SW, SE];
    case W:
      return [NW, SW];
    case E:
      return [NE, SE];
  }
}

/** Два костра, с которыми граничит клетка: по строке (С/Ю) и по столбцу (З/В). */
export function cellFires(c: Cell): [Side, Side] {
  return [cellRow(c) === 0 ? N : S, cellCol(c) === 0 ? W : E];
}

export function isFireAdjacent(c: Cell, side: Side): boolean {
  const [a, b] = cellFires(c);
  return a === side || b === side;
}

/** Ближайшая к клетке клетка у костра (всегда единственная, не дальше одного шага). */
export function nearestFireCell(from: Cell, side: Side): Cell {
  const [a, b] = fireCells(side);
  return stepDist(from, a) <= stepDist(from, b) ? a : b;
}

/** Шагов от клетки до любой клетки у костра. */
export function stepsToFire(from: Cell, side: Side): number {
  return stepDist(from, nearestFireCell(from, side));
}

/**
 * Следующая клетка на кратчайшем пути. При диагонали из двух путей выбирается тот,
 * что идёт через `via` (например, поленницу), иначе — сначала по горизонтали.
 */
export function stepToward(from: Cell, to: Cell, via?: Cell): Cell {
  if (from === to) return from;
  if (stepDist(from, to) === 1) return to;
  const horiz = cellAt(cellCol(to), cellRow(from));
  const vert = cellAt(cellCol(from), cellRow(to));
  if (via !== undefined && via === vert) return vert;
  return horiz;
}

/** Противоположный угол: палатка стоит напротив поленницы. */
export function oppositeCorner(c: Cell): Cell {
  return (3 - c) as Cell;
}

/** Ближние костры — те, с которыми граничит клетка поленницы. */
export function nearFires(pile: Cell): [Side, Side] {
  return cellFires(pile);
}

export function isNearFire(pile: Cell, side: Side): boolean {
  return isFireAdjacent(pile, side);
}

/** Клетка поляны со стороны (для стрелок клавиатуры): сосед по направлению или та же клетка. */
export function cellInDirection(c: Cell, side: Side): Cell {
  const col = cellCol(c);
  const row = cellRow(c);
  switch (side) {
    case N:
      return cellAt(col, 0);
    case S:
      return cellAt(col, 1);
    case W:
      return cellAt(0, row);
    case E:
      return cellAt(1, row);
  }
}

/** Полный путь (без стартовой клетки) от клетки к клетке через `via`, если он по пути. */
export function pathBetween(from: Cell, to: Cell, via?: Cell): Cell[] {
  const path: Cell[] = [];
  let cur = from;
  let guard = 0;
  while (cur !== to && guard++ < 4) {
    cur = stepToward(cur, to, via);
    path.push(cur);
  }
  return path;
}
