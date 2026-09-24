// Every texture in the game is drawn on a canvas at load time: no image files.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(c, { repeat = false, nearest = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (nearest) tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}

// Ink splat: a lumpy core, a few spikes and a spray of droplets. White on
// transparent so instance colours tint it (black ink, dark red blood).
export function makeSplatTexture() {
  const S = 256;
  const c = canvas(S * 2, S * 2);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  const variants = [11, 23, 37, 51];
  variants.forEach((seed, i) => {
    const r = rng(seed);
    const ox = (i % 2) * S + S / 2;
    const oy = Math.floor(i / 2) * S + S / 2;
    // core
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * S * 0.08;
      g.beginPath();
      g.arc(ox + Math.cos(a) * d, oy + Math.sin(a) * d, S * (0.06 + r() * 0.07), 0, Math.PI * 2);
      g.fill();
    }
    // spikes
    const spikes = 6 + Math.floor(r() * 5);
    for (let k = 0; k < spikes; k++) {
      const a = r() * Math.PI * 2;
      const len = S * (0.18 + r() * 0.2);
      const w = S * (0.015 + r() * 0.025);
      const ca = Math.cos(a), sa = Math.sin(a);
      g.beginPath();
      g.moveTo(ox - sa * w, oy + ca * w);
      g.lineTo(ox + ca * len, oy + sa * len);
      g.lineTo(ox + sa * w, oy - ca * w);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(ox + ca * len, oy + sa * len, w * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    // droplets
    const drops = 10 + Math.floor(r() * 10);
    for (let k = 0; k < drops; k++) {
      const a = r() * Math.PI * 2;
      const d = S * (0.2 + r() * 0.27);
      g.beginPath();
      g.arc(ox + Math.cos(a) * d, oy + Math.sin(a) * d, S * (0.006 + r() * 0.018), 0, Math.PI * 2);
      g.fill();
    }
  });
  return finish(c);
}

// Blood pool: a wide irregular blob.
export function makePoolTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(99);
  g.fillStyle = '#fff';
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2;
    const d = r() * S * 0.17;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.14 + r() * 0.12), 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

// Text for signs; white glyphs so the material colour picks the ink.
export function makeTextTexture(text, { w = 256, h = 96, font = 'bold 64px Arial, Helvetica, sans-serif', stroke = 0 } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font;
  g.fillText(text, w / 2, h / 2 + 2);
  if (stroke) {
    g.lineWidth = stroke;
    g.strokeStyle = '#fff';
    g.strokeText(text, w / 2, h / 2 + 2);
  }
  return finish(c);
}

// Outlined cartoon cloud for the Neobrutalist sky.
export function makeCloudTexture() {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const puffs = [
    [140, 170, 70], [220, 130, 90], [310, 140, 80], [380, 175, 60], [250, 185, 70], [90, 195, 42], [430, 200, 40],
  ];
  const path = () => {
    g.beginPath();
    for (const [x, y, r] of puffs) {
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
  };
  g.fillStyle = '#000';
  // outline: draw enlarged puffs in black, then the white body on top
  g.save();
  for (const [x, y, r] of puffs) {
    g.beginPath();
    g.arc(x, y, r + 7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.fillStyle = '#fff';
  path();
  g.fill();
  // flat bottom
  g.fillStyle = '#000';
  g.fillRect(40, 214, 440, 8);
  g.clearRect(0, 222, W, H - 222);
  g.fillStyle = '#fff';
  g.fillRect(52, 196, 416, 18);
  return finish(c);
}

// Equirectangular gradient sky (only the vertical axis matters) so the
// horizon stays level when the camera pitches.
export function makeSkyTexture(top, mid, horizon, below) {
  const c = canvas(64, 512);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(0.3, mid);
  grad.addColorStop(0.495, horizon);
  grad.addColorStop(0.505, horizon);
  grad.addColorStop(1, below);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 512);
  const tex = finish(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// 2-step toon ramp for MeshToonMaterial.
export function makeToonRamp() {
  const data = new Uint8Array([150, 150, 150, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
