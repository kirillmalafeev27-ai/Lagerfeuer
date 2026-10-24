// Звуковой микшер серии (раздел 10): WebAudio без файлов. AudioContext создаётся только
// по первому жесту — до этого тишина и никаких ошибок в консоли.

export type Bus = 'sfx' | 'ambient';

export interface MixerSettings {
  sfx: number;
  ambient: number;
  muted: boolean;
}

export class Mixer {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private settings: MixerSettings;

  constructor(settings: MixerSettings) {
    this.settings = { ...settings };
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Вызывать из обработчика жеста (кнопка «Играть»). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 3;
        this.master.connect(comp).connect(ctx.destination);
        this.sfxBus = ctx.createGain();
        this.sfxBus.connect(this.master);
        this.duckGain = ctx.createGain();
        this.ambBus = ctx.createGain();
        this.ambBus.connect(this.duckGain).connect(this.master);
        this.apply();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  set(s: Partial<MixerSettings>): void {
    Object.assign(this.settings, s);
    this.apply();
  }

  private apply(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.ambBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.03);
    this.ambBus.gain.setTargetAtTime(this.settings.ambient * 0.8, t, 0.03);
  }

  /** Приглушить эмбиент (угли): ×(1 − amount). */
  duck(amount: number): void {
    if (!this.ctx || !this.duckGain) return;
    this.duckGain.gain.setTargetAtTime(1 - amount, this.ctx.currentTime, 0.4);
  }

  /** Узел выхода с панорамой: pan −1..1. */
  out(bus: Bus, pan = 0): AudioNode | null {
    if (!this.ctx) return null;
    const dest = bus === 'sfx' ? this.sfxBus : this.ambBus;
    if (!dest) return null;
    if (typeof this.ctx.createStereoPanner !== 'function') return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(dest);
    return p;
  }

  /** Белый шум 2 с — общий буфер. */
  noise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate * 2;
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (s / 0x7fffffff) * 2 - 1;
      }
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }

  close(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* уже закрыт */
    }
    this.ctx = null;
  }
}
