// Звук игры: события раунда → эффекты, голоса костров, ночной эмбиент (раздел 10).
// Эмбиент: сверчки, редкий филин, шелест; к рассвету сверчки стихают, птицы набирают силу.
// Когда хоть один костёр на углях, эмбиент приглушается на 40%.

import { timing } from '../config/balance.ts';
import type { GameEvent } from '../core/events.ts';
import type { GameState } from '../core/state.ts';
import type { Mixer } from '../shared/audio/mixer.ts';
import { FIRE_PAN, FireVoices } from './fireVoices.ts';
import { jitter, playSfx, type Sfx } from './presets.ts';

const EMBER_DUCK = 0.4;

export class GameAudio {
  private readonly m: Mixer;
  private readonly fires: FireVoices;
  private cricketAcc = 0;
  private owlAt = 12;
  private birdAcc = 0;
  private t = 0;
  private lastHowl = -1e9;
  ambientOn = false;

  constructor(m: Mixer) {
    this.m = m;
    this.fires = new FireVoices(m);
  }

  play(name: Sfx, pan = 0, gain = 1): void {
    playSfx(this.m, name, { pan, pitch: jitter(), gain });
  }

  correct(): void {
    this.play('click');
  }

  wrong(): void {
    this.play('bonk');
  }

  onEvents(events: readonly GameEvent[], s: GameState): void {
    for (const e of events) {
      switch (e.type) {
        case 'STEP':
          this.play('step', (e.to & 1 ? 0.25 : -0.25));
          break;
        case 'PICKUP':
        case 'SWAP':
          this.play('clonk', 0);
          break;
        case 'FED':
          this.play('throw', FIRE_PAN[e.fire] * 0.6, 0.7);
          if (e.kind === 'birch') {
            this.play('flare', FIRE_PAN[e.fire]);
            if (e.relit) setTimeout(() => this.play('yelp', FIRE_PAN[e.fire] * 1.2), 260);
          } else this.play('thud', FIRE_PAN[e.fire]);
          break;
        case 'OAK_CAUGHT':
          this.play('roar', FIRE_PAN[e.fire]);
          break;
        case 'DENIED':
          this.play('deny');
          break;
        case 'FIRE_LOW':
          if (e.level === 1) this.play('growl', FIRE_PAN[e.fire] * 1.3, 0.8);
          else if (this.t - this.lastHowl > timing.howlCooldownMs / 1000) {
            this.lastHowl = this.t;
            this.play('howl', FIRE_PAN[e.fire] * 1.3);
          }
          break;
        case 'EMBERS':
          this.play('hiss', FIRE_PAN[e.fire]);
          setTimeout(() => this.play('crackle', FIRE_PAN[e.fire], 0.7), 500);
          break;
        case 'EMBER_COUNTDOWN':
          this.play('tick', FIRE_PAN[e.fire]);
          this.play('growl', FIRE_PAN[e.fire] * 1.3, 0.5 + (4 - e.n) * 0.25);
          break;
        case 'WIND_WARN':
          this.play('rustle', FIRE_PAN[e.side] * 1.3);
          break;
        case 'WIND_START':
          this.play('gust', FIRE_PAN[e.side] * 1.3);
          break;
        case 'DAWN_START':
          this.play('chirp', 0.4);
          break;
        case 'WOLF_IN':
          this.play('growl', FIRE_PAN[e.fire], 1.3);
          setTimeout(() => this.play('snatch', 0), 650);
          setTimeout(() => this.play('yelp', 0, 0.8), 300);
          break;
        case 'DAWN':
          setTimeout(() => this.play('rooster', 0.5), 150);
          setTimeout(() => this.play('jingle', 0), 1000);
          break;
        default:
          break;
      }
    }
    void s;
  }

  /** Раз в кадр: голоса костров, эмбиент, приглушение на углях. */
  tick(dtMs: number, s: GameState | null, playing: boolean): void {
    const dt = Math.min(0.25, dtMs / 1000);
    this.t += dt;
    if (!this.m.ready) return;
    if (s && playing) {
      this.fires.update(
        s.fires.map((f) => f.fuel),
        s.fires.map((f) => f.embers !== null),
        dt,
      );
      this.m.duck(s.fires.some((f) => f.embers !== null) ? EMBER_DUCK : 0);
    } else if (s) {
      this.fires.update(
        s.fires.map((f) => f.fuel),
        s.fires.map((f) => f.embers !== null),
        dt,
        0.6,
      );
    } else this.fires.silence();
    if (!this.ambientOn) return;
    const share = s ? Math.min(1, s.t / s.nightA) : 0.3;
    const dawn = Math.max(0, (share - 0.75) / 0.25);
    // Сверчки: короткие высокие трели, к рассвету стихают.
    this.cricketAcc += dt * (1.6 * (1 - dawn) + 0.1);
    while (this.cricketAcc >= 1) {
      this.cricketAcc -= 1;
      this.cricket(Math.random() * 1.6 - 0.8, 0.5 * (1 - dawn) + 0.1);
    }
    // Редкий филин ночью.
    if (this.t > this.owlAt && dawn < 0.2) {
      this.owlAt = this.t + 18 + Math.random() * 25;
      playSfx(this.m, 'owl', { pan: Math.random() * 1.6 - 0.8, pitch: jitter(), gain: 0.8 });
    }
    // Птицы к рассвету.
    if (dawn > 0) {
      this.birdAcc += dt * dawn * 1.4;
      while (this.birdAcc >= 1) {
        this.birdAcc -= 1;
        playSfx(this.m, 'chirp', { pan: Math.random() * 1.6 - 0.8, pitch: jitter(), gain: 0.6 + dawn * 0.4 });
      }
    }
  }

  private cricket(pan: number, level: number): void {
    const ctx = this.m.ctx;
    const out = this.m.out('ambient', pan);
    if (!ctx || !out) return;
    const t = ctx.currentTime + Math.random() * 0.2;
    const f = 4300 + Math.random() * 600;
    const pulses = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const tt = t + i * 0.032;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.05 * level, tt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.022);
      o.connect(g).connect(out);
      o.start(tt);
      o.stop(tt + 0.03);
    }
  }

  silenceFires(): void {
    this.fires.silence();
  }
}
