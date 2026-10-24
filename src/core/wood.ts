// Дрова (раздел 2.2): размеры, вместимость рук, единая проверка fits().

import { balance } from '../config/balance.ts';
import type { Fire } from './state.ts';

export type WoodKind = 'birch' | 'oak';

export const EPS = 1e-9;

export function woodSize(kind: WoodKind): number {
  return kind === 'birch' ? balance.birchSize : balance.oakSize;
}

export function carryMax(kind: WoodKind): number {
  return kind === 'birch' ? balance.birchCarry : balance.oakCarry;
}

/** Свободные места: 3 минус топливо минус разгорающийся дуб. */
export function freeSlots(fire: Fire): number {
  return balance.fireSlots - fire.fuel - (fire.catching !== null ? balance.oakSize : 0);
}

export type FitResult = 'ok' | 'noFit' | 'oakOnEmbers';

/** Влезет ли полено. Единая функция для ввода, подсказок и ботов (13.3.6). */
export function fitCheck(fire: Fire, kind: WoodKind): FitResult {
  if (kind === 'oak' && fire.embers !== null) return 'oakOnEmbers';
  return freeSlots(fire) + EPS >= woodSize(kind) ? 'ok' : 'noFit';
}

export function fits(fire: Fire, kind: WoodKind): boolean {
  return fitCheck(fire, kind) === 'ok';
}
