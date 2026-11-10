// Stadionatmosphäre, im Browser erzeugt (keine Audiodateien).
// Stimmengewirr, rhythmische Gesänge während des Spiels und Stadtgeräusche draussen.

export class Atmosphere {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.mode = 'before';
    this.inside = 0;
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const noise = this.noiseBuffer(ctx);
    const src = () => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start(0, Math.random() * 2);
      return s;
    };
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Stimmengewirr
    const crowd = src();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.7;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.15;
    crowd.connect(bp).connect(this.crowdGain).connect(this.master);
    // langsames An- und Abschwellen
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(this.crowdGain.gain);
    lfo.start();

    // Gesänge: rhythmisch pulsierendes Rauschen
    const chant = src();
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 820;
    bp2.Q.value = 1.4;
    this.chantGain = ctx.createGain();
    this.chantGain.gain.value = 0;
    this.pulse = ctx.createGain();
    this.pulse.gain.value = 0;
    chant.connect(bp2).connect(this.pulse).connect(this.chantGain).connect(this.master);
    this.schedulePulses();

    // Stadt draussen
    const city = src();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    this.cityGain = ctx.createGain();
    this.cityGain.gain.value = 0.2;
    city.connect(lp).connect(this.cityGain).connect(this.master);

    // Torjubel und Raunen: eigenes Rauschen mit beweglichem Filter (siehe cheer)
    const roar = src();
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'bandpass';
    this.roarFilter.frequency.value = 700;
    this.roarFilter.Q.value = 0.6;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    roar.connect(this.roarFilter).connect(this.roarGain).connect(this.master);

    // Stadionlautsprecher: schmales Frequenzband und Echo über eine Rückkopplung
    this.paIn = ctx.createGain();
    const paBand = ctx.createBiquadFilter();
    paBand.type = 'bandpass';
    paBand.frequency.value = 1100;
    paBand.Q.value = 0.7;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.paGain = ctx.createGain();
    this.paGain.gain.value = 0.4;
    this.paIn.connect(paBand);
    paBand.connect(this.paGain);
    paBand.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.paGain);
    this.paGain.connect(this.master);

    this.apply();
  }

  // Stadiondurchsage vor dem Spiel: Gong aus drei Tönen, danach eine Lautsprecherstimme.
  // Die Stimme ist bewusst nicht verständlich (nur Klang und Silbenrhythmus) – der Text steht als Hinweis im Bild.
  announce() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    [659.3, 523.3, 392.0].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      const s = t0 + i * 0.42;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.5, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, s + 1.3);
      o.connect(g).connect(this.paIn);
      o.start(s);
      o.stop(s + 1.4);
    });
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 0;
    voice.connect(f1).connect(vg);
    voice.connect(f2).connect(vg);
    vg.connect(this.paIn);
    let s = t0 + 1.7;
    const end = s + 5.2;
    voice.frequency.setValueAtTime(118, s);
    f1.frequency.setValueAtTime(600, s);
    f2.frequency.setValueAtTime(1500, s);
    while (s < end) {
      const len = 0.11 + Math.random() * 0.14;
      voice.frequency.setTargetAtTime(104 + Math.random() * 38, s, 0.03);
      f1.frequency.setTargetAtTime(400 + Math.random() * 500, s, 0.03);
      f2.frequency.setTargetAtTime(1100 + Math.random() * 1100, s, 0.03);
      vg.gain.setTargetAtTime(0.26, s, 0.015);
      vg.gain.setTargetAtTime(0, s + len, 0.03);
      s += len + (Math.random() < 0.18 ? 0.32 : 0.05);
    }
    voice.start(t0 + 1.6);
    voice.stop(end + 0.6);
  }

  // Reaktion des Publikums auf eine Spielszene: 'goal' (Torjubel) oder 'chance' (Raunen)
  cheer(kind) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const g = this.roarGain.gain;
    const f = this.roarFilter.frequency;
    const level = 0.35 + 0.65 * this.inside;
    g.cancelScheduledValues(t);
    f.cancelScheduledValues(t);
    if (kind === 'goal') {
      f.setValueAtTime(520, t);
      f.linearRampToValueAtTime(1250, t + 0.7);
      f.setTargetAtTime(800, t + 2.5, 2);
      g.setTargetAtTime(0.95 * level, t, 0.18);
      g.setTargetAtTime(0.5 * level, t + 2.4, 1.2);
      g.setTargetAtTime(0, t + 5, 1.6);
    } else {
      f.setValueAtTime(900, t);
      f.exponentialRampToValueAtTime(420, t + 1.6);
      g.setTargetAtTime(0.5 * level, t, 0.12);
      g.setTargetAtTime(0, t + 0.9, 0.6);
    }
  }

  noiseBuffer(ctx) {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // rosa Rauschen (Näherung)
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    }
    return buf;
  }

  // «Al-ba-ni-a!»-artiger Rhythmus: drei kurze Stösse, ein langer
  schedulePulses() {
    const ctx = this.ctx;
    const pattern = [0, 0.28, 0.56, 1.0];
    const lengths = [0.16, 0.16, 0.16, 0.42];
    let t0 = ctx.currentTime + 0.2;
    const step = () => {
      if (!this.ctx) return;
      while (t0 < ctx.currentTime + 4) {
        pattern.forEach((p, i) => {
          const s = t0 + p;
          this.pulse.gain.setTargetAtTime(1, s, 0.02);
          this.pulse.gain.setTargetAtTime(0.15, s + lengths[i], 0.05);
        });
        t0 += 2.0;
      }
      this.timer = setTimeout(step, 1500);
    };
    step();
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.start();
    this.apply();
  }

  setMode(mode) {
    this.mode = mode;
    this.apply();
  }

  // 0 = draussen, 1 = im Stadion
  setInside(v) {
    if (Math.abs(v - this.inside) < 0.05) return;
    this.inside = v;
    this.apply();
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.ctx.state === 'suspended' && this.enabled) this.ctx.resume();
    const live = this.mode === 'live';
    const inside = this.inside;
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, t, 0.4);
    this.crowdGain.gain.setTargetAtTime((live ? 0.55 : 0.18) * (0.35 + 0.65 * inside), t, 0.6);
    this.chantGain.gain.setTargetAtTime(live ? 0.32 * (0.3 + 0.7 * inside) : 0, t, 0.6);
    this.cityGain.gain.setTargetAtTime(0.16 * (1 - inside), t, 0.6);
  }
}
