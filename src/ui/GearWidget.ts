// Плашка снаряжения (11.3): что в руках, переключатель «Birke | Eiche», полумесяц-прогресс
// ночи, кнопка «Стоять» и пауза. Лежит над лесом в верхнем углу, свободном от поленницы и палатки.

import { ru } from '../i18n/ru.ts';
import type { WoodKind } from '../core/wood.ts';
import { iconHands, iconLog, moonProgress } from './icons.ts';

export interface GearHandlers {
  onWood(kind: WoodKind): void;
  onStay(): void;
  onPause(): void;
}

export class GearWidget {
  readonly el: HTMLElement;
  private readonly hands: HTMLElement;
  private readonly handsImg: HTMLImageElement;
  private readonly handsLabel: HTMLElement;
  private readonly birchBtn: HTMLButtonElement;
  private readonly oakBtn: HTMLButtonElement;
  private readonly moon: HTMLImageElement;
  private last = '';

  constructor(parent: HTMLElement, h: GearHandlers) {
    const el = document.createElement('div');
    el.className = 'bf-gear at-right';
    el.innerHTML = `
      <div class="bf-gear-row">
        <img class="bf-moon" alt="" role="img">
        <div class="bf-hands" role="status"><img alt=""><span class="bf-sr"></span></div>
      </div>
      <div class="bf-toggle" role="group" aria-label="${ru.gear.woodLabel}">
        <button type="button" data-k="birch" aria-pressed="true">${ru.gear.birch}</button>
        <button type="button" data-k="oak" aria-pressed="false">${ru.gear.oak}</button>
      </div>
      <div class="bf-gear-row">
        <button type="button" class="bf-btn is-small" data-a="stay">${ru.gear.stay}</button>
        <button type="button" class="bf-btn is-small bf-iconbtn" data-a="pause" aria-label="${ru.gear.pause}">❚❚</button>
      </div>`;
    parent.appendChild(el);
    this.el = el;
    this.hands = el.querySelector('.bf-hands')!;
    this.handsImg = this.hands.querySelector('img')!;
    this.handsLabel = this.hands.querySelector('.bf-sr')!;
    this.birchBtn = el.querySelector('[data-k="birch"]')!;
    this.oakBtn = el.querySelector('[data-k="oak"]')!;
    this.moon = el.querySelector('.bf-moon')!;
    this.birchBtn.addEventListener('click', () => h.onWood('birch'));
    this.oakBtn.addEventListener('click', () => h.onWood('oak'));
    el.querySelector('[data-a="stay"]')!.addEventListener('click', () => h.onStay());
    el.querySelector('[data-a="pause"]')!.addEventListener('click', () => h.onPause());
  }

  /** Плашка — в свободном верхнем углу: там нет ни поленницы, ни палатки. */
  placeAt(left: boolean): void {
    this.el.classList.toggle('at-left', left);
    this.el.classList.toggle('at-right', !left);
  }

  update(
    kind: WoodKind | null,
    count: number,
    selected: WoodKind,
    hasOak: boolean,
    nightShare: number,
  ): void {
    const key = `${kind}|${count}|${selected}|${hasOak}|${Math.round(nightShare * 20)}`;
    if (key === this.last) return;
    this.last = key;
    this.handsImg.src = kind === null ? iconHands() : iconLog(kind, kind === 'birch' ? count : 1);
    this.handsLabel.textContent = `${ru.gear.hands}: ${ru.gear.handsLabel(kind, count)}`;
    this.birchBtn.setAttribute('aria-pressed', String(selected === 'birch'));
    this.oakBtn.setAttribute('aria-pressed', String(selected === 'oak'));
    this.oakBtn.disabled = !hasOak;
    this.moon.src = moonProgress(nightShare);
    this.moon.alt = `${ru.gear.night}: ${Math.round((1 - nightShare) * 100)}%`;
  }

  setVisible(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }
}
