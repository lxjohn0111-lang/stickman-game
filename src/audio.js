// All sounds are synthesised with the Web Audio API and pre-rendered into
// AudioBuffers (OfflineAudioContext) at load. Playing a shot is then just
// starting a buffer source on the same frame the muzzle flash appears.

const SR = 44100;

function noiseBuffer(ctx, seconds, seed = 1) {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x3fffffff) - 1;
  }
  return buf;
}

async function render(seconds, build) {
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctor(1, Math.ceil(seconds * SR), SR);
  build(ctx, ctx.destination);
  const buf = await ctx.startRendering();
  // normalise
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) {
    const k = 0.92 / peak;
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return buf;
}

function env(ctx, param, points) {
  // points: [[time, value, 'lin'|'exp'|'set'], ...]
  for (const [t, v, kind] of points) {
    if (kind === 'set' || t === 0) param.setValueAtTime(v, t);
    else if (kind === 'exp') param.exponentialRampToValueAtTime(Math.max(v, 1e-4), t);
    else param.linearRampToValueAtTime(v, t);
  }
}

function noiseSrc(ctx, seconds, seed) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, seconds, seed);
  return s;
}

function gunshot(p) {
  return (ctx, out) => {
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * p.drive); }
    sat.curve = curve;
    sat.connect(out);
    // crack transient
    const crack = noiseSrc(ctx, 0.05, p.seed);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.crackHP;
    const cg = ctx.createGain();
    env(ctx, cg.gain, [[0, 0], [0.0008, p.crack, 'lin'], [0.018, 0.001, 'exp']]);
    crack.connect(hp).connect(cg).connect(sat);
    crack.start(0);
    // body
    const body = noiseSrc(ctx, p.decay + 0.1, p.seed + 1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    env(ctx, lp.frequency, [[0, p.cut], [p.decay, p.cut * 0.25, 'exp']]);
    const bg = ctx.createGain();
    env(ctx, bg.gain, [[0, 0], [0.0015, 1, 'lin'], [p.decay, 0.001, 'exp']]);
    body.connect(lp).connect(bg).connect(sat);
    body.start(0);
    // thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    env(ctx, osc.frequency, [[0, p.f0], [0.09, p.f1, 'exp']]);
    const og = ctx.createGain();
    env(ctx, og.gain, [[0, 0], [0.002, p.thump, 'lin'], [p.thumpDecay, 0.001, 'exp']]);
    osc.connect(og).connect(sat);
    osc.start(0); osc.stop(p.thumpDecay + 0.05);
    // tail
    const tail = noiseSrc(ctx, p.tail + 0.1, p.seed + 2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.tailF; bp.Q.value = 0.6;
    const tg = ctx.createGain();
    env(ctx, tg.gain, [[0, 0], [0.01, p.tailAmt, 'lin'], [p.tail, 0.001, 'exp']]);
    tail.connect(bp).connect(tg).connect(out);
    tail.start(0);
    // mechanical click
    if (p.click) {
      const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 2600;
      const cg2 = ctx.createGain();
      env(ctx, cg2.gain, [[0, 0], [p.click, 0, 'set'], [p.click + 0.001, 0.12, 'lin'], [p.click + 0.02, 0.001, 'exp']]);
      c.connect(cg2).connect(out); c.start(0); c.stop(p.click + 0.05);
    }
  };
}

function clack(times, { f = 1800, q = 3, decay = 0.03, amp = 1, seed = 5 } = {}) {
  return (ctx, out) => {
    times.forEach((t, i) => {
      const n = noiseSrc(ctx, decay + 0.05, seed + i);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (1 + i * 0.15); bp.Q.value = q;
      const g = ctx.createGain();
      env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.001, amp, 'lin'], [t + decay, 0.001, 'exp']]);
      n.connect(bp).connect(g).connect(out);
      n.start(0);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * 0.35;
      const og = ctx.createGain();
      env(ctx, og.gain, [[0, 0], [t, 0, 'set'], [t + 0.001, amp * 0.4, 'lin'], [t + decay * 1.5, 0.001, 'exp']]);
      o.connect(og).connect(out); o.start(0); o.stop(t + decay * 2 + 0.05);
    });
  };
}

const RECIPES = {
  smg: [0.45, gunshot({ seed: 3, drive: 2.2, crack: 0.9, crackHP: 2500, cut: 5200, decay: 0.09, f0: 170, f1: 55, thump: 0.9, thumpDecay: 0.08, tail: 0.3, tailF: 900, tailAmt: 0.18 })],
  rifle: [0.7, gunshot({ seed: 7, drive: 2.6, crack: 1.0, crackHP: 2000, cut: 4200, decay: 0.16, f0: 140, f1: 42, thump: 1.1, thumpDecay: 0.13, tail: 0.55, tailF: 700, tailAmt: 0.25 })],
  shotgun: [1.0, gunshot({ seed: 11, drive: 3.0, crack: 0.8, crackHP: 1500, cut: 3000, decay: 0.3, f0: 110, f1: 35, thump: 1.4, thumpDecay: 0.22, tail: 0.8, tailF: 500, tailAmt: 0.3 })],
  pistol: [0.5, gunshot({ seed: 17, drive: 2.0, crack: 1.0, crackHP: 3000, cut: 6000, decay: 0.1, f0: 200, f1: 60, thump: 0.8, thumpDecay: 0.07, tail: 0.35, tailF: 1100, tailAmt: 0.16 })],
  pump: [0.45, clack([0.02, 0.2], { f: 1500, q: 2.5, decay: 0.05, seed: 21 })],
  magOut: [0.2, clack([0.01, 0.05], { f: 1200, q: 2, decay: 0.04, amp: 0.7, seed: 31 })],
  magIn: [0.2, clack([0.01], { f: 900, q: 1.5, decay: 0.06, seed: 33 })],
  bolt: [0.35, clack([0.01, 0.13], { f: 2200, q: 3, decay: 0.035, seed: 35 })],
  shell: [0.15, clack([0.01], { f: 1300, q: 2, decay: 0.04, amp: 0.8, seed: 37 })],
  dry: [0.1, clack([0.005], { f: 3200, q: 6, decay: 0.015, amp: 0.6, seed: 39 })],
  pickup: [0.3, clack([0.01, 0.09], { f: 1700, q: 2, decay: 0.04, seed: 41 })],
  step: [0.12, (ctx, out) => {
    const n = noiseSrc(ctx, 0.12, 51);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain();
    env(ctx, g.gain, [[0, 0], [0.004, 1, 'lin'], [0.07, 0.001, 'exp']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
  }],
  step2: [0.12, (ctx, out) => {
    const n = noiseSrc(ctx, 0.12, 57);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain();
    env(ctx, g.gain, [[0, 0], [0.005, 1, 'lin'], [0.08, 0.001, 'exp']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
  }],
  land: [0.25, (ctx, out) => {
    const n = noiseSrc(ctx, 0.25, 61);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain();
    env(ctx, g.gain, [[0, 0], [0.004, 1, 'lin'], [0.18, 0.001, 'exp']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
    const o = ctx.createOscillator(); o.frequency.value = 70;
    const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.003, 0.8, 'lin'], [0.15, 0.001, 'exp']]);
    o.connect(og).connect(out); o.start(0); o.stop(0.2);
  }],
  impact: [0.12, (ctx, out) => {
    const n = noiseSrc(ctx, 0.1, 71);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2;
    const g = ctx.createGain();
    env(ctx, g.gain, [[0, 0], [0.001, 1, 'lin'], [0.05, 0.001, 'exp']]);
    n.connect(bp).connect(g).connect(out); n.start(0);
  }],
  flesh: [0.22, (ctx, out) => {
    const n = noiseSrc(ctx, 0.2, 81);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; env(ctx, lp.frequency, [[0, 1800], [0.12, 300, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.003, 1, 'lin'], [0.14, 0.001, 'exp']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
    const o = ctx.createOscillator(); env(ctx, o.frequency, [[0, 160], [0.1, 60, 'exp']]);
    const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.003, 0.9, 'lin'], [0.12, 0.001, 'exp']]);
    o.connect(og).connect(out); o.start(0); o.stop(0.2);
  }],
  headshot: [0.3, (ctx, out) => {
    const n = noiseSrc(ctx, 0.3, 91);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.001, 1, 'lin'], [0.04, 0.001, 'exp']]);
    n.connect(hp).connect(g).connect(out); n.start(0);
    const o = ctx.createOscillator(); o.type = 'triangle'; env(ctx, o.frequency, [[0, 900], [0.2, 500, 'exp']]);
    const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.002, 0.5, 'lin'], [0.22, 0.001, 'exp']]);
    o.connect(og).connect(out); o.start(0); o.stop(0.3);
    const n2 = noiseSrc(ctx, 0.2, 93);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g2 = ctx.createGain(); env(ctx, g2.gain, [[0, 0], [0.004, 0.8, 'lin'], [0.15, 0.001, 'exp']]);
    n2.connect(lp).connect(g2).connect(out); n2.start(0);
  }],
  whiz: [0.4, (ctx, out) => {
    const n = noiseSrc(ctx, 0.4, 101);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    env(ctx, bp.frequency, [[0, 4200], [0.3, 800, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.09, 1, 'lin'], [0.3, 0.001, 'exp']]);
    n.connect(bp).connect(g).connect(out); n.start(0);
    const o = ctx.createOscillator(); o.type = 'sine'; env(ctx, o.frequency, [[0, 2600], [0.28, 900, 'exp']]);
    const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.08, 0.25, 'lin'], [0.28, 0.001, 'exp']]);
    o.connect(og).connect(out); o.start(0); o.stop(0.35);
  }],
  hurt: [0.4, (ctx, out) => {
    const o = ctx.createOscillator(); env(ctx, o.frequency, [[0, 110], [0.25, 45, 'exp']]);
    const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.004, 1, 'lin'], [0.3, 0.001, 'exp']]);
    o.connect(og).connect(out); o.start(0); o.stop(0.35);
    const n = noiseSrc(ctx, 0.2, 111);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.002, 0.7, 'lin'], [0.1, 0.001, 'exp']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
  }],
  doorOpen: [0.7, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    env(ctx, o.frequency, [[0, 160], [0.2, 240, 'lin'], [0.45, 190, 'lin']]);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 5;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.05, 0.35, 'lin'], [0.35, 0.25, 'lin'], [0.55, 0.001, 'exp']]);
    o.connect(bp).connect(g).connect(out); o.start(0); o.stop(0.6);
    clack([0.005], { f: 1400, decay: 0.03, amp: 0.8, seed: 121 })(ctx, out);
  }],
  doorClose: [0.4, (ctx, out) => {
    const n = noiseSrc(ctx, 0.3, 131);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.004, 1, 'lin'], [0.2, 0.001, 'exp']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
    clack([0.01], { f: 1900, decay: 0.025, amp: 0.7, seed: 133 })(ctx, out);
  }],
  death: [2.2, (ctx, out) => {
    const o = ctx.createOscillator(); env(ctx, o.frequency, [[0, 80], [1.2, 30, 'exp']]);
    const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.01, 1, 'lin'], [1.2, 0.001, 'exp']]);
    o.connect(og).connect(out); o.start(0); o.stop(1.3);
    const r = ctx.createOscillator(); r.frequency.value = 3100;
    const rg = ctx.createGain(); env(ctx, rg.gain, [[0, 0], [0.2, 0.09, 'lin'], [2.1, 0.001, 'exp']]);
    r.connect(rg).connect(out); r.start(0); r.stop(2.2);
  }],
  win: [2.4, (ctx, out) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); const t = i * 0.14;
      env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.02, 0.3, 'lin'], [t + 1.8, 0.001, 'exp']]);
      o.connect(g).connect(out); o.start(0); o.stop(2.3);
    });
  }],
  uiClick: [0.08, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1400;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.002, 0.3, 'lin'], [0.05, 0.001, 'exp']]);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000;
    o.connect(lp).connect(g).connect(out); o.start(0); o.stop(0.07);
  }],
  uiHover: [0.05, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2100;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.002, 0.15, 'lin'], [0.03, 0.001, 'exp']]);
    o.connect(g).connect(out); o.start(0); o.stop(0.045);
  }],
  alert: [0.3, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'triangle'; env(ctx, o.frequency, [[0, 520], [0.12, 780, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.01, 0.4, 'lin'], [0.22, 0.001, 'exp']]);
    o.connect(g).connect(out); o.start(0); o.stop(0.28);
  }],
  wind: [6, (ctx, out) => {
    const n = noiseSrc(ctx, 6, 141);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.5;
    const g = ctx.createGain();
    // slow swells that start and end at the same level so the loop is seamless
    env(ctx, g.gain, [[0, 0.5], [1.5, 0.8, 'lin'], [3, 0.45, 'lin'], [4.5, 0.75, 'lin'], [6, 0.5, 'lin']]);
    n.connect(lp).connect(g).connect(out); n.start(0);
  }],
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.voices = 0;
    this.volumes = { master: 0.8, sfx: 1, ambience: 0.5 };
    this.windSrc = null;
  }

  // Pre-render every buffer. Works before any user gesture.
  async load() {
    const entries = Object.entries(RECIPES);
    await Promise.all(entries.map(async ([name, [secs, build]]) => {
      try { this.buffers[name] = await render(secs, build); } catch (e) { console.warn('audio render failed', name, e); }
    }));
    this.ready = true;
  }

  // Create/resume the live context. Must be called from a user gesture.
  unlock() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.amb = this.ctx.createGain(); this.amb.connect(this.master);
      this.ui = this.ctx.createGain(); this.ui.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.ui.gain.value = Math.min(1, this.volumes.sfx);
    this.amb.gain.value = this.volumes.ambience * 0.35;
  }

  // opts: gain, pan (-1..1), rate, lowpass (Hz), bus ('sfx'|'ui'|'amb')
  play(name, opts = {}) {
    const ctx = this.ctx;
    const buf = this.buffers[name];
    if (!ctx || !buf || ctx.state !== 'running') return null;
    if (this.voices > 40 && !opts.priority) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate || 1;
    let node = src;
    if (opts.lowpass && opts.lowpass < 18000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.lowpass;
      node.connect(f); node = f;
    }
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    node.connect(g); node = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(p); node = p;
    }
    node.connect(opts.bus === 'ui' ? this.ui : opts.bus === 'amb' ? this.amb : this.sfx);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(0);
    return src;
  }

  startAmbience() {
    if (!this.ctx || this.windSrc || !this.buffers.wind) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.wind;
    src.loop = true;
    src.connect(this.amb);
    src.start(0);
    this.windSrc = src;
  }
}
