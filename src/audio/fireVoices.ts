// Голоса костров (10.2): у каждого костра свой непрерывный треск — громкость и частота щелчков
// зависят от топлива, панорама — от положения костра. На слух понятно, какой костёр слабеет.

import type { Mixer } from '../shared/audio/mixer.ts';

interface Voice {
  roar: GainNode;
  pan: number;
  acc: number;
}

/** Панорама костров: С, В, Ю, З. */
export const FIRE_PAN = [0, 0.7, 0, -0.7] as const;

export class FireVoices {
  private readonly m: Mixer;
  private voices: Voice[] = [];

  constructor(m: Mixer) {
    this.m = m;
  }

  private ensure(): boolean {
    const ctx = this.m.ctx;
    if (!ctx || ctx.state !== 'running') return false;
    if (this.voices.length) return true;
    const buf = this.m.noise();
    if (!buf) return false;
    for (let i = 0; i < 4; i++) {
      const out = this.m.out('sfx', FIRE_PAN[i]);
      if (!out) return false;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = i * 0.37;
      src.loopEnd = 2;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340 + i * 23;
      const roar = ctx.createGain();
      roar.gain.value = 0;
      src.connect(lp).connect(roar).connect(out);
      src.start(ctx.currentTime + 0.01, i * 0.4);
      this.voices.push({ roar, pan: FIRE_PAN[i], acc: 0 });
    }
    return true;
  }

  /** fuels — топливо костров; embers — на углях ли; dt — секунды с прошлого вызова. */
  update(fuels: readonly number[], embers: readonly boolean[], dt: number, level = 1): void {
    if (!this.ensure()) return;
    const ctx = this.m.ctx!;
    const t = ctx.currentTime;
    const buf = this.m.noise();
    this.voices.forEach((v, i) => {
      const fuel = fuels[i] ?? 0;
      const target = embers[i] ? 0.012 : Math.min(0.11, 0.02 + fuel * 0.03) * level;
      v.roar.gain.setTargetAtTime(target, t, 0.25);
      // Щелчки: чаще и громче у сильного костра; у углей — редкие и тихие.
      const rate = embers[i] ? 1.2 : 0.8 + fuel * 2.6;
      v.acc += rate * dt;
      while (v.acc >= 1 && buf) {
        v.acc -= 1;
        const tt = t + Math.random() * Math.max(0.05, dt);
        const out = this.m.out('sfx', v.pan);
        if (!out) break;
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = (embers[i] ? 1200 : 1800) + Math.random() * 2600;
        f.Q.value = 2.2;
        const g = ctx.createGain();
        const peak = (embers[i] ? 0.06 : 0.05 + fuel * 0.05) * level * (0.5 + Math.random() * 0.5);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.linearRampToValueAtTime(peak, tt + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.02 + Math.random() * 0.04);
        s.connect(f).connect(g).connect(out);
        s.start(tt, Math.random() * 1.8);
        s.stop(tt + 0.08);
      }
    });
  }

  silence(): void {
    const ctx = this.m.ctx;
    if (!ctx) return;
    for (const v of this.voices) v.roar.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }
}
