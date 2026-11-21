// Tiny synthesized sound effects (Web Audio). No audio files to download.

export class SoundFX {
  constructor(enabled = true) {
    this.enabled = Boolean(enabled);
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.enabled) this.unlock();
  }

  /** Call from a user gesture so the browser allows audio playback. */
  unlock() {
    if (this.enabled) this.ensure();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28; // effects sit clearly above the music
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  tone(freq, dur, { type = 'sine', gain = 0.5, to = null, delay = 0, attack = 0.006 } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(dur, { gain = 0.6, freq = 1400, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.6);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  play(name, data) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      switch (name) {
        case 'click':
          this.tone(720, 0.05, { type: 'triangle', gain: 0.22 });
          break;
        case 'drop':
        case 'land': {
          // Collision "thock": click transient + mid tone (audible on phone
          // speakers) + a little low body. 'land' (gravity/move) is softer.
          const g = name === 'land' ? 0.7 : 1;
          this.noise(0.045, { gain: 0.6 * g, freq: 3200 });
          this.tone(380, 0.09, { type: 'triangle', gain: 0.55 * g, to: 150 });
          this.tone(120, 0.08, { gain: 0.35 * g, to: 70 });
          break;
        }
        case 'error':
          this.tone(150, 0.1, { type: 'square', gain: 0.1, to: 110 });
          break;
        case 'merge':
        case 'chain': {
          const value = data?.merges?.[0]?.block?.value ?? 4;
          const exp = Math.min(Math.log2(value), 18);
          const base = 280 * 2 ** (exp / 9);
          const level = name === 'chain' ? Math.min(data?.chain ?? 2, 6) : 1;
          this.tone(base, 0.12, { type: 'triangle', gain: 0.4 });
          this.tone(base * 1.5, 0.16, { type: 'triangle', gain: 0.32, delay: 0.06 });
          if (name === 'chain') {
            this.tone(base * 2 * 2 ** ((level - 2) / 12), 0.2, { type: 'sine', gain: 0.3, delay: 0.12 });
          }
          break;
        }
        case 'bomb':
          this.noise(0.4, { gain: 0.9, freq: 1800 });
          this.tone(130, 0.35, { gain: 0.7, to: 38 });
          break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) =>
            this.tone(f, 0.28, { type: 'triangle', gain: 0.35, delay: i * 0.12 }),
          );
          this.tone(1568, 0.6, { type: 'sine', gain: 0.22, delay: 0.5 });
          break;
        case 'gameover':
          [440, 349, 262, 196].forEach((f, i) =>
            this.tone(f, 0.22, { type: 'triangle', gain: 0.32, delay: i * 0.16 }),
          );
          break;
        default:
          break;
      }
    } catch {
      /* audio is best effort */
    }
  }
}

/**
 * Background music: decoded once into an AudioBuffer and looped by Web Audio.
 * The whole file is looped as-is, including its natural silence at the start
 * and end, so there is a short pause between repeats. Shares the AudioContext
 * of SoundFX and is kept quieter than the sound effects.
 *
 * hold(true) stops the music (e.g. on the win screen); hold(false) restarts it
 * from the beginning.
 */
export class MusicPlayer {
  /**
   * targetRms: how loud the music plays on average (0..1). The track is
   * measured after decoding and its gain set to reach this level, so any song
   * – quiet or very loud – ends up equally soft behind the sound effects.
   */
  constructor(fx, url, { targetRms = 0.009, maxGain = 0.3 } = {}) {
    this.fx = fx;
    this.url = url;
    this.targetRms = targetRms;
    this.maxGain = maxGain;
    this.volume = 0.05; // replaced by the measured level once loaded
    this.held = false;
    this.buffer = null;
    this.loading = null;
    this.source = null;
    this.gain = null;
    this.starting = false;
  }

  /** Call from a user gesture: browsers block audio until the first tap. */
  unlock() {
    if (!this.held) this.start();
  }

  hold(on) {
    this.held = Boolean(on);
    if (this.held) this.stop();
    else this.start();
  }

  load(ctx) {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (!this.loading) {
      this.loading = fetch(this.url)
        .then((res) => {
          if (!res.ok) throw new Error(`music HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .then((buf) => {
          this.volume = musicGain(measureLoudness(buf).rms, this.targetRms, this.maxGain);
          this.buffer = buf;
          return buf;
        })
        .catch((err) => {
          this.loading = null;
          throw err;
        });
    }
    return this.loading;
  }

  async start() {
    if (this.source || this.starting) return;
    const ctx = this.fx.ensure();
    if (!ctx) return;
    this.starting = true;
    try {
      const buf = await this.load(ctx);
      if (this.held || this.source) return;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(this.volume, ctx.currentTime + 1.5);
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true; // whole buffer, silence included
      src.connect(gain);
      src.start();
      this.source = src;
      this.gain = gain;
    } catch (err) {
      console.warn("Music unavailable", err);
    } finally {
      this.starting = false;
    }
  }

  stop() {
    const src = this.source;
    const gain = this.gain;
    this.source = null;
    this.gain = null;
    if (!src) return;
    const ctx = this.fx.ctx;
    try {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      src.stop(t + 0.45);
    } catch {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}

/** Peak and RMS level (0..1) of a decoded buffer, all channels. */
export function measureLoudness(buf) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sum += v * v;
    }
    n += data.length;
  }
  return { peak, rms: n ? Math.sqrt(sum / n) : 0 };
}

/** Gain that brings a track with the given RMS to targetRms (capped). */
export function musicGain(rms, targetRms = 0.009, maxGain = 0.3) {
  if (!(rms > 0)) return Math.min(0.05, maxGain);
  return Math.min(maxGain, targetRms / rms);
}
