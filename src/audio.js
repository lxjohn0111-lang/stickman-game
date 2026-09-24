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

async function render(seconds, build, sr = SR, peakTarget = 0.92) {
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctor(1, Math.ceil(seconds * sr), sr);
  build(ctx, ctx.destination);
  const buf = await ctx.startRendering();
  // normalise
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) {
    const k = peakTarget / peak;
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


// Short filtered-noise footstep. surface character comes from the filter,
// the decay and an optional resonant ring (metal) or grain train (snow).
function footstep({ seed, lp = 900, hp = 60, decay = 0.07, ring = 0, ringF = 900, grains = 0, bright = 0 }) {
  return (ctx, out) => {
    const n = noiseSrc(ctx, 0.2, seed);
    const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const g = ctx.createGain();
    env(ctx, g.gain, [[0, 0], [0.004, 1, 'lin'], [decay, 0.001, 'exp']]);
    n.connect(h).connect(l).connect(g).connect(out); n.start(0);
    if (ring) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = ringF;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = ringF * 2.76;
      const og = ctx.createGain(); env(ctx, og.gain, [[0, 0], [0.002, ring, 'lin'], [0.14, 0.001, 'exp']]);
      o.connect(og); o2.connect(og); og.connect(out);
      o.start(0); o2.start(0); o.stop(0.16); o2.stop(0.16);
    }
    for (let i = 0; i < grains; i++) {
      const t = 0.008 + i * 0.013 + (i % 3) * 0.004;
      const gn = noiseSrc(ctx, 0.03, seed + 10 + i);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + (i % 4) * 700; bp.Q.value = 2;
      const gg = ctx.createGain();
      env(ctx, gg.gain, [[0, 0], [t, 0, 'set'], [t + 0.002, 0.5 - i * 0.04, 'lin'], [t + 0.012, 0.001, 'exp']]);
      gn.connect(bp).connect(gg).connect(out); gn.start(0);
    }
    if (bright) clack([0.004], { f: 2600, q: 3, decay: 0.012, amp: bright, seed: seed + 50 })(ctx, out);
  };
}

function tones(notes, { type = 'triangle', amp = 0.3, len = 0.5, gap = 0.1 } = {}) {
  return (ctx, out) => {
    notes.forEach((f, i) => {
      const t = i * gap;
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const g = ctx.createGain();
      env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.01, amp, 'lin'], [t + len, 0.001, 'exp']]);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2).connect(g); g.connect(out);
      o.start(0); o2.start(0); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
    });
  };
}

function noiseSweep({ seed, dur, f0, f1, q = 1, type = 'bandpass', attack = 0.02, amp = 1, hold = 0 }) {
  return (ctx, out) => {
    const n = noiseSrc(ctx, dur + 0.05, seed);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    env(ctx, f.frequency, [[0, f0], [dur, f1, 'exp']]);
    const g = ctx.createGain();
    env(ctx, g.gain, [[0, 0], [attack, amp, 'lin'], [attack + hold, amp, 'lin'], [dur, 0.001, 'exp']]);
    n.connect(f).connect(g).connect(out); n.start(0);
  };
}

// Seamless noise loop (rain, sea, hum): the gain curve starts and ends equal.
function noiseLoop({ seed, dur, lp, hp = 20, curve, extra }) {
  return (ctx, out) => {
    const n = noiseSrc(ctx, dur, seed);
    const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const g = ctx.createGain();
    env(ctx, g.gain, curve);
    n.connect(h).connect(l).connect(g).connect(out); n.start(0);
    if (extra) extra(ctx, out);
  };
}

// ---- music: procedural loops (rendered at a lower rate, they're soft)
const MSR = 22050;
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

function pad(ctx, out, t0, dur, notes, amp) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.3;
  const g = ctx.createGain();
  env(ctx, g.gain, [[0, 0], [t0, 0, 'set'], [t0 + 0.8, amp, 'lin'], [t0 + dur - 0.6, amp * 0.8, 'lin'], [t0 + dur, 0, 'lin']]);
  lp.connect(g).connect(out);
  for (const m of notes) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(m); o.detune.value = det;
      o.connect(lp); o.start(t0); o.stop(t0 + dur + 0.01);
    }
  }
}

function pluck(ctx, out, t, f, amp, len = 0.35, type = 'triangle') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  env(ctx, lp.frequency, [[0, 2400], [t, 2400, 'set'], [t + len, 300, 'exp']]);
  const g = ctx.createGain();
  env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.006, amp, 'lin'], [t + len, 0.001, 'exp']]);
  o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + len + 0.02);
}

function hat(ctx, out, t, amp, seed) {
  const n = noiseSrc(ctx, 0.06, seed);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ctx.createGain();
  env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.002, amp, 'lin'], [t + 0.04, 0.001, 'exp']]);
  n.connect(hp).connect(g).connect(out); n.start(t);
}

function kick(ctx, out, t, amp) {
  const o = ctx.createOscillator();
  env(ctx, o.frequency, [[0, 120], [t, 120, 'set'], [t + 0.12, 42, 'exp']]);
  const g = ctx.createGain();
  env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.003, amp, 'lin'], [t + 0.22, 0.001, 'exp']]);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
}

function snare(ctx, out, t, amp, seed) {
  const n = noiseSrc(ctx, 0.2, seed);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
  const g = ctx.createGain();
  env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.002, amp, 'lin'], [t + 0.14, 0.001, 'exp']]);
  n.connect(bp).connect(g).connect(out); n.start(t);
}

// Menu: 16 s, calm Am-F-C-G pads, a soft bass and a light arpeggio.
function musicMenu(ctx, out) {
  const chords = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]];
  const bass = [45, 41, 36, 43];
  const beat = 1;
  const bar = 4;
  for (let i = 0; i < 4; i++) {
    const t0 = i * bar;
    pad(ctx, out, t0, bar + 0.02, chords[i], 0.07);
    pluck(ctx, out, t0, NOTE(bass[i]), 0.35, 1.2, 'sine');
    pluck(ctx, out, t0 + beat * 3, NOTE(bass[i]), 0.2, 0.6, 'sine');
    const arp = [...chords[i], chords[i][1] + 12];
    for (let k = 0; k < 6; k++) {
      const t = t0 + 0.3 + k * 0.62;
      if (t < t0 + bar - 0.2) pluck(ctx, out, t, NOTE(arp[k % arp.length] + 12), 0.08, 0.5);
    }
  }
  for (let k = 0; k < 32; k++) hat(ctx, out, 0.05 + k * 0.5, k % 2 ? 0.02 : 0.035, 700 + k);
}

// Combat: 8 s at 120 BPM, low intensity: pulsing bass, kick and snare.
function musicCombat(ctx, out) {
  const b = 0.5;
  const roots = [38, 38, 41, 36];
  for (let bar = 0; bar < 4; bar++) {
    const t0 = bar * 2;
    for (let k = 0; k < 8; k++) pluck(ctx, out, t0 + k * b / 2, NOTE(roots[bar]) * (k % 4 === 3 ? 2 : 1), k % 2 ? 0.16 : 0.24, 0.22, 'sawtooth');
    for (let k = 0; k < 4; k++) {
      kick(ctx, out, t0 + k * b, k % 2 ? 0.35 : 0.5);
      if (k % 2) snare(ctx, out, t0 + k * b, 0.16, 800 + bar * 4 + k);
      hat(ctx, out, t0 + k * b + b / 2, 0.03, 900 + bar * 4 + k);
    }
    pad(ctx, out, t0, 2.02, [roots[bar] + 12, roots[bar] + 19], 0.035);
  }
}

const RECIPES = {
  smg: [0.45, gunshot({ seed: 3, drive: 2.2, crack: 0.9, crackHP: 2500, cut: 5200, decay: 0.09, f0: 170, f1: 55, thump: 0.9, thumpDecay: 0.08, tail: 0.3, tailF: 900, tailAmt: 0.18 })],
  rifle: [0.7, gunshot({ seed: 7, drive: 2.6, crack: 1.0, crackHP: 2000, cut: 4200, decay: 0.16, f0: 140, f1: 42, thump: 1.1, thumpDecay: 0.13, tail: 0.55, tailF: 700, tailAmt: 0.25 })],
  shotgun: [1.0, gunshot({ seed: 11, drive: 3.0, crack: 0.8, crackHP: 1500, cut: 3000, decay: 0.3, f0: 110, f1: 35, thump: 1.4, thumpDecay: 0.22, tail: 0.8, tailF: 500, tailAmt: 0.3 })],
  pistol: [0.5, gunshot({ seed: 17, drive: 2.0, crack: 1.0, crackHP: 3000, cut: 6000, decay: 0.1, f0: 200, f1: 60, thump: 0.8, thumpDecay: 0.07, tail: 0.35, tailF: 1100, tailAmt: 0.16 })],
  burst: [0.6, gunshot({ seed: 13, drive: 2.4, crack: 1.0, crackHP: 2300, cut: 4800, decay: 0.12, f0: 150, f1: 48, thump: 1.0, thumpDecay: 0.1, tail: 0.45, tailF: 800, tailAmt: 0.22 })],
  mpistol: [0.4, gunshot({ seed: 19, drive: 1.8, crack: 0.8, crackHP: 3400, cut: 7000, decay: 0.065, f0: 230, f1: 70, thump: 0.6, thumpDecay: 0.05, tail: 0.25, tailF: 1300, tailAmt: 0.12, click: 0.03 })],
  revolver: [1.0, gunshot({ seed: 23, drive: 2.9, crack: 1.1, crackHP: 1800, cut: 3600, decay: 0.22, f0: 125, f1: 38, thump: 1.4, thumpDecay: 0.18, tail: 0.9, tailF: 600, tailAmt: 0.3 })],
  swap: [0.25, clack([0.01, 0.12], { f: 1500, q: 2, decay: 0.035, amp: 0.7, seed: 151 })],
  drumOpen: [0.25, clack([0.01, 0.06], { f: 2400, q: 4, decay: 0.03, amp: 0.8, seed: 153 })],
  drumClose: [0.2, clack([0.01], { f: 1900, q: 3, decay: 0.04, amp: 1, seed: 155 })],
  locked: [0.35, clack([0.01, 0.07, 0.13], { f: 900, q: 2, decay: 0.04, amp: 0.8, seed: 157 })],
  step_ground: [0.14, footstep({ seed: 51, lp: 900, decay: 0.07 })],
  step_roof: [0.16, footstep({ seed: 161, lp: 2600, hp: 300, decay: 0.06, grains: 3 })],
  step_indoor: [0.14, footstep({ seed: 163, lp: 650, hp: 80, decay: 0.05, bright: 0.25 })],
  step_metal: [0.2, footstep({ seed: 165, lp: 3000, hp: 400, decay: 0.05, ring: 0.3, ringF: 780 })],
  step_snow: [0.16, footstep({ seed: 167, lp: 1800, hp: 500, decay: 0.09, grains: 7 })],
  heal: [0.7, tones([660, 880, 1320], { amp: 0.28, len: 0.4, gap: 0.08, type: 'sine' })],
  checkpoint: [1.0, tones([523.25, 659.25, 783.99], { amp: 0.3, len: 0.6, gap: 0.11 })],
  objective: [1.0, tones([587.33, 880], { amp: 0.32, len: 0.7, gap: 0.14 })],
  secret: [1.4, tones([1046.5, 1318.5, 1568, 2093], { amp: 0.22, len: 0.9, gap: 0.07, type: 'sine' })],
  levelComplete: [2.8, tones([392, 523.25, 659.25, 783.99, 1046.5], { amp: 0.3, len: 1.8, gap: 0.12 })],
  heartbeat: [0.9, (ctx, out) => {
    for (const [t, a] of [[0, 1], [0.24, 0.7]]) {
      const o = ctx.createOscillator(); env(ctx, o.frequency, [[0, 70], [t, 70, 'set'], [t + 0.1, 40, 'exp']]);
      const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.01, a, 'lin'], [t + 0.16, 0.001, 'exp']]);
      o.connect(g).connect(out); o.start(0); o.stop(t + 0.2);
    }
  }],
  hiss: [0.7, noiseSweep({ seed: 171, dur: 0.65, f0: 3000, f1: 6000, q: 0.8, type: 'highpass', attack: 0.3, amp: 0.5 })],
  steam: [1.5, noiseSweep({ seed: 173, dur: 1.45, f0: 5000, f1: 1500, q: 0.4, type: 'lowpass', attack: 0.03, amp: 1, hold: 0.8 })],
  press: [1.0, (ctx, out) => {
    const o = ctx.createOscillator(); env(ctx, o.frequency, [[0, 90], [0.25, 32, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.004, 1, 'lin'], [0.5, 0.001, 'exp']]);
    o.connect(g).connect(out); o.start(0); o.stop(0.55);
    clack([0.002], { f: 700, q: 6, decay: 0.3, amp: 0.8, seed: 175 })(ctx, out);
    noiseSweep({ seed: 177, dur: 0.6, f0: 900, f1: 200, type: 'lowpass', attack: 0.004, amp: 0.8 })(ctx, out);
  }],
  alarmBeep: [0.2, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 880;
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 2500;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.005, 0.25, 'lin'], [0.14, 0.25, 'lin'], [0.18, 0.001, 'exp']]);
    o.connect(lp).connect(g).connect(out); o.start(0); o.stop(0.2);
  }],
  explosion: [2.0, (ctx, out) => {
    noiseSweep({ seed: 181, dur: 1.9, f0: 3000, f1: 120, type: 'lowpass', attack: 0.005, amp: 1, hold: 0.05 })(ctx, out);
    const o = ctx.createOscillator(); env(ctx, o.frequency, [[0, 80], [0.6, 25, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.005, 1.2, 'lin'], [0.9, 0.001, 'exp']]);
    o.connect(g).connect(out); o.start(0); o.stop(1);
  }],
  glass: [0.6, (ctx, out) => {
    noiseSweep({ seed: 183, dur: 0.12, f0: 6000, f1: 3000, type: 'highpass', attack: 0.001, amp: 0.8 })(ctx, out);
    [3100, 4400, 5200, 3700, 6100].forEach((f, i) => {
      const t = 0.01 + i * 0.045 + (i % 2) * 0.02;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.002, 0.25, 'lin'], [t + 0.2, 0.001, 'exp']]);
      o.connect(g).connect(out); o.start(0); o.stop(t + 0.25);
    });
  }],
  powerUp: [1.6, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; env(ctx, o.frequency, [[0, 50], [1.2, 220, 'exp']]);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; env(ctx, lp.frequency, [[0, 200], [1.2, 2400, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.2, 0.3, 'lin'], [1.2, 0.35, 'lin'], [1.55, 0.001, 'exp']]);
    o.connect(lp).connect(g).connect(out); o.start(0); o.stop(1.6);
    clack([1.2], { f: 1200, decay: 0.08, amp: 0.8, seed: 185 })(ctx, out);
  }],
  elevator: [2.5, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 300;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.4, 0.4, 'lin'], [2.0, 0.4, 'lin'], [2.45, 0.001, 'exp']]);
    o.connect(lp).connect(g).connect(out); o.start(0); o.stop(2.5);
    clack([0.02, 2.3], { f: 800, decay: 0.08, amp: 0.8, seed: 187 })(ctx, out);
  }],
  laser: [0.3, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sine'; env(ctx, o.frequency, [[0, 2400], [0.25, 3200, 'lin']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.01, 0.2, 'lin'], [0.25, 0.001, 'exp']]);
    o.connect(g).connect(out); o.start(0); o.stop(0.3);
  }],
  ricochet: [0.4, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sine'; env(ctx, o.frequency, [[0, 3800], [0.3, 1700, 'exp']]);
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.003, 0.4, 'lin'], [0.3, 0.001, 'exp']]);
    o.connect(g).connect(out); o.start(0); o.stop(0.35);
    clack([0.001], { f: 3000, q: 5, decay: 0.02, amp: 0.9, seed: 189 })(ctx, out);
  }],
  grunt: [0.4, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; env(ctx, o.frequency, [[0, 150], [0.3, 95, 'exp']]);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 3;
    const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [0.02, 0.6, 'lin'], [0.3, 0.001, 'exp']]);
    o.connect(bp).connect(g).connect(out); o.start(0); o.stop(0.35);
  }],
  siren: [3.0, (ctx, out) => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    env(ctx, o.frequency, [[0, 520], [1.5, 820, 'lin'], [3.0, 520, 'lin']]);
    const g = ctx.createGain(); g.gain.value = 0.3;
    o.connect(g).connect(out); o.start(0); o.stop(3.0);
  }],
  heli: [1.0, (ctx, out) => {
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const n = noiseSrc(ctx, 0.06, 191 + i);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = ctx.createGain(); env(ctx, g.gain, [[0, 0], [t, 0, 'set'], [t + 0.005, 1, 'lin'], [t + 0.05, 0.001, 'exp']]);
      n.connect(lp).connect(g).connect(out); n.start(0);
    }
  }],
  rain: [6, noiseLoop({ seed: 201, dur: 6, lp: 7000, hp: 900, curve: [[0, 0.6], [2, 0.7, 'lin'], [4, 0.55, 'lin'], [6, 0.6, 'lin']] })],
  sea: [8, noiseLoop({ seed: 203, dur: 8, lp: 600, hp: 60, curve: [[0, 0.3], [2, 0.8, 'lin'], [4, 0.3, 'lin'], [6, 0.8, 'lin'], [8, 0.3, 'lin']] })],
  hum: [4, noiseLoop({ seed: 205, dur: 4, lp: 300, hp: 40, curve: [[0, 0.3], [4, 0.3, 'lin']], extra: (ctx, out) => {
    for (const [f, a] of [[50, 0.4], [100, 0.25], [150, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a;
      o.connect(g).connect(out); o.start(0); o.stop(4);
    }
  } })],
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

const MUSIC = {
  musicMenu: [16, musicMenu],
  musicCombat: [8, musicCombat],
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.voices = 0;
    this.volumes = { master: 0.8, sfx: 1, ambience: 0.5, music: 0.35 };
    this.loops = {}; // name -> {src, gain}
    this.musicWant = null;
    this.ambWant = [];
    this.reverbAmt = 0;
  }

  // Pre-render every effect buffer. Works before any user gesture; music is
  // rendered afterwards in the background so loading stays short.
  async load() {
    const entries = Object.entries(RECIPES);
    await Promise.all(entries.map(async ([name, [secs, build]]) => {
      try { this.buffers[name] = await render(secs, build); } catch (e) { console.warn('audio render failed', name, e); }
    }));
    this.ready = true;
    this.musicReady = (async () => {
      for (const [name, [secs, build]] of Object.entries(MUSIC)) {
        try { this.buffers[name] = await render(secs, build, MSR, 0.7); } catch (e) { console.warn('music render failed', name, e); }
      }
      this._syncLoops();
    })();
  }

  // Create/resume the live context. Must be called from a user gesture, so no
  // sound (or music) ever plays before the player interacts.
  unlock() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      const ctx = this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.amb = ctx.createGain(); this.amb.connect(this.master);
      this.ui = ctx.createGain(); this.ui.connect(this.master);
      this.music = ctx.createGain(); this.music.connect(this.master);
      // echo send for tiled halls and tunnels
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(2.2);
      this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0;
      this.sfx.connect(this.verb).connect(this.verbGain).connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._syncLoops();
  }

  _impulse(secs) {
    const ctx = this.ctx;
    const len = Math.ceil(secs * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let s = 777 + c * 31;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const t = i / len;
        // sparse early reflections, then a smooth tail
        const early = i < ctx.sampleRate * 0.08 && (i % 997 < 3) ? 1.5 : 0;
        d[i] = ((s / 0x3fffffff) - 1) * Math.pow(1 - t, 3.2) * 0.6 + early * (1 - t);
      }
    }
    return buf;
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
    this.music.gain.value = this.volumes.music * 0.5;
  }

  // Echo amount for the current level (0 outdoors, ~0.35 in the metro).
  setReverb(amount) {
    this.reverbAmt = amount;
    if (this.verbGain) this.verbGain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.3);
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
    node.connect(opts.bus === 'ui' ? this.ui : opts.bus === 'amb' ? this.amb : opts.bus === 'music' ? this.music : this.sfx);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(0);
    return src;
  }

  // ---- loops: music (one at a time, crossfaded) and ambience beds
  setMusic(name) {
    this.musicWant = name;
    this._syncLoops();
  }

  setAmbience(names) {
    this.ambWant = names || [];
    this._syncLoops();
  }

  _syncLoops() {
    const ctx = this.ctx;
    if (!ctx) return;
    const want = new Map();
    if (this.musicWant) want.set(this.musicWant, 'music');
    for (const a of this.ambWant) want.set(a, 'amb');
    const now = ctx.currentTime;
    for (const [name, loop] of Object.entries(this.loops)) {
      if (want.has(name)) continue;
      loop.gain.gain.cancelScheduledValues(now);
      loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
      loop.gain.gain.linearRampToValueAtTime(0, now + 1.2);
      loop.src.stop(now + 1.3);
      delete this.loops[name];
    }
    for (const [name, bus] of want) {
      if (this.loops[name] || !this.buffers[name]) continue;
      const src = ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(name === 'wind' ? 1 : bus === 'amb' ? 0.8 : 1, now + 1.5);
      src.connect(g).connect(bus === 'music' ? this.music : this.amb);
      src.start(now);
      this.loops[name] = { src, gain: g };
    }
  }

  startAmbience() {
    if (!this.ambWant.length) this.setAmbience(['wind']);
  }
}
