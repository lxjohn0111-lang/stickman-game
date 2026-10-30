// Weapon skins, earned with campaign stars (24 in all): the long-term goal
// that the results card and the Armory point at. One skin dresses every gun
// you hold, in the first-person view.
//
// Each pattern is drawn on a canvas and mapped from the gun's own coordinates
// (a triplanar lookup in the shader), so stripes and camo keep the same size
// on every part, whatever its shape. The three energy skins glow, pulse and
// flow, and tint the muzzle flash and the tracers in the Neobrutalist style.
// Classic draws every skin in ink: patterns in black on white paper, and the
// energy skins inverted, white lines on a black gun.
import * as THREE from 'three';
import { progress, saveProgress, totalStars } from './save.js';

export const SKINS = [
  { id: 'standard', stars: 0 },
  { id: 'carbon', stars: 2, base: '#2c2c36', a: '#4d4d5e', dark: 0x121218 },
  { id: 'tiger', stars: 4, base: '#ff8a1f', a: '#111111', dark: 0x1a1008 },
  { id: 'arctic', stars: 7, base: '#eef6ff', a: '#a9c8ec', b: '#5e86b8', dark: 0x34465c },
  { id: 'gold', stars: 10, base: '#ffc928', a: '#fff2a6', b: '#b98500', dark: 0x3d2c00 },
  { id: 'plasma', stars: 13, base: '#231a4c', a: '#3b2e7a', dark: 0x0d0a20, glow: 0x35e8ff },
  { id: 'ion', stars: 17, base: '#2a0d2e', a: '#4a1a50', dark: 0x150418, glow: 0xff3df2 },
  { id: 'ghost', stars: 21, base: '#dfe8ff', a: '#c4d2f4', dark: 0x8090b8, glow: 0xffffff },
];

const S = 256; // pattern canvas size
const TILE = 9; // pattern tiles per metre of gun (the uSkinScale uniform)

// Deterministic randomness, so a skin looks the same on every device.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// Draw a skin's pattern. ink = Classic: black marks on white (or, for the
// energy skins, white lines on black). glow = the bright-line mask alone.
function drawPattern(skin, mode) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const ink = mode === 'ink';
  const energy = !!skin.glow;
  const base = mode === 'glow' ? '#000' : ink ? (energy ? '#111' : '#fff') : skin.base;
  const mark = mode === 'glow' ? '#fff' : ink ? (energy ? '#fff' : '#111') : skin.a;
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = mark;
  x.fillStyle = mark;
  const r = rng(skin.id.length * 977 + skin.stars * 31 + 7);
  if (skin.id === 'carbon') {
    // a woven twill: short diagonal dashes alternating direction
    x.lineWidth = ink ? 3 : 7;
    const n = 8, cs = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.beginPath();
      if ((i + j) % 2) { x.moveTo(i * cs + 4, j * cs + 4); x.lineTo(i * cs + cs - 4, j * cs + cs - 4); } else { x.moveTo(i * cs + cs - 4, j * cs + 4); x.lineTo(i * cs + 4, j * cs + cs - 4); }
      x.stroke();
    }
  } else if (skin.id === 'tiger') {
    // wavy stripes running across, tapering at both ends
    for (let k = 0; k < 5; k++) {
      const y0 = (k + 0.3) * (S / 5);
      x.beginPath();
      for (let i = 0; i <= 32; i++) {
        const px = (i / 32) * S;
        const w = (ink ? 6 : 12) * Math.sin((i / 32) * Math.PI) + 2;
        const py = y0 + Math.sin(i * 0.5 + k * 1.7) * 10 - w;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      for (let i = 32; i >= 0; i--) {
        const px = (i / 32) * S;
        const w = (ink ? 6 : 12) * Math.sin((i / 32) * Math.PI) + 2;
        x.lineTo(px, y0 + Math.sin(i * 0.5 + k * 1.7) * 10 + w);
      }
      x.closePath();
      x.fill();
    }
  } else if (skin.id === 'arctic') {
    // two tones of blotches (wrapped at the edges so the tile repeats cleanly)
    const blob = (cx, cy, rr, col) => {
      x.fillStyle = col;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.beginPath(); x.ellipse(cx + ox, cy + oy, rr, rr * 0.7, r() * 3, 0, Math.PI * 2); x.fill(); }
    };
    for (let i = 0; i < 14; i++) blob(r() * S, r() * S, 14 + r() * 26, ink ? '#888' : skin.a);
    for (let i = 0; i < 9; i++) blob(r() * S, r() * S, 10 + r() * 16, ink ? '#111' : skin.b);
  } else if (skin.id === 'gold') {
    // polished: bright diagonal streaks over darker engraved lines
    x.lineWidth = ink ? 2 : 3;
    x.strokeStyle = ink ? '#111' : skin.b;
    for (let i = -S; i < S * 2; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
    if (!ink) {
      x.lineWidth = 10;
      x.strokeStyle = skin.a;
      for (let i = -S; i < S * 2; i += 88) { x.beginPath(); x.moveTo(i + 30, 0); x.lineTo(i + 30 + S, S); x.stroke(); }
    }
  } else if (skin.id === 'plasma') {
    // circuit traces: straight runs with right-angle turns and pads
    x.lineWidth = mode === 'glow' ? 5 : 4;
    x.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let px = Math.round(r() * 8) * 32, py = Math.round(r() * 8) * 32;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        if (k % 2) px += (r() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(r() * 3)); else py += (r() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(r() * 3));
        x.lineTo(px, py);
      }
      x.stroke();
      x.beginPath(); x.arc(px, py, 7, 0, Math.PI * 2); x.fill();
    }
  } else if (skin.id === 'ion') {
    // a honeycomb
    x.lineWidth = mode === 'glow' ? 4 : 3;
    const hr = S / 8;
    const hw = Math.sqrt(3) * hr;
    for (let row = -1; row < 7; row++) for (let col = -1; col < 6; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * hr * 1.5;
      x.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = Math.PI / 6 + (a * Math.PI) / 3;
        const px = cx + Math.cos(ang) * (hr - 3), py = cy + Math.sin(ang) * (hr - 3);
        if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.closePath();
      x.stroke();
    }
  } else if (skin.id === 'ghost') {
    // fine scan lines with a few brighter bands
    x.lineWidth = mode === 'glow' ? 3 : 2;
    for (let y = 0; y < S; y += 16) { x.globalAlpha = y % 64 === 0 ? 1 : 0.45; x.beginPath(); x.moveTo(0, y + 0.5); x.lineTo(S, y + 0.5); x.stroke(); }
    x.globalAlpha = 1;
  }
  return c;
}

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Look patterns up by the gun's own coordinates instead of its UVs: pick the
// plane the surface faces most and use the two coordinates across it.
function triplanar(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSkinScale = uniforms.scale;
    sh.uniforms.uSkinFlow = uniforms.flow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;\nvarying vec3 vSkinN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;\nvSkinN = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSkinP;
varying vec3 vSkinN;
uniform float uSkinScale;
uniform float uSkinFlow;
vec2 skinUv() {
  vec3 n = abs(normalize(vSkinN));
  vec3 p = vSkinP * uSkinScale;
  return n.x > n.y && n.x > n.z ? p.zy : n.y > n.z ? p.xz : p.xy;
}`)
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor *= texture2D( map, skinUv() );\n#endif')
      .replace('#include <emissivemap_fragment>', '#ifdef USE_EMISSIVEMAP\n  totalEmissiveRadiance *= texture2D( emissiveMap, skinUv() + vec2( 0.0, uSkinFlow ) ).rgb;\n#endif');
  };
  mat.customProgramCacheKey = () => 'skin-triplanar';
}

export function skinById(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }
export function skinUnlocked(skin, stars = totalStars()) { return stars >= skin.stars; }
// The next skin still to earn, or null when all are in.
export function nextSkin(stars = totalStars()) { return SKINS.find((s) => s.stars > stars) || null; }

// Skins that became available since they were last announced (results card).
export function newlyUnlocked() {
  const stars = totalStars();
  const seen = new Set(progress.skinsSeen || []);
  const fresh = SKINS.filter((s) => s.stars <= stars && !seen.has(s.id));
  if (fresh.length) {
    progress.skinsSeen = [...seen, ...fresh.map((s) => s.id)];
    saveProgress();
  }
  return fresh;
}

// A swatch picture for the Armory and the results card.
const swatches = {};
export function swatchUrl(skin) {
  if (swatches[skin.id] !== undefined) return swatches[skin.id];
  let url = '';
  try {
    if (skin.id === 'standard') {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = '#9b7bff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#2b2640'; x.fillRect(0, 44, 64, 20);
      url = c.toDataURL();
    } else {
      const pat = drawPattern(skin, 'neo');
      if (skin.glow) {
        const g = drawPattern(skin, 'glow');
        const x = pat.getContext('2d');
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.9;
        x.drawImage(g, 0, 0);
      }
      url = pat.toDataURL();
    }
  } catch (e) { url = ''; }
  swatches[skin.id] = url;
  return url;
}

// ------------------------------------------------------------------ in game
// Materials per (skin, style), built the first time they are worn.
const cache = {};
const uniforms = { scale: { value: TILE }, flow: { value: 0 } };

function skinMaterials(game, skin, style) {
  const key = skin.id + '.' + style;
  if (cache[key]) return cache[key];
  const neo = style === 'neo';
  const ramp = game.materials.ramp;
  const gun = new THREE.MeshToonMaterial({ gradientMap: ramp, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const dark = new THREE.MeshToonMaterial({ gradientMap: ramp, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  if (neo) {
    gun.color.set(0xffffff);
    gun.map = texture(drawPattern(skin, 'neo'));
    if (skin.glow) { gun.emissive.set(skin.glow); gun.emissiveMap = texture(drawPattern(skin, 'glow')); }
    dark.color.set(skin.dark);
    if (skin.glow) dark.emissive.set(skin.glow).multiplyScalar(0.18);
  } else {
    // Classic is unlit: the emissive term carries the ink pattern
    gun.color.set(0x000000);
    gun.emissive.set(0xffffff);
    gun.emissiveMap = texture(drawPattern(skin, 'ink'));
    dark.color.set(0x000000);
    dark.emissive.set(0x161616);
  }
  triplanar(gun, uniforms);
  cache[key] = { gun, gunDark: dark };
  return cache[key];
}

// Dress the first-person guns in the worn skin for the current style, and
// tint the shared muzzle flash and tracer materials to match.
export function applySkin(game) {
  const skin = skinById(progress.skin);
  const worn = skinUnlocked(skin) ? skin : SKINS[0];
  game.skin = worn;
  const mats = worn.id === 'standard' ? null : skinMaterials(game, worn, game.style);
  for (const g of Object.values(game.vm.guns)) {
    g.group.traverse((o) => {
      if (!o.isMesh || (o.name !== 'role:gun' && o.name !== 'role:gunDark')) return;
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      const role = o.name.slice(5);
      o.material = mats ? mats[role] : o.userData.baseMat;
    });
  }
  tintEffects(game);
  // shared role materials get recoloured whenever the style is applied: tint
  // them again each time
  game.materials.onApply = () => tintEffects(game);
}

function tintEffects(game) {
  const m = game.materials;
  const glow = game.skin && game.skin.glow;
  if (!glow || m.style !== 'neo') return;
  m.get('tracerPlayer').color.setHex(glow);
  m.get('flash').color.setHex(glow);
  m.get('flashCore').color.set(0xffffff);
}

// Energy skins pulse and their lines flow along the gun.
export function updateSkin(game, realDt) {
  const skin = game.skin;
  if (!skin || !skin.glow) return;
  game.skinT = (game.skinT || 0) + realDt;
  const mats = cache[skin.id + '.' + game.style];
  if (!mats) return;
  mats.gun.emissiveIntensity = 0.75 + 0.5 * (0.5 + 0.5 * Math.sin(game.skinT * 3.4));
  uniforms.flow.value = (game.skinT * 0.35) % 1;
}

// Wear a skin (if it is earned) and save the choice.
export function wearSkin(game, id) {
  const skin = skinById(id);
  if (!skinUnlocked(skin)) return false;
  progress.skin = skin.id;
  saveProgress();
  applySkin(game);
  return true;
}
