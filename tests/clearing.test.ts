import { describe, expect, it } from 'vitest';
import {
  CELLS,
  E,
  N,
  NE,
  NW,
  S,
  SE,
  SIDES,
  SW,
  W,
  cellFires,
  cellInDirection,
  fireCells,
  isFireAdjacent,
  nearFires,
  nearestFireCell,
  oppositeCorner,
  pathBetween,
  stepDist,
  stepToward,
  stepsToFire,
} from '../src/core/clearing.ts';

describe('поляна 2 × 2 (2.1)', () => {
  it('шаг — на соседнюю по стороне клетку, диагональ — два шага', () => {
    expect(stepDist(NW, NE)).toBe(1);
    expect(stepDist(NW, SW)).toBe(1);
    expect(stepDist(NW, SE)).toBe(2);
    expect(stepDist(NE, SW)).toBe(2);
    expect(stepDist(SE, SE)).toBe(0);
  });

  it('каждая клетка граничит с двумя кострами', () => {
    expect(cellFires(NW).sort()).toEqual([N, W].sort());
    expect(cellFires(NE).sort()).toEqual([N, E].sort());
    expect(cellFires(SW).sort()).toEqual([W, S].sort());
    expect(cellFires(SE).sort()).toEqual([E, S].sort());
    for (const side of SIDES) {
      for (const c of fireCells(side)) expect(isFireAdjacent(c, side)).toBe(true);
    }
  });

  it('до любого костра не больше одного шага, ближайшая клетка единственна', () => {
    for (const c of CELLS) {
      for (const side of SIDES) {
        expect(stepsToFire(c, side)).toBeLessThanOrEqual(1);
        expect(isFireAdjacent(nearestFireCell(c, side), side)).toBe(true);
      }
    }
    expect(nearestFireCell(SE, N)).toBe(NE);
    expect(nearestFireCell(NW, E)).toBe(NE);
    expect(nearestFireCell(NW, S)).toBe(SW);
  });

  it('ближние костры — у клетки поленницы, дальние — в одном шаге', () => {
    expect(nearFires(NW).sort()).toEqual([N, W].sort());
    expect(stepsToFire(NW, E)).toBe(1);
    expect(stepsToFire(NW, S)).toBe(1);
  });

  it('палатка — в противоположном углу', () => {
    expect(oppositeCorner(NW)).toBe(SE);
    expect(oppositeCorner(NE)).toBe(SW);
  });

  it('диагональный путь идёт через указанную клетку, если она по пути', () => {
    expect(stepToward(NE, SW, NW)).toBe(NW);
    expect(stepToward(NE, SW, SE)).toBe(SE);
    expect(pathBetween(NE, SW, NW)).toEqual([NW, SW]);
    expect(pathBetween(NW, NW)).toEqual([]);
  });

  it('стрелки ведут к соседней клетке в своей стороне', () => {
    expect(cellInDirection(NW, E)).toBe(NE);
    expect(cellInDirection(NW, S)).toBe(SW);
    expect(cellInDirection(NW, N)).toBe(NW);
  });
});
