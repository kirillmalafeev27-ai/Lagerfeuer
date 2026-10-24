// Пресеты звуков игры (раздел 10.3): всё синтезируется. Повторяющиеся звуки звучат
// с разбросом высоты ±5%, панорама — по координате x источника.

import type { Mixer } from '../shared/audio/mixer.ts';

export type Sfx =
  | 'step'
  | 'clonk'
  | 'throw'
  | 'flare'
  | 'thud'
  | 'roar'
  | 'hiss'
  | 'crackle'
  | 'growl'
  | 'howl'
  | 'yelp'
  | 'gust'
  | 'rustle'
  | 'tick'
  | 'bonk'
  | 'click'
  | 'deny'
  | 'clap'
  | 'rooster'
  | 'jingle'
  | 'tally'
  | 'chirp'
  | 'owl'
  | 'snatch';

export interface PlayOpts {
  pan?: number;
  /** Множитель высоты (уже с разбросом). */
  pitch?: number;
  gain?: number;
}

type Ctx = AudioContext;

function env(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noiseSrc(ctx: Ctx, m: Mixer, t: number, dur: number): AudioBufferSourceNode | null {
  const buf = m.noise();
  if (!buf) return null;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return s;
}

function tone(ctx: Ctx, type: OscillatorType, f: number, t: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function filt(ctx: Ctx, type: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** Шумовой всплеск через фильтр. */
function burst(
  ctx: Ctx,
  m: Mixer,
  out: AudioNode,
  t: number,
  type: BiquadFilterType,
  f: number,
  q: number,
  a: number,
  d: number,
  peak: number,
): void {
  const n = noiseSrc(ctx, m, t, a + d);
  if (!n) return;
  const g = ctx.createGain();
  env(g, t, a, peak, d);
  n.connect(filt(ctx, type, f, q))
    .connect(g)
    .connect(out);
}

/** Щелчки потрескивания. */
function clicks(
  ctx: Ctx,
  m: Mixer,
  out: AudioNode,
  t: number,
  count: number,
  spread: number,
  peak: number,
): void {
  for (let i = 0; i < count; i++) {
    const tt = t + Math.random() * spread;
    burst(
      ctx,
      m,
      out,
      tt,
      'bandpass',
      1800 + Math.random() * 3000,
      2.5,
      0.001,
      0.02 + Math.random() * 0.03,
      peak * (0.4 + Math.random() * 0.6),
    );
  }
}

export function playSfx(m: Mixer, name: Sfx, o: PlayOpts = {}): void {
  const ctx = m.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const out = m.out('sfx', o.pan ?? 0);
  if (!out) return;
  const t = ctx.currentTime + 0.005;
  const p = o.pitch ?? 1;
  const G = o.gain ?? 1;
  switch (name) {
    case 'step': {
      burst(ctx, m, out, t, 'lowpass', 700 * p, 0.7, 0.004, 0.07, 0.35 * G);
      const th = tone(ctx, 'sine', 95 * p, t, 0.08);
      const g = ctx.createGain();
      env(g, t, 0.005, 0.25 * G, 0.07);
      th.connect(g).connect(out);
      break;
    }
    case 'clonk': {
      for (const [f, d, v] of [
        [520, 0.12, 0.35],
        [790, 0.08, 0.22],
        [330, 0.1, 0.2],
      ] as const) {
        const o1 = tone(ctx, 'triangle', f * p, t, d);
        const g = ctx.createGain();
        env(g, t, 0.002, v * G, d);
        o1.connect(g).connect(out);
      }
      const t2 = t + 0.07;
      const o2 = tone(ctx, 'triangle', 600 * p, t2, 0.08);
      const g2 = ctx.createGain();
      env(g2, t2, 0.002, 0.2 * G, 0.08);
      o2.connect(g2).connect(out);
      break;
    }
    case 'throw': {
      const n = noiseSrc(ctx, m, t, 0.25);
      if (!n) break;
      const f = filt(ctx, 'bandpass', 400, 1.4);
      f.frequency.setValueAtTime(400 * p, t);
      f.frequency.exponentialRampToValueAtTime(1700 * p, t + 0.2);
      const g = ctx.createGain();
      env(g, t, 0.06, 0.25 * G, 0.18);
      n.connect(f).connect(g).connect(out);
      break;
    }
    case 'flare': {
      burst(ctx, m, out, t, 'bandpass', 900 * p, 0.8, 0.015, 0.45, 0.55 * G);
      burst(ctx, m, out, t, 'lowpass', 300 * p, 0.7, 0.03, 0.5, 0.35 * G);
      clicks(ctx, m, out, t + 0.05, 9, 0.5, 0.35 * G);
      break;
    }
    case 'thud': {
      const o1 = tone(ctx, 'sine', 80 * p, t, 0.3);
      o1.frequency.exponentialRampToValueAtTime(42 * p, t + 0.25);
      const g = ctx.createGain();
      env(g, t, 0.004, 0.6 * G, 0.28);
      o1.connect(g).connect(out);
      burst(ctx, m, out, t, 'lowpass', 400 * p, 0.7, 0.003, 0.15, 0.3 * G);
      break;
    }
    case 'roar': {
      const n = noiseSrc(ctx, m, t, 1.0);
      if (!n) break;
      const f = filt(ctx, 'lowpass', 160, 0.8);
      f.frequency.setValueAtTime(160 * p, t);
      f.frequency.linearRampToValueAtTime(900 * p, t + 0.35);
      f.frequency.linearRampToValueAtTime(300 * p, t + 0.9);
      const g = ctx.createGain();
      env(g, t, 0.25, 0.6 * G, 0.65);
      n.connect(f).connect(g).connect(out);
      clicks(ctx, m, out, t + 0.2, 6, 0.6, 0.3 * G);
      break;
    }
    case 'hiss': {
      burst(ctx, m, out, t, 'highpass', 3200 * p, 0.6, 0.02, 0.9, 0.4 * G);
      burst(ctx, m, out, t, 'bandpass', 6000 * p, 1, 0.05, 0.6, 0.18 * G);
      break;
    }
    case 'crackle': {
      clicks(ctx, m, out, t, 4, 0.4, 0.25 * G);
      break;
    }
    case 'growl': {
      const o1 = tone(ctx, 'sawtooth', 78 * p, t, 1.0);
      o1.frequency.linearRampToValueAtTime(64 * p, t + 0.9);
      const lp = filt(ctx, 'lowpass', 420, 1.2);
      const trem = ctx.createGain();
      const lfo = tone(ctx, 'sine', 17, t, 1.0);
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.45;
      lfo.connect(lfoG).connect(trem.gain);
      trem.gain.value = 0.55;
      const g = ctx.createGain();
      env(g, t, 0.12, 0.5 * G, 0.85);
      o1.connect(lp).connect(trem).connect(g).connect(out);
      burst(ctx, m, out, t, 'bandpass', 300 * p, 1.5, 0.1, 0.8, 0.12 * G);
      break;
    }
    case 'howl': {
      const o1 = tone(ctx, 'triangle', 300 * p, t, 1.8);
      o1.frequency.linearRampToValueAtTime(520 * p, t + 0.5);
      o1.frequency.linearRampToValueAtTime(470 * p, t + 1.2);
      o1.frequency.linearRampToValueAtTime(330 * p, t + 1.75);
      const vib = tone(ctx, 'sine', 5.5, t, 1.8);
      const vg = ctx.createGain();
      vg.gain.value = 9;
      vib.connect(vg).connect(o1.frequency);
      const bp = filt(ctx, 'bandpass', 900, 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32 * G, t + 0.35);
      g.gain.linearRampToValueAtTime(0.26 * G, t + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o1.connect(bp).connect(g).connect(out);
      break;
    }
    case 'yelp': {
      const o1 = tone(ctx, 'triangle', 900 * p, t, 0.3);
      o1.frequency.linearRampToValueAtTime(1450 * p, t + 0.08);
      o1.frequency.exponentialRampToValueAtTime(600 * p, t + 0.28);
      const g = ctx.createGain();
      env(g, t, 0.01, 0.3 * G, 0.26);
      o1.connect(filt(ctx, 'bandpass', 1100, 0.8))
        .connect(g)
        .connect(out);
      break;
    }
    case 'gust': {
      const n = noiseSrc(ctx, m, t, 1.4);
      if (!n) break;
      const f = filt(ctx, 'bandpass', 300, 0.9);
      f.frequency.setValueAtTime(300 * p, t);
      f.frequency.linearRampToValueAtTime(1300 * p, t + 0.45);
      f.frequency.linearRampToValueAtTime(400 * p, t + 1.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.55 * G, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
      n.connect(f).connect(g).connect(out);
      break;
    }
    case 'rustle': {
      const n = noiseSrc(ctx, m, t, 1.6);
      if (!n) break;
      const f = filt(ctx, 'bandpass', 2200 * p, 0.7);
      const am = ctx.createGain();
      const lfo = tone(ctx, 'sine', 7, t, 1.6);
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      am.gain.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3 * G, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
      n.connect(f).connect(am).connect(g).connect(out);
      break;
    }
    case 'tick': {
      const o1 = tone(ctx, 'sine', 1650 * p, t, 0.04);
      const g = ctx.createGain();
      env(g, t, 0.001, 0.3 * G, 0.035);
      o1.connect(g).connect(out);
      break;
    }
    case 'bonk': {
      const o1 = tone(ctx, 'sine', 240 * p, t, 0.22);
      o1.frequency.exponentialRampToValueAtTime(140 * p, t + 0.18);
      const g = ctx.createGain();
      env(g, t, 0.015, 0.35 * G, 0.2);
      o1.connect(g).connect(out);
      break;
    }
    case 'click': {
      for (const [f, v] of [
        [1250, 0.22],
        [1880, 0.12],
      ] as const) {
        const o1 = tone(ctx, 'triangle', f * p, t, 0.05);
        const g = ctx.createGain();
        env(g, t, 0.001, v * G, 0.045);
        o1.connect(g).connect(out);
      }
      break;
    }
    case 'deny': {
      const o1 = tone(ctx, 'square', 110 * p, t, 0.14);
      const g = ctx.createGain();
      env(g, t, 0.004, 0.18 * G, 0.12);
      o1.connect(filt(ctx, 'lowpass', 500, 0.8))
        .connect(g)
        .connect(out);
      burst(ctx, m, out, t, 'lowpass', 350, 0.7, 0.003, 0.1, 0.2 * G);
      break;
    }
    case 'clap': {
      for (const dt of [0, 0.13])
        burst(ctx, m, out, t + dt, 'bandpass', 1300 * p, 1.1, 0.002, 0.06, 0.6 * G);
      break;
    }
    case 'rooster': {
      const sylls: Array<[number, number, number]> = [
        [620, 0.11, 0.0],
        [720, 0.11, 0.14],
        [680, 0.11, 0.28],
        [930, 0.55, 0.42],
      ];
      for (const [f, d, off] of sylls) {
        const tt = t + off;
        const o1 = tone(ctx, 'sawtooth', f * p, tt, d);
        o1.frequency.linearRampToValueAtTime(f * p * (d > 0.3 ? 0.82 : 1.06), tt + d);
        const vib = tone(ctx, 'sine', 24, tt, d);
        const vg = ctx.createGain();
        vg.gain.value = f * 0.02;
        vib.connect(vg).connect(o1.frequency);
        const f1 = filt(ctx, 'bandpass', 1100, 2.5);
        const f2 = filt(ctx, 'bandpass', 2500, 3);
        const g = ctx.createGain();
        env(g, tt, 0.015, 0.22 * G, d);
        o1.connect(f1).connect(g).connect(out);
        o1.connect(f2).connect(g);
      }
      break;
    }
    case 'jingle': {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => {
        const tt = t + i * 0.11;
        const o1 = tone(ctx, 'triangle', f, tt, 0.45);
        const g = ctx.createGain();
        env(g, tt, 0.005, 0.2 * G, 0.42);
        o1.connect(g).connect(out);
      });
      break;
    }
    case 'tally': {
      const o1 = tone(ctx, 'triangle', 480 * p, t, 0.07);
      const g = ctx.createGain();
      env(g, t, 0.002, 0.28 * G, 0.065);
      o1.connect(g).connect(out);
      break;
    }
    case 'chirp': {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + Math.random() * 0.05);
        const f0 = (2600 + Math.random() * 1400) * p;
        const o1 = tone(ctx, 'sine', f0, tt, 0.09);
        o1.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), tt + 0.06);
        const g = ctx.createGain();
        env(g, tt, 0.005, 0.12 * G, 0.07);
        o1.connect(g).connect(out);
      }
      break;
    }
    case 'owl': {
      for (const off of [0, 0.45]) {
        const tt = t + off;
        const o1 = tone(ctx, 'sine', 390 * p, tt, 0.35);
        o1.frequency.linearRampToValueAtTime(350 * p, tt + 0.3);
        const g = ctx.createGain();
        env(g, tt, 0.06, 0.16 * G, 0.28);
        o1.connect(g).connect(out);
      }
      break;
    }
    case 'snatch': {
      burst(ctx, m, out, t, 'bandpass', 1500 * p, 1, 0.005, 0.12, 0.4 * G);
      const o1 = tone(ctx, 'triangle', 300 * p, t, 0.15);
      o1.frequency.exponentialRampToValueAtTime(700 * p, t + 0.1);
      const g = ctx.createGain();
      env(g, t, 0.005, 0.22 * G, 0.12);
      o1.connect(g).connect(out);
      break;
    }
  }
}

/** Разброс высоты ±5% для повторяющихся звуков (10.6). */
export function jitter(base = 1): number {
  return base * (0.95 + Math.random() * 0.1);
}
