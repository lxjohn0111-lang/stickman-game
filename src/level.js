// The map, in metres with north = -Z. Played in order:
//   1 roof (y = 5) -> 2 stair + locker room -> 3 kitchen -> 4 canteen
//   -> 5 fenced yard (water tower landmark, guard tower) -> 6 North Gate.
// Building footprint: x [-34, 3], z [0, 18]. Yard: x [-46, 16], z [-82, 0].
import * as THREE from 'three';
import { StaticBuilder } from './builder.js';
import { Door } from './doors.js';
import { NavGraph } from './nav.js';
import { MOVE, BULLET, SIGHT, SOLID } from './world.js';
import { makeTextTexture } from './textures.js';

const RY = 5.0; // roof top
const CEIL = 4.7; // interior ceiling
const BX0 = -34, BX1 = 3, BZ0 = 0, BZ1 = 18;
const EXT = 0.3; // exterior wall thickness
const INT = 0.2; // interior wall thickness
const PARAPET = 1.05;

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

export function buildLevel(scene, materials, world) {
  const b = new StaticBuilder(world);
  const doors = [];
  const map = { rects: [], circles: [], lines: [] };
  const signQuads = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ helpers
  // Short diagonal hatch strokes that mark glass (3-4 per pane, both faces).
  function hatch(axis, fixed, a0, a1, y0, y1, count = 4) {
    const w = a1 - a0, h = y1 - y0;
    const L = Math.min(0.42, Math.min(w, h) * 0.34);
    const ca = a0 + w * 0.3, cy = y0 + h * 0.58;
    for (const off of [-0.014, 0.014]) {
      for (let i = 0; i < count; i++) {
        const la = L * (i === 0 || i === count - 1 ? 0.62 : 1);
        const sa = ca + (i - (count - 1) / 2) * 0.1;
        const sy = cy + (i - (count - 1) / 2) * -0.02;
        const p0 = [sa - la * 0.35, sy - la * 0.35], p1 = [sa + la * 0.35, sy + la * 0.35];
        if (axis === 'x') b.line(p0[0], p0[1], fixed + off, p1[0], p1[1], fixed + off);
        else b.line(fixed + off, p0[1], p0[0], fixed + off, p1[1], p1[0]);
      }
    }
  }

  // Wall running along X (axis 'x', at z = fixed) or along Z (axis 'z', at
  // x = fixed), from a0 to a1 along its axis, thickness t, with openings
  // [{a, b, lo, hi, kind:'window'|'door'|'gap'}].
  function wall(role, axis, fixed, t, a0, a1, y0, y1, openings = [], opts = {}) {
    const ops = [...openings].sort((p, q) => p.a - q.a);
    const f0 = fixed - t / 2, f1 = fixed + t / 2;
    const put = (s0, s1, h0, h1) => {
      if (s1 - s0 < 1e-3 || h1 - h0 < 1e-3) return;
      if (axis === 'x') b.boxMM(role, s0, h0, f0, s1, h1, f1, opts);
      else b.boxMM(role, f0, h0, s0, f1, h1, s1, opts);
    };
    let cur = a0;
    for (const op of ops) {
      put(cur, op.a, y0, y1);
      put(op.a, op.b, y0, y0 + op.lo);
      put(op.a, op.b, y0 + op.hi, y1);
      if (op.kind === 'window') {
        const g0 = fixed - 0.01, g1 = fixed + 0.01;
        if (axis === 'x') b.boxMM('glass', op.a, y0 + op.lo, g0, op.b, y0 + op.hi, g1, { col: MOVE });
        else b.boxMM('glass', g0, y0 + op.lo, op.a, g1, y0 + op.hi, op.b, { col: MOVE });
        hatch(axis, fixed, op.a, op.b, y0 + op.lo, y0 + op.hi);
        // sill
        const s0 = fixed - t / 2 - 0.06, s1 = fixed + t / 2 + 0.06;
        if (axis === 'x') b.boxMM('frame', op.a - 0.05, y0 + op.lo - 0.05, s0, op.b + 0.05, y0 + op.lo, s1, { col: false });
        else b.boxMM('frame', s0, y0 + op.lo - 0.05, op.a - 0.05, s1, y0 + op.lo, op.b + 0.05, { col: false });
        // mullion cross
        const m = (op.a + op.b) / 2;
        if (axis === 'x') b.boxMM('frame', m - 0.025, y0 + op.lo, fixed - 0.03, m + 0.025, y0 + op.hi, fixed + 0.03, { col: false });
        else b.boxMM('frame', fixed - 0.03, y0 + op.lo, m - 0.025, fixed + 0.03, y0 + op.hi, m + 0.025, { col: false });
      }
      cur = op.b;
    }
    put(cur, a1, y0, y1);
    if (!opts.noMap && y0 < 1) {
      if (axis === 'x') map.rects.push({ x0: a0, z0: f0, x1: a1, z1: f1, k: 'wall' });
      else map.rects.push({ x0: f0, z0: a0, x1: f1, z1: a1, k: 'wall' });
    }
  }

  function addDoor(spec) {
    const d = new Door(spec);
    d.buildMesh(scene, materials);
    world.doors.push(d);
    doors.push(d);
    return d;
  }

  function signText(text, x, y, z, w, h, facing) {
    signQuads.push({ text, x, y, z, w, h, facing });
  }

  // ------------------------------------------------------------ ground
  const G = 400;
  b.boxMM('ground', -G, -0.4, -G, G, 0, BZ0, { col: false, edges: false });
  b.boxMM('ground', -G, -0.4, BZ1, G, 0, G, { col: false, edges: false });
  b.boxMM('ground', -G, -0.4, BZ0, BX0, 0, BZ1, { col: false, edges: false });
  b.boxMM('ground', BX1, -0.4, BZ0, G, 0, BZ1, { col: false, edges: false });
  // interior floors (canteen, kitchen tiles, stair room)
  b.boxMM('floor', BX0, -0.3, BZ0, -12, 0, BZ1, { col: false });
  b.boxMM('tile', -12, -0.3, BZ0, -3, 0, BZ1, { col: false });
  b.boxMM('floor', -3, -0.3, BZ0, BX1, 0, BZ1, { col: false });
  // kitchen floor tiles
  for (let x = -11.3; x < -3.1; x += 0.6) b.fenceLine(x, 0.004, 0.3, x, 0.004, 12.0);
  for (let z = 0.9; z < 12; z += 0.6) b.fenceLine(-11.9, 0.004, z, -3.1, 0.004, z);

  // ------------------------------------------------------------ building shell
  map.rects.push({ x0: BX0, z0: BZ0, x1: BX1, z1: BZ1, k: 'building' });
  // exterior walls
  wall('wallExt', 'x', BZ0 + EXT / 2, EXT, BX0, BX1, 0, CEIL, [
    { a: -30.1, b: -29.0, lo: 0, hi: 2.2, kind: 'door' },
    { a: -27.2, b: -25.2, lo: 1.1, hi: 2.4, kind: 'window' },
    { a: -23.0, b: -21.0, lo: 1.1, hi: 2.4, kind: 'window' },
    { a: -18.6, b: -17.5, lo: 0, hi: 2.2, kind: 'door' },
    { a: -15.6, b: -13.6, lo: 1.1, hi: 2.4, kind: 'window' },
    { a: -6.6, b: -4.6, lo: 1.1, hi: 2.3, kind: 'window' },
    { a: -1.0, b: 1.0, lo: 1.0, hi: 2.3, kind: 'window' },
  ]);
  wall('wallExt', 'x', BZ1 - EXT / 2, EXT, BX0, BX1, 0, CEIL, [
    { a: -30, b: -28, lo: 1.1, hi: 2.4, kind: 'window' },
    { a: -25, b: -23, lo: 1.1, hi: 2.4, kind: 'window' },
    { a: -20, b: -18, lo: 1.1, hi: 2.4, kind: 'window' },
    { a: -15.5, b: -13.5, lo: 1.1, hi: 2.4, kind: 'window' },
  ]);
  wall('wallExt', 'z', BX0 + EXT / 2, EXT, BZ0 + EXT, BZ1 - EXT, 0, CEIL, [
    { a: 12, b: 14, lo: 1.1, hi: 2.4, kind: 'window' },
  ]);
  wall('wallExt', 'z', BX1 - EXT / 2, EXT, BZ0 + EXT, BZ1 - EXT, 0, CEIL, []);
  // interior walls
  wall('wall', 'z', -3.0, INT, BZ0 + EXT, BZ1 - EXT, 0, CEIL, [{ a: 2.4, b: 3.4, lo: 0, hi: 2.1, kind: 'door' }]);
  wall('wall', 'z', -12.0, INT, BZ0 + EXT, BZ1 - EXT, 0, CEIL, [{ a: 9.2, b: 10.2, lo: 0, hi: 2.1, kind: 'door' }]);
  wall('wall', 'x', 12.1, INT, -11.9, -3.1, 0, CEIL, []);
  wall('wall', 'x', 14.1, INT, -2.9, BX1 - EXT, 0, CEIL, []);

  // roof slab with the stair opening x[-0.8,0.8] z[9.2,14]
  const slabs = [[BX0, BZ0, BX1, 9.2], [BX0, 14, BX1, BZ1], [BX0, 9.2, -0.8, 14], [0.8, 9.2, BX1, 14]];
  for (const [x0, z0, x1, z1] of slabs) {
    b.boxMM('ceiling', x0, CEIL, z0, x1, RY - 0.05, z1, { col: false, edges: false });
    b.boxMM('roof', x0, RY - 0.05, z0, x1, RY, z1, { col: false, edges: false });
    b.collider(x0, CEIL, z0, x1, RY, z1, SOLID, 'roof');
  }
  // outline of the slab band on the facade and around the opening
  for (const y of [CEIL, RY]) {
    b.line(BX0, y, BZ0, BX1, y, BZ0); b.line(BX0, y, BZ1, BX1, y, BZ1);
    b.line(BX0, y, BZ0, BX0, y, BZ1); b.line(BX1, y, BZ0, BX1, y, BZ1);
    b.line(-0.8, y, 9.2, 0.8, y, 9.2); b.line(-0.8, y, 9.2, -0.8, y, 14); b.line(0.8, y, 9.2, 0.8, y, 14);
  }
  for (const [x, z] of [[BX0, BZ0], [BX1, BZ0], [BX0, BZ1], [BX1, BZ1], [-0.8, 9.2], [0.8, 9.2]]) b.line(x, CEIL, z, x, RY, z);

  // parapet (1.05 m: higher than the 0.84 m jump apex)
  const PY1 = RY + PARAPET;
  b.boxMM('parapet', BX0, RY, BZ0, BX1, PY1, BZ0 + EXT);
  b.boxMM('parapet', BX0, RY, BZ1 - EXT, BX1, PY1, BZ1);
  b.boxMM('parapet', BX0, RY, BZ0 + EXT, BX0 + EXT, PY1, BZ1 - EXT);
  b.boxMM('parapet', BX1 - EXT, RY, BZ0 + EXT, BX1, PY1, BZ1 - EXT);

  // ------------------------------------------------------------ 1. roof
  // stair hut: interior x[-1,1] z[9.2,15.6]; door on the south face opens onto the roof
  const HY1 = RY + 2.6;
  b.boxMM('wallExt', -1.2, RY, 9.0, -1.0, HY1, 15.8);
  b.boxMM('wallExt', 1.0, RY, 9.0, 1.2, HY1, 15.8);
  b.boxMM('wallExt', -1.0, RY, 9.0, 1.0, HY1, 9.2);
  wall('wallExt', 'x', 15.7, 0.2, -1.0, 1.0, RY, HY1, [{ a: -0.45, b: 0.45, lo: 0, hi: 2.1, kind: 'door' }], { noMap: true });
  b.boxMM('roof', -1.35, HY1, 8.85, 1.35, HY1 + 0.2, 15.95);
  b.box('lamp', 0, HY1 - 0.04, 12.5, 0.3, 0.06, 0.3, { col: false });
  map.rects.push({ x0: -1.2, z0: 9.0, x1: 1.2, z1: 15.8, k: 'hut' });
  addDoor({ hx: -0.45, hz: 15.7, angle: 0, w: 0.9, h: 2.08, y0: RY, name: 'Stair hut' });

  // AC units
  function acUnit(x, z, rot = false) {
    const sx = rot ? 1.2 : 1.8, sz = rot ? 1.8 : 1.2;
    b.boxMM('appliance', x - sx / 2, RY, z - sz / 2, x + sx / 2, RY + 1.2, z + sz / 2);
    b.boxMM('appliance', x - sx / 2 + 0.1, RY - 0.001, z - sz / 2 + 0.1, x + sx / 2 - 0.1, RY + 0.12, z + sz / 2 - 0.1, { col: false });
    b.cyl('ink', x, RY + 1.23, z, 0.42, 0.42, 0.06, 16, { edges: false });
    b.cyl('appliance', x, RY + 1.25, z, 0.1, 0.1, 0.04, 8);
    // side grille strokes
    const fz = z + sz / 2 + 0.003;
    for (let i = 0; i < 6; i++) b.fenceLine(x - sx / 2 + 0.15, RY + 0.3 + i * 0.12, fz, x + sx / 2 - 0.15, RY + 0.3 + i * 0.12, fz);
    map.rects.push({ x0: x - sx / 2, z0: z - sz / 2, x1: x + sx / 2, z1: z + sz / 2, k: 'prop' });
  }
  acUnit(-8.5, 4.2);
  acUnit(-15.5, 13.6);
  acUnit(-22.5, 4.8, true);
  acUnit(-28, 14.2);
  acUnit(-5.5, 12.2, true);
  // mushroom vents
  function vent(x, z) {
    b.cyl('steel', x, RY + 0.3, z, 0.18, 0.2, 0.6, 8);
    b.cyl('steel', x, RY + 0.7, z, 0.02, 0.34, 0.22, 8);
    b.collider(x - 0.25, RY, z - 0.25, x + 0.25, RY + 0.8, z + 0.25);
  }
  vent(-12, 9); vent(-19, 10.5); vent(-26, 2.6); vent(-31.5, 15.5); vent(-3.5, 2.4); vent(-11.5, 16.2);
  // pipe vents
  function pipe(x, z) {
    b.rod('steel', V(x, RY, z), V(x, RY + 0.9, z), 0.06, 6);
    b.rod('steel', V(x, RY + 0.9, z), V(x + 0.35, RY + 0.9, z), 0.06, 6);
    b.collider(x - 0.1, RY, z - 0.1, x + 0.1, RY + 0.95, z + 0.1);
  }
  pipe(-17, 1.2); pipe(-9, 16.8); pipe(-24.5, 11);
  // antenna mast
  b.rod('steel', V(-32.3, RY, 1.5), V(-32.3, RY + 3.2, 1.5), 0.04, 6);
  b.rod('steel', V(-32.8, RY + 2.6, 1.5), V(-31.8, RY + 2.6, 1.5), 0.02, 6);
  b.rod('steel', V(-32.6, RY + 3.0, 1.5), V(-32.0, RY + 3.0, 1.5), 0.02, 6);
  b.collider(-32.45, RY, 1.35, -32.15, RY + 3.2, 1.65);
  // roof drains / edge details: small boxes near parapet
  for (const x of [-30, -20, -10]) b.box('ink', x, RY + 0.02, BZ0 + EXT + 0.15, 0.3, 0.04, 0.2, { col: false });

  // ------------------------------------------------------------ 2. stair + locker room
  // 20 steps, 0.25 m rise, 0.4 m run, descending north from the hut landing.
  const treadTop = (k) => RY - 0.25 * k;
  for (let k = 0; k < 20; k++) {
    const za = 14 - 0.4 * (k + 1), zb = 14 - 0.4 * k;
    const top = treadTop(k);
    b.boxMM('concrete', -0.8, 0, za, 0.8, top, zb, { edges: false, tag: 'stair' });
    const nextTop = top - 0.25;
    // nose + riser + stepped side profile
    b.line(-0.8, top, za, 0.8, top, za);
    b.line(-0.8, nextTop, za, 0.8, nextTop, za);
    for (const x of [-0.8, 0.8]) {
      b.line(x, top, za, x, top, zb);
      b.line(x, nextTop, za, x, top, za);
    }
    // rails block stepping off the side of the stair
    b.collider(-0.8, top, za, -0.72, top + 1.0, zb, MOVE);
    b.collider(0.72, top, za, 0.8, top + 1.0, zb, MOVE);
  }
  for (const x of [-0.8, 0.8]) b.line(x, 0, 6, x, 0, 14);
  // handrails on both sides
  const railY = (z) => RY + 0.95 - 0.625 * (13.8 - z);
  for (const x of [-0.76, 0.76]) {
    b.rod('steel', V(x, railY(13.8), 13.8), V(x, railY(6.2), 6.2), 0.03, 6);
    b.rod('steel', V(x, railY(13.8) - 0.45, 13.8), V(x, railY(6.2) - 0.45, 6.2), 0.018, 6);
    for (const k of [0, 3, 6, 9, 12, 15, 19]) {
      const z = 14 - 0.4 * k - 0.2;
      b.rod('steel', V(x, treadTop(k), z), V(x, railY(z), z), 0.022, 6);
    }
  }
  map.rects.push({ x0: -0.8, z0: 6, x1: 0.8, z1: 14, k: 'stair' });
  // lockers on the right (east wall)
  for (const [z0, z1] of [[2.0, 2.56], [2.6, 3.16]]) {
    b.boxMM('locker', 2.2, 0, z0, 2.7, 1.9, z1);
    const fx = 2.198;
    for (let i = 0; i < 4; i++) b.line(fx, 1.62 + i * 0.05, z0 + 0.12, fx, 1.62 + i * 0.05, z1 - 0.12);
    b.box('ink', fx - 0.02, 1.0, z1 - 0.1, 0.03, 0.18, 0.03, { col: false });
    b.line(fx, 0.08, z0 + 0.04, fx, 1.84, z0 + 0.04);
    map.rects.push({ x0: 2.2, z0, x1: 2.7, z1, k: 'prop' });
  }
  b.boxMM('table', 1.35, 0.42, 2.0, 1.75, 0.47, 3.2, { col: MOVE });
  b.box('steel', 1.4, 0.21, 2.1, 0.05, 0.42, 0.05, { col: false });
  b.box('steel', 1.4, 0.21, 3.1, 0.05, 0.42, 0.05, { col: false });
  b.box('steel', 1.7, 0.21, 2.1, 0.05, 0.42, 0.05, { col: false });
  b.box('steel', 1.7, 0.21, 3.1, 0.05, 0.42, 0.05, { col: false });
  b.collider(1.35, 0, 2.0, 1.75, 0.47, 3.2, MOVE);
  b.box('lamp', 0, CEIL - 0.04, 3.0, 0.8, 0.06, 0.3, { col: false });
  // side door on the left (west wall) into the kitchen
  addDoor({ hx: -3.0, hz: 2.44, angle: Math.PI / 2, w: 0.92, name: 'Kitchen door' });

  // ------------------------------------------------------------ 3. kitchen
  // serving counter with trays; an enemy waits behind it
  b.boxMM('counter', -9.0, 0, 0.3, -8.2, 0.95, 8.0);
  b.boxMM('steel', -9.12, 0.95, 0.3, -8.08, 1.02, 8.1, { col: false });
  b.collider(-9.12, 0.95, 0.3, -8.08, 1.02, 8.1);
  b.line(-8.2 + 0.002, 0.12, 0.3, -8.2 + 0.002, 0.12, 8.0);
  b.line(-9.0 - 0.002, 0.12, 0.3, -9.0 - 0.002, 0.12, 8.0);
  // sneeze guard
  b.boxMM('glass', -8.7, 1.35, 0.3, -8.66, 1.75, 8.0, { col: false });
  hatch('z', -8.68, 3.0, 4.2, 1.35, 1.75, 3);
  for (const z of [0.5, 4.1, 7.8]) b.rod('steel', V(-8.68, 1.02, z), V(-8.68, 1.78, z), 0.015, 6);
  // tray slide
  b.rod('steel', V(-7.95, 0.9, 0.4), V(-7.95, 0.9, 7.9), 0.02, 6);
  b.rod('steel', V(-7.75, 0.9, 0.4), V(-7.75, 0.9, 7.9), 0.02, 6);
  for (const z of [0.6, 4.1, 7.6]) b.box('steel', -7.9, 0.88, z, 0.4, 0.03, 0.03, { col: false });
  const trayZ = [1.1, 2.4, 3.7, 5.0, 6.3, 7.4];
  trayZ.forEach((z, i) => {
    b.box('tray', -8.6, 1.04, z, 0.34, 0.03, 0.46, { col: false });
    if (i % 2 === 0) {
      b.cyl('food', -8.6, 1.09, z - 0.1, 0.09, 0.07, 0.08, 10);
      b.box('food', -8.62, 1.08, z + 0.12, 0.14, 0.05, 0.1, { col: false });
    } else {
      b.cyl('food', -8.58, 1.08, z + 0.05, 0.11, 0.1, 0.05, 10);
    }
  });
  map.rects.push({ x0: -9.0, z0: 0.3, x1: -8.2, z1: 8.0, k: 'prop' });
  // stoves + hood along the kitchen's back wall
  b.boxMM('appliance', -7.8, 0, 11.2, -3.6, 0.9, 12.0);
  for (let i = 0; i < 4; i++) {
    const x = -7.2 + i * 1.05;
    b.cyl('ink', x - 0.2, 0.92, 11.45, 0.14, 0.14, 0.03, 12, { edges: false });
    b.cyl('ink', x + 0.2, 0.92, 11.75, 0.14, 0.14, 0.03, 12, { edges: false });
    b.line(x - 0.35, 0.15, 11.198, x + 0.35, 0.15, 11.198);
    b.line(x - 0.35, 0.65, 11.198, x + 0.35, 0.65, 11.198);
    b.line(x - 0.35, 0.15, 11.198, x - 0.35, 0.65, 11.198);
    b.line(x + 0.35, 0.15, 11.198, x + 0.35, 0.65, 11.198);
    b.box('ink', x, 0.78, 11.18, 0.4, 0.03, 0.03, { col: false });
  }
  b.cyl('steel', -6.4, 1.08, 11.5, 0.2, 0.18, 0.32, 12);
  b.cyl('steel', -4.5, 1.02, 11.7, 0.22, 0.22, 0.18, 12);
  b.boxMM('steel', -7.8, 2.1, 11.2, -3.6, 2.45, 12.0);
  b.boxMM('steel', -7.3, 2.45, 11.5, -4.1, 4.7, 11.9, { col: false });
  map.rects.push({ x0: -7.8, z0: 11.2, x1: -3.6, z1: 12, k: 'prop' });
  // prep island with pots
  b.boxMM('steel', -6.6, 0, 5.5, -4.6, 0.9, 7.0);
  b.boxMM('steel', -6.5, 0.1, 5.6, -4.7, 0.14, 6.9, { col: false });
  b.cyl('appliance', -6.1, 1.06, 6.0, 0.2, 0.2, 0.3, 12);
  b.cyl('appliance', -5.3, 1.02, 6.5, 0.16, 0.16, 0.22, 12);
  b.box('tray', -5.0, 0.93, 5.9, 0.45, 0.04, 0.3, { col: false });
  map.rects.push({ x0: -6.6, z0: 5.5, x1: -4.6, z1: 7.0, k: 'prop' });
  // fridge
  b.boxMM('appliance', -3.9, 0, 8.3, -3.1, 2.05, 9.5);
  b.line(-3.902, 1.3, 8.35, -3.902, 1.3, 9.45);
  b.box('ink', -3.93, 1.65, 9.35, 0.03, 0.4, 0.04, { col: false });
  b.box('ink', -3.93, 0.9, 9.35, 0.03, 0.4, 0.04, { col: false });
  map.rects.push({ x0: -3.9, z0: 8.3, x1: -3.1, z1: 9.5, k: 'prop' });
  // shelving on the west wall of the serving side
  b.boxMM('steel', -11.9, 0, 1.0, -11.45, 1.8, 3.6);
  for (const y of [0.5, 1.0, 1.5]) b.line(-11.448, y, 1.0, -11.448, y, 3.6);
  b.box('crate', -11.65, 0.72, 1.5, 0.35, 0.4, 0.5, { col: false });
  b.box('crate', -11.65, 1.22, 2.6, 0.35, 0.4, 0.6, { col: false });
  b.cyl('food', -11.65, 0.25, 3.1, 0.14, 0.14, 0.4, 10);
  map.rects.push({ x0: -11.9, z0: 1.0, x1: -11.45, z1: 3.6, k: 'prop' });
  // bins
  b.cyl('steel', -10.8, 0.4, 7.2, 0.28, 0.24, 0.8, 10);
  b.collider(-11.1, 0, 6.9, -10.5, 0.8, 7.5);
  b.box('lamp', -7.5, CEIL - 0.04, 3.5, 1.2, 0.06, 0.3, { col: false });
  b.box('lamp', -7.5, CEIL - 0.04, 8.5, 1.2, 0.06, 0.3, { col: false });
  addDoor({ hx: -12.0, hz: 9.24, angle: Math.PI / 2, w: 0.92, name: 'Canteen door' });

  // ------------------------------------------------------------ 4. canteen
  const tableX = [-29.5, -25.5, -21.5, -17.5];
  const tableZ = [5.0, 9.5, 14.0];
  for (const cx of tableX) {
    for (const cz of tableZ) {
      b.box('table', cx, 0.745, cz, 2.4, 0.05, 0.9, { col: false });
      for (const [lx, lz] of [[-1.08, -0.35], [1.08, -0.35], [-1.08, 0.35], [1.08, 0.35]]) {
        b.box('table', cx + lx, 0.36, cz + lz, 0.06, 0.72, 0.06, { col: false });
      }
      b.collider(cx - 1.2, 0, cz - 0.45, cx + 1.2, 0.77, cz + 0.45, MOVE);
      b.collider(cx - 1.2, 0.69, cz - 0.45, cx + 1.2, 0.77, cz + 0.45, BULLET);
      map.rects.push({ x0: cx - 1.2, z0: cz - 0.45, x1: cx + 1.2, z1: cz + 0.45, k: 'table' });
      // four chairs, backs away from the table
      for (const sx of [-0.6, 0.6]) {
        for (const sz of [-1, 1]) {
          const x = cx + sx, z = cz + sz * 0.78;
          b.box('chair', x, 0.45, z, 0.42, 0.04, 0.42, { col: false });
          b.box('chair', x, 0.7, z + sz * 0.19, 0.42, 0.46, 0.04, { col: false });
          for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
            b.box('chair', x + lx, 0.22, z + lz, 0.035, 0.44, 0.035, { col: false });
          }
          b.collider(x - 0.22, 0, z - 0.22, x + 0.22, 0.93, z + 0.22, MOVE);
        }
      }
    }
  }
  // exit doors in the north wall, with EXIT signs above (room side)
  for (const x0 of [-30.1, -18.6]) {
    addDoor({ hx: x0 + 0.04, hz: BZ0 + EXT / 2, angle: 0, w: 1.02, h: 2.18, name: 'Exit' });
    const cx = x0 + 0.55;
    b.box('sign', cx, 2.58, BZ0 + EXT + 0.05, 0.72, 0.28, 0.1, { col: false });
    signText('EXIT', cx, 2.58, BZ0 + EXT + 0.101, 0.6, 0.22, 1);
    b.box('sign', cx, 2.58, BZ0 - 0.05, 0.72, 0.28, 0.1, { col: false });
    signText('EXIT', cx, 2.58, BZ0 - 0.101, 0.6, 0.22, -1);
    // push bar
    b.box('ink', cx, 1.0, BZ0 + EXT + 0.02, 0.1, 0.02, 0.02, { col: false });
  }
  // vending machines on the west wall
  for (const [z0, z1] of [[5.9, 6.95], [7.05, 8.1], [8.2, 9.25]]) {
    b.boxMM('vending', BX0 + EXT, 0, z0, BX0 + EXT + 0.85, 1.95, z1);
    const fx = BX0 + EXT + 0.852;
    b.boxMM('glass', fx - 0.01, 0.75, z0 + 0.1, fx + 0.01, 1.8, z1 - 0.32, { col: false });
    hatch('z', fx + 0.01, z0 + 0.1, z1 - 0.32, 0.75, 1.8, 3);
    for (let i = 0; i < 4; i++) b.line(fx + 0.005, 1.0 + i * 0.22, z0 + 0.12, fx + 0.005, 1.0 + i * 0.22, z1 - 0.34);
    for (let i = 0; i < 5; i++) b.box('ink', fx + 0.01, 1.2 + i * 0.1, z1 - 0.16, 0.02, 0.05, 0.08, { col: false });
    b.box('ink', fx + 0.01, 0.35, (z0 + z1) / 2 - 0.1, 0.02, 0.16, 0.5, { col: false });
    map.rects.push({ x0: BX0 + EXT, z0, x1: BX0 + EXT + 0.85, z1, k: 'prop' });
  }
  // bins, clock, lamps
  for (const [x, z] of [[-31.6, 1.2], [-16.2, 1.2]]) {
    b.cyl('steel', x, 0.42, z, 0.27, 0.23, 0.84, 10);
    b.collider(x - 0.28, 0, z - 0.28, x + 0.28, 0.84, z + 0.28);
  }
  b.cyl('frame', -23, 3.3, BZ1 - EXT - 0.03, 0.3, 0.3, 0.05, 16, { rx: Math.PI / 2 });
  b.line(-23, 3.3, BZ1 - EXT - 0.06, -23, 3.5, BZ1 - EXT - 0.06);
  b.line(-23, 3.3, BZ1 - EXT - 0.06, -22.86, 3.24, BZ1 - EXT - 0.06);
  for (const x of tableX) for (const z of [5.0, 9.5, 14.0]) b.box('lamp', x, CEIL - 0.04, z, 1.2, 0.06, 0.3, { col: false });

  // ------------------------------------------------------------ 5. yard
  // chain-link fence: posts, rails, diamond lattice, barbed wire.
  // Blocks movement only, so bullets pass through.
  function fence(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L;
    const H = 2.3;
    const nPosts = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= nPosts; i++) {
      const t = (i / nPosts) * L;
      const x = ax + ux * t, z = az + uz * t;
      b.cyl('steel', x, H / 2 + 0.1, z, 0.045, 0.045, H + 0.2, 6);
      b.rod('steel', V(x, H + 0.2, z), V(x - uz * 0.25, H + 0.45, z + ux * 0.25), 0.015, 4, { edges: false });
    }
    b.rod('steel', V(ax, H, az), V(bx, H, bz), 0.025, 6);
    b.rod('steel', V(ax, 0.08, az), V(bx, 0.08, bz), 0.015, 4, { edges: false });
    // barbed wire strands
    for (let s = 0; s < 2; s++) {
      const off = 0.1 + s * 0.12, hy = H + 0.25 + s * 0.12;
      b.line(ax - uz * off, hy, az + ux * off, bx - uz * off, hy, bz + ux * off);
      for (let t = 0.2; t < L; t += 0.5) {
        const x = ax + ux * t - uz * off, z = az + uz * t + ux * off;
        b.fenceLine(x - ux * 0.05, hy - 0.05, z - uz * 0.05, x + ux * 0.05, hy + 0.05, z + uz * 0.05);
      }
    }
    // diamond lattice
    const S = 0.3, y0 = 0.08, y1 = H;
    const hh = y1 - y0;
    for (let s0 = -hh; s0 < L; s0 += S) {
      for (const dir of [1, -1]) {
        // line u = s0 + (y - y0) (dir=1) or u = s0 + hh - (y - y0) (dir=-1)
        let uA, yA, uB, yB;
        if (dir === 1) { uA = s0; yA = y0; uB = s0 + hh; yB = y1; } else { uA = s0; yA = y1; uB = s0 + hh; yB = y0; }
        // clip to [0, L]
        if (uA < 0) { const k = -uA / (uB - uA); yA = yA + (yB - yA) * k; uA = 0; }
        if (uB > L) { const k = (L - uA) / (uB - uA); yB = yA + (yB - yA) * k; uB = L; }
        if (uB - uA < 0.01) continue;
        b.fenceLine(ax + ux * uA, yA, az + uz * uA, ax + ux * uB, yB, az + uz * uB);
      }
    }
    const t = 0.05;
    b.collider(Math.min(ax, bx) - t, 0, Math.min(az, bz) - t, Math.max(ax, bx) + t, 2.6, Math.max(az, bz) + t, MOVE, 'fence');
    map.lines.push({ ax, az, bx, bz, k: 'fence' });
  }
  const YX0 = -46, YX1 = 16, YZ1 = -82;
  const GATE0 = -17.5, GATE1 = -11.5;
  fence(YX0, -0.1, BX0, -0.1);
  fence(BX1, -0.1, YX1, -0.1);
  fence(YX0, -0.1, YX0, YZ1);
  fence(YX1, -0.1, YX1, YZ1);
  fence(YX0, YZ1, GATE0 - 0.6, YZ1);
  fence(GATE1 + 0.6, YZ1, YX1, YZ1);
  // inner fence splitting the yard, open in the middle
  fence(YX0, -34, -24, -34);
  fence(-6, -34, YX1, -34);

  // paths
  const path = (x0, z0, x1, z1) => {
    b.boxMM('path', x0, 0, z0, x1, 0.015, z1, { col: false });
    map.rects.push({ x0, z0, x1, z1, k: 'path' });
  };
  path(-30.4, -9, -28.6, 0);
  path(-19, -9, -17.2, 0);
  path(-31, -11, -8, -9);
  path(-15.6, -50.4, -12.4, -11);
  path(-15.6, -130, -12.4, -61.6);

  // gable-roofed barracks (closed buildings)
  function barracks(x0, z0, x1, z1, doorSide) {
    b.boxMM('barracks', x0, 0, z0, x1, 3.0, z1);
    const w = x1 - x0 + 0.8, L = z1 - z0 + 0.8, H = 1.8;
    // triangular prism: CylinderGeometry with 3 sides, laid along Z
    b.cyl('barracksRoof', (x0 + x1) / 2, 3.0 + H / 3, (z0 + z1) / 2, 1, 1, L, 3, {
      rx: -Math.PI / 2, sx: w / 2 / 0.866, sz: H / 1.5,
    });
    b.collider(x0 - 0.4, 3.0, z0 - 0.4, x1 + 0.4, 3.0 + H * 0.6, z1 + 0.4);
    const fx = doorSide > 0 ? x1 + 0.002 : x0 - 0.002;
    const s = doorSide;
    const zc = (z0 + z1) / 2;
    b.boxMM('door', Math.min(fx, fx + s * 0.06), 0, zc - 0.55, Math.max(fx, fx + s * 0.06), 2.15, zc + 0.55, { col: false });
    b.boxMM('concrete', Math.min(fx, fx + s * 0.8), 0, zc - 0.9, Math.max(fx, fx + s * 0.8), 0.18, zc + 0.9);
    b.box('lamp', fx + s * 0.1, 2.5, zc, 0.2, 0.12, 0.3, { col: false });
    for (const wz of [z0 + 2.2, z0 + 5, z1 - 5, z1 - 2.2]) {
      b.boxMM('glass', Math.min(fx, fx + s * 0.03), 1.0, wz - 0.6, Math.max(fx, fx + s * 0.03), 2.1, wz + 0.6, { col: false });
      hatch('z', fx + s * 0.035, wz - 0.6, wz + 0.6, 1.0, 2.1, 3);
      const px = fx + s * 0.04;
      b.line(px, 1.55, wz - 0.6, px, 1.55, wz + 0.6);
    }
    // back-side windows
    const bx = doorSide > 0 ? x0 - 0.002 : x1 + 0.002;
    for (const wz of [z0 + 3.5, z1 - 3.5]) {
      b.boxMM('glass', Math.min(bx, bx - s * 0.03), 1.0, wz - 0.6, Math.max(bx, bx - s * 0.03), 2.1, wz + 0.6, { col: false });
      hatch('z', bx - s * 0.035, wz - 0.6, wz + 0.6, 1.0, 2.1, 3);
    }
    map.rects.push({ x0, z0, x1, z1, k: 'block' });
  }
  barracks(-42.5, -26, -34.5, -10, 1);
  barracks(-42.5, -64, -34.5, -46, 1);
  barracks(4.5, -27, 12.5, -11, -1);

  // pine trees: 7-sided cones
  function pine(x, z, s = 1) {
    b.cyl('trunk', x, 0.65 * s, z, 0.13 * s, 0.17 * s, 1.3 * s, 7);
    b.cyl('pine', x, 2.1 * s, z, 0, 1.65 * s, 2.3 * s, 7);
    b.cyl('pine', x, 3.35 * s, z, 0, 1.25 * s, 2.0 * s, 7, { ry: 0.4 });
    b.cyl('pine', x, 4.5 * s, z, 0, 0.85 * s, 1.7 * s, 7, { ry: 0.8 });
    b.collider(x - 0.22 * s, 0, z - 0.22 * s, x + 0.22 * s, 3 * s, z + 0.22 * s);
    map.circles.push({ x, z, r: 1.4 * s, k: 'tree' });
  }
  const trees = [
    [-44, -4, 1], [-44, -31, 1.1], [-44.2, -70, 1], [-43.8, -79, 0.9], [14, -4, 1], [14, -37, 1.1], [14, -61, 1],
    [13.5, -79, 0.95], [-30, -80, 1], [2, -80, 1.1], [-3, -39, 0.9], [-26, -45, 0.85],
    [-52, -12, 1.2], [-55, -40, 1.3], [-51, -70, 1.1], [-58, -90, 1.2], [22, -20, 1.2], [25, -50, 1.3], [21, -78, 1.1],
    [-25, -91, 1.2], [-5, -93, 1.1], [-22, -104, 1.3], [-6, -110, 1.2], [8, -96, 1.2], [-36, -96, 1.1], [-44, -110, 1.3],
    [18, -108, 1.2], [-20, 26, 1.2], [-6, 30, 1.3], [10, 23, 1.1], [-40, 24, 1.2], [-52, 10, 1.1], [14, 8, 1.2],
  ];
  for (const [x, z, s] of trees) pine(x, z, s);

  // lamp posts + overhead cables
  const lampTops = [];
  function lampPost(x, z) {
    b.cyl('steel', x, 3.0, z, 0.06, 0.09, 6.0, 6);
    b.box('steel', x + 0.45, 5.9, z, 0.9, 0.07, 0.07, { col: false });
    b.box('lamp', x + 0.85, 5.8, z, 0.45, 0.14, 0.26, { col: false });
    b.box('ink', x + 0.85, 5.72, z, 0.36, 0.02, 0.18, { col: false });
    b.collider(x - 0.14, 0, z - 0.14, x + 0.14, 6, z + 0.14);
    lampTops.push(V(x, 5.95, z));
    map.circles.push({ x, z, r: 0.3, k: 'lamp' });
  }
  const lamps = [[-24, -5], [-9, -13], [-21, -28], [-6, -38], [-25, -52], [-5, -58], [-24, -72], [-7, -78]];
  for (const [x, z] of lamps) lampPost(x, z);
  function cable(a, c, sag = 0.55, seg = 10) {
    let prev = a;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const p = V(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (c.z - a.z) * t);
      b.line(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  }
  for (let i = 0; i < lampTops.length - 1; i++) cable(lampTops[i], lampTops[i + 1], 0.6);
  cable(V(-24, RY + PARAPET, 0.1), lampTops[0], 0.5);
  cable(V(-9, RY + PARAPET, 0.1), lampTops[1], 0.6);
  // pole line along the east fence
  for (let z = -8; z > -80; z -= 18) {
    b.cyl('trunk', 19, 3.5, z, 0.1, 0.13, 7, 6);
    b.box('trunk', 19, 6.6, z, 1.4, 0.1, 0.1, { col: false });
  }
  for (let z = -8; z > -62; z -= 18) {
    for (const dx of [-0.6, 0.6]) cable(V(19 + dx, 6.65, z), V(19 + dx, 6.65, z - 18), 0.7);
  }

  // water tower (the landmark) on a concrete pad
  const WX = -14, WZ = -56;
  b.boxMM('concrete', WX - 5.5, 0, WZ - 5.5, WX + 5.5, 0.25, WZ + 5.5);
  map.rects.push({ x0: WX - 5.5, z0: WZ - 5.5, x1: WX + 5.5, z1: WZ + 5.5, k: 'pad' });
  const legB = [[-4, -4], [4, -4], [4, 4], [-4, 4]];
  const legTop = 10.5, legIn = 1.6;
  const legAt = (i, y) => {
    const t = (y - 0.25) / (legTop - 0.25);
    const [lx, lz] = legB[i];
    const k = 1 - (legIn / 4) * t;
    return V(WX + lx * k, y, WZ + lz * k);
  };
  for (let i = 0; i < 4; i++) {
    b.rod('steel', legAt(i, 0.25), legAt(i, legTop), 0.17, 8);
    const p = legAt(i, 0.25);
    b.box('concrete', p.x, 0.45, p.z, 0.6, 0.4, 0.6);
    b.collider(p.x - 0.35, 0, p.z - 0.35, p.x + 0.35, 3.0, p.z + 0.35);
  }
  const levels = [0.25, 3.7, 7.1, legTop];
  for (let l = 1; l < levels.length; l++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      b.rod('steel', legAt(i, levels[l]), legAt(j, levels[l]), 0.07, 6);
      b.rod('steel', legAt(i, levels[l - 1]), legAt(j, levels[l]), 0.04, 4);
      b.rod('steel', legAt(j, levels[l - 1]), legAt(i, levels[l]), 0.04, 4);
    }
  }
  b.cyl('steel', WX, legTop - 0.05, WZ, 4.3, 4.3, 0.12, 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, a2 = ((i + 1) / 12) * Math.PI * 2;
    const p = V(WX + Math.sin(a) * 4.2, legTop, WZ + Math.cos(a) * 4.2);
    const q = V(WX + Math.sin(a2) * 4.2, legTop, WZ + Math.cos(a2) * 4.2);
    b.rod('steel', p, V(p.x, legTop + 1.0, p.z), 0.025, 4, { edges: false });
    b.line(p.x, legTop + 1.0, p.z, q.x, legTop + 1.0, q.z);
    b.line(p.x, legTop + 0.5, p.z, q.x, legTop + 0.5, q.z);
  }
  b.cyl('tank', WX, legTop + 2.0, WZ, 3.4, 3.4, 3.9, 12);
  b.cyl('tank', WX, legTop + 4.75, WZ, 0.2, 3.6, 1.6, 12);
  b.cyl('steel', WX, legTop + 5.7, WZ, 0.06, 0.06, 0.5, 6);
  for (const y of [legTop + 0.9, legTop + 2.9]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, a2 = ((i + 1) / 12) * Math.PI * 2;
      b.fenceLine(WX + Math.sin(a) * 3.405, y, WZ + Math.cos(a) * 3.405, WX + Math.sin(a2) * 3.405, y, WZ + Math.cos(a2) * 3.405);
    }
  }
  // ladder up one leg
  {
    const p0 = legAt(2, 0.25), p1 = legAt(2, legTop);
    for (const off of [-0.25, 0.25]) b.rod('steel', V(p0.x + 0.5, 0.25, p0.z + off), V(p1.x + 0.5, legTop, p1.z + off), 0.025, 4, { edges: false });
    for (let y = 0.6; y < legTop; y += 0.4) {
      const q = legAt(2, y);
      b.line(q.x + 0.5, y, q.z - 0.25, q.x + 0.5, y, q.z + 0.25);
    }
  }
  map.circles.push({ x: WX, z: WZ, r: 3.4, k: 'watertower' });

  // guard tower with a sniper platform
  const TX = 9, TZ = -46, TY = 6.0;
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    b.boxMM('crate', TX + dx - 0.15, 0, TZ + dz - 0.15, TX + dx + 0.15, TY, TZ + dz + 0.15);
  }
  for (const [ax, az, bx, bz] of [[-1.7, -1.7, 1.7, -1.7], [1.7, -1.7, 1.7, 1.7], [1.7, 1.7, -1.7, 1.7], [-1.7, 1.7, -1.7, -1.7]]) {
    b.rod('steel', V(TX + ax, 0.3, TZ + az), V(TX + bx, 3.0, TZ + bz), 0.04, 4);
    b.rod('steel', V(TX + bx, 0.3, TZ + bz), V(TX + ax, 3.0, TZ + az), 0.04, 4);
    b.rod('steel', V(TX + ax, 3.0, TZ + az), V(TX + bx, 5.8, TZ + bz), 0.04, 4);
    b.rod('steel', V(TX + bx, 3.0, TZ + bz), V(TX + ax, 5.8, TZ + az), 0.04, 4);
  }
  b.boxMM('crate', TX - 2.1, TY, TZ - 2.1, TX + 2.1, TY + 0.25, TZ + 2.1);
  const TW = TY + 0.25;
  b.boxMM('barracks', TX - 2.1, TW, TZ - 2.1, TX + 2.1, TW + 1.0, TZ - 2.0);
  b.boxMM('barracks', TX - 2.1, TW, TZ + 2.0, TX + 2.1, TW + 1.0, TZ + 2.1);
  b.boxMM('barracks', TX - 2.1, TW, TZ - 2.0, TX - 2.0, TW + 1.0, TZ + 2.0);
  b.boxMM('barracks', TX + 2.0, TW, TZ - 2.0, TX + 2.1, TW + 1.0, TZ + 2.0);
  for (const [dx, dz] of [[-2.05, -2.05], [2.05, -2.05], [-2.05, 2.05], [2.05, 2.05]]) {
    b.box('crate', TX + dx, TW + 1.0 + 0.7, TZ + dz, 0.1, 1.4, 0.1, { col: false });
  }
  b.box('crate', TX, TW + 2.45, TZ, 4.5, 0.1, 4.5, { col: false });
  b.cyl('barracksRoof', TX, TW + 3.1, TZ, 0, 3.4, 1.2, 4, { ry: Math.PI / 4 });
  b.cyl('ink', TX + 1.6, TW + 1.15, TZ + 1.6, 0.14, 0.18, 0.3, 8, { rx: 0.5 });
  // ladder on the south face
  for (const off of [-0.25, 0.25]) b.rod('steel', V(TX + off, 0, TZ + 2.4), V(TX + off, TW + 0.9, TZ + 2.2), 0.025, 4, { edges: false });
  for (let y = 0.35; y < TW; y += 0.35) b.line(TX - 0.25, y, TZ + 2.4 - (y / TW) * 0.2, TX + 0.25, y, TZ + 2.4 - (y / TW) * 0.2);
  map.rects.push({ x0: TX - 2.1, z0: TZ - 2.1, x1: TX + 2.1, z1: TZ + 2.1, k: 'guard' });

  // jersey barriers (concrete, 0.9 m) and crates for cover
  function barrier(x, z, along = 'x', len = 3.0) {
    const hx = along === 'x' ? len / 2 : 0.31, hz = along === 'x' ? 0.31 : len / 2;
    const tx = along === 'x' ? len / 2 : 0.16, tz = along === 'x' ? 0.16 : len / 2;
    b.boxMM('barrier', x - hx, 0, z - hz, x + hx, 0.32, z + hz, { col: false });
    b.boxMM('barrier', x - tx, 0.32, z - tz, x + tx, 0.9, z + tz, { col: false });
    b.boxMM('stripe', x - (along === 'x' ? hx * 0.6 : tx + 0.002), 0.55, z - (along === 'x' ? tz + 0.002 : hz * 0.6),
      x + (along === 'x' ? hx * 0.6 : tx + 0.002), 0.7, z + (along === 'x' ? tz + 0.002 : hz * 0.6), { col: false, edges: false });
    b.collider(x - hx, 0, z - hz, x + hx, 0.9, z + hz);
    map.rects.push({ x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz, k: 'cover' });
  }
  barrier(-20.5, -16);
  barrier(-9.5, -27, 'x');
  barrier(-31, -30, 'z');
  barrier(-15, -40);
  barrier(-24.5, -40, 'z');
  barrier(-3, -54, 'z');
  barrier(-26, -58);
  barrier(-9, -72);
  barrier(-20, -73);
  function crate(x, y, z, s = 1.1, rot = false) {
    b.boxMM('crate', x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2);
    // brace strokes on the four sides
    const e = 0.004;
    b.line(x - s / 2, y + 0.05, z + s / 2 + e, x + s / 2, y + s - 0.05, z + s / 2 + e);
    b.line(x - s / 2, y + 0.05, z - s / 2 - e, x + s / 2, y + s - 0.05, z - s / 2 - e);
    b.line(x + s / 2 + e, y + 0.05, z - s / 2, x + s / 2 + e, y + s - 0.05, z + s / 2);
    b.line(x - s / 2 - e, y + 0.05, z - s / 2, x - s / 2 - e, y + s - 0.05, z + s / 2);
    for (const f of [-1, 1]) {
      b.line(x - s / 2, y + s - 0.12, z + f * (s / 2 + e), x + s / 2, y + s - 0.12, z + f * (s / 2 + e));
      b.line(x - s / 2, y + 0.12, z + f * (s / 2 + e), x + s / 2, y + 0.12, z + f * (s / 2 + e));
    }
    if (y < 0.5) map.rects.push({ x0: x - s / 2, z0: z - s / 2, x1: x + s / 2, z1: z + s / 2, k: 'cover' });
  }
  const crateStacks = [
    [-12.6, -12], [-3.5, -22], [2.5, -31], [-29.5, -48.5], [-4, -63], [-25, -77.5], [5, -72], [-36, -3.5],
  ];
  for (const [x, z] of crateStacks) {
    crate(x, 0, z);
    crate(x + 1.15, 0, z + 0.1);
    crate(x + 0.55, 1.1, z + 0.05, 1.0);
  }
  crate(-31.5, 0, -18); crate(10, 0, -36); crate(-40, 0, -36.5); crate(-8, 0, -46);
  // oil drums
  for (const [x, z] of [[-33.2, -21], [-33.2, -21.7], [-32.5, -21.35], [-33.1, -57], [-32.4, -57.4], [3.2, -16], [3.2, -16.7]]) {
    b.cyl('steel', x, 0.45, z, 0.3, 0.3, 0.9, 10);
    b.line(x - 0.3, 0.3, z, x + 0.3, 0.3, z);
    b.collider(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3);
  }

  // grass tufts: sparse ink strokes that give the white ground depth
  const R = rng(7);
  const onPath = (x, z) => (x > -15.8 && x < -12.2 && z < -11) || (z > -11.2 && z < -8.8 && x > -31.2 && x < -7.8) || (x > -30.6 && x < -28.4 && z > -9) || (x > -19.2 && x < -17 && z > -9);
  for (let i = 0; i < 900; i++) {
    const x = -70 + R() * 110, z = -130 + R() * 125;
    if (x > BX0 - 1 && x < BX1 + 1 && z > -1) continue;
    if (onPath(x, z)) continue;
    if (Math.abs(x - WX) < 6 && Math.abs(z - WZ) < 6) continue;
    const s = 0.12 + R() * 0.1;
    b.fenceLine(x, 0.01, z, x - s * 0.5, s, z);
    b.fenceLine(x + 0.05, 0.01, z, x + 0.06, s * 1.2, z + 0.02);
    b.fenceLine(x + 0.1, 0.01, z, x + 0.1 + s * 0.5, s * 0.9, z);
  }

  // ------------------------------------------------------------ 6. North Gate
  b.boxMM('concrete', GATE0 - 0.6, 0, YZ1 - 0.3, GATE0, 3.6, YZ1 + 0.3);
  b.boxMM('concrete', GATE1, 0, YZ1 - 0.3, GATE1 + 0.6, 3.6, YZ1 + 0.3);
  b.boxMM('steel', GATE0 - 0.6, 3.6, YZ1 - 0.2, GATE1 + 0.6, 3.95, YZ1 + 0.2);
  b.boxMM('sign', -16.6, 3.95, YZ1 - 0.08, -12.4, 4.85, YZ1 + 0.08, { col: false });
  signText('NORTH GATE', -14.5, 4.4, YZ1 + 0.081, 3.9, 0.7, 1);
  signText('NORTH GATE', -14.5, 4.4, YZ1 - 0.081, 3.9, 0.7, -1);
  // gate leaves swung open outwards
  function gateLeaf(hx, sign) {
    const ang = sign * 1.9; // swung ~110 degrees outward (north)
    const ux = Math.cos(ang) * sign, uz = -Math.abs(Math.sin(ang));
    const w = 2.9, H = 2.3;
    const ex = hx + ux * w, ez = YZ1 + uz * w;
    for (const y of [0.15, H]) b.rod('steel', V(hx, y, YZ1), V(ex, y, ez), 0.035, 6);
    b.rod('steel', V(ex, 0.15, ez), V(ex, H, ez), 0.035, 6);
    b.rod('steel', V(hx, 0.15, YZ1), V(ex, H, ez), 0.025, 4);
    for (let t = 0.25; t < w; t += 0.3) {
      b.fenceLine(hx + ux * t, 0.15, YZ1 + uz * t, hx + ux * Math.min(w, t + 0.9), 0.15 + 2.15 * Math.min(1, (w - t) / 0.9), YZ1 + uz * Math.min(w, t + 0.9));
    }
    b.collider(Math.min(hx, ex) - 0.05, 0, Math.min(YZ1, ez) - 0.05, Math.max(hx, ex) + 0.05, H, Math.max(YZ1, ez) + 0.05, MOVE);
  }
  gateLeaf(GATE0, -1);
  gateLeaf(GATE1, 1);
  map.rects.push({ x0: GATE0 - 0.6, z0: YZ1 - 0.3, x1: GATE1 + 0.6, z1: YZ1 + 0.3, k: 'gate' });

  // ------------------------------------------------------------ finalize geometry
  const built = b.buildStatic(scene, materials);
  const signMesh = buildSigns(signQuads, materials);
  scene.add(signMesh);

  // ------------------------------------------------------------ navigation
  const nav = new NavGraph(world);
  const grid = (x0, x1, z0, z1, y, step, area) => {
    for (let x = x0; x <= x1 + 1e-6; x += step) {
      for (let z = z0; z <= z1 + 1e-6; z += step) {
        const n = nav.add(x, y, z, area);
        if (!nav.nodeClear(n) || world.groundBelow(x, z, 0.2, y + 0.05, 0.3) === null) nav.nodes.pop();
      }
    }
  };
  grid(-33, 2, 1, 17, RY, 2.5, 'roof');
  grid(-2.3, 2.1, 0.9, 5.4, 0, 1.5, 'stairs');
  grid(-11.3, -3.7, 0.9, 11.4, 0, 1.9, 'kitchen');
  grid(-33.1, -12.7, 0.9, 17.1, 0, 2.1, 'canteen');
  grid(-44.5, 14.5, -80.5, -1.5, 0, 3, 'yard');
  grid(-19.5, -8.5, -61.5, -50.5, 0.25, 2.5, 'yard');
  // explicit door-side nodes
  const doorNodes = (x, y, z, dx, dz, areaA, areaB) => [nav.add(x + dx, y, z + dz, areaA), nav.add(x - dx, y, z - dz, areaB)];
  const [hutOut, hutIn] = doorNodes(0, RY, 15.7, 0, 0.9, 'roof', 'roof');
  hutIn.z = 14.8;
  const stairTop = nav.add(0, RY, 13.8, 'stairs');
  const stairMid = nav.add(0, treadTop(10), 9.8, 'stairs');
  const stairLow = nav.add(0, treadTop(19), 6.2, 'stairs');
  const stairFoot = nav.add(0, 0, 5.3, 'stairs');
  doorNodes(-3.0, 0, 2.9, 0.9, 0, 'stairs', 'kitchen');
  doorNodes(-12.0, 0, 9.7, 0.9, 0, 'kitchen', 'canteen');
  doorNodes(-29.55, 0, 0.15, 0, 0.95, 'canteen', 'yard');
  doorNodes(-18.05, 0, 0.15, 0, 0.95, 'canteen', 'yard');
  nav.autoLink(3.4, doors);
  nav.link(hutIn, stairTop);
  nav.link(stairTop, stairMid);
  nav.link(stairMid, stairLow);
  nav.link(stairLow, stairFoot);
  // make sure the hut door link carries the door
  for (const l of hutOut.links) if (l.to === hutIn) l.door = doors[0];
  for (const l of hutIn.links) if (l.to === hutOut) l.door = doors[0];
  nav.link(hutOut, hutIn, doors[0]);

  // ------------------------------------------------------------ enemies
  // yaw: 0 faces north (-Z), PI south, -PI/2 east, PI/2 west.
  const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
  const spawns = [
    { x: -17, y: RY, z: 2.6, yaw: N, weapon: 'pistol', area: 'roof' },
    { x: -6, y: RY, z: 16.4, yaw: W, weapon: 'smg', area: 'roof', patrol: [[-6, 16.4], [-21, 16.4], [-21, 9], [-6, 16.4]] },
    { x: 0.9, y: 0, z: 1.3, yaw: N, weapon: 'pistol', area: 'stairs' },
    { x: -10.3, y: 0, z: 4.4, yaw: E, weapon: 'shotgun', area: 'kitchen' },
    { x: -19.5, y: 0, z: 7.2, yaw: E, weapon: 'rifle', area: 'canteen' },
    { x: -27.5, y: 0, z: 11.8, yaw: E, weapon: 'smg', area: 'canteen', patrol: [[-27.5, 11.8], [-15, 11.8]] },
    { x: -31.2, y: 0, z: 2.8, yaw: S, weapon: 'pistol', area: 'canteen' },
    { x: -22, y: 0, z: -10, yaw: S, weapon: 'smg', area: 'yard', patrol: [[-22, -10], [-9, -7], [-22, -10], [-30, -14]] },
    { x: -6.5, y: 0, z: -23.5, yaw: S, weapon: 'rifle', area: 'yard' },
    { x: -30, y: 0, z: -41, yaw: E, weapon: 'shotgun', area: 'yard' },
    { x: TX, y: TW, z: TZ, yaw: S, weapon: 'rifle', area: 'yard', sniper: true },
    { x: -12, y: 0, z: -47, yaw: S, weapon: 'smg', area: 'yard', patrol: [[-12, -47], [-4.5, -49], [-7, -64], [-21, -64], [-22, -48]] },
    { x: -5.5, y: 0, z: -65.5, yaw: S, weapon: 'rifle', area: 'yard' },
    { x: -24, y: 0, z: -68, yaw: E, weapon: 'smg', area: 'yard', patrol: [[-24, -68], [-30, -60], [-24, -68], [-16, -70]] },
    { x: -19.8, y: 0, z: -79.5, yaw: S, weapon: 'rifle', area: 'gate' },
    { x: -9.2, y: 0, z: -79.8, yaw: S, weapon: 'shotgun', area: 'gate' },
  ];

  // route through the level (for the Mission map)
  const route = [
    { x: -30.5, z: 9, label: '1', name: 'Roof' },
    { x: 0, z: 16.6, label: '', name: '' },
    { x: 0, z: 4, label: '2', name: 'Stair room' },
    { x: -7, z: 10, label: '3', name: 'Kitchen' },
    { x: -14, z: 10, label: '', name: '' },
    { x: -18, z: 3, label: '4', name: 'Canteen' },
    { x: -18, z: -10, label: '5', name: 'Yard' },
    { x: -14, z: -44, label: '', name: '' },
    { x: -14, z: -56, label: 'W', name: 'Water tower' },
    { x: -14.5, z: -84, label: '6', name: 'North Gate' },
  ];

  return { built, doors, nav, spawns, map, route, water: V(WX, 12, WZ), bounds: { x0: YX0, x1: YX1, z0: YZ1, z1: BZ1 } };
}

// Text quads for EXIT / NORTH GATE, drawn from one canvas atlas.
function buildSigns(quads, materials) {
  const texts = [...new Set(quads.map((q) => q.text))];
  const rowH = 96, W = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = rowH * texts.length;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  texts.forEach((t, i) => {
    let size = 72;
    g.font = `900 ${size}px Arial, Helvetica, sans-serif`;
    while (g.measureText(t).width > W - 20 && size > 20) { size -= 2; g.font = `900 ${size}px Arial, Helvetica, sans-serif`; }
    g.fillText(t, W / 2, i * rowH + rowH / 2 + 3);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = materials.get('signText');
  mat.map = tex;
  mat.alphaTest = 0.4;
  mat.needsUpdate = true;
  const geoms = [];
  for (const q of quads) {
    const i = texts.indexOf(q.text);
    const measure = (() => { g.font = '900 72px Arial'; return Math.min(1, g.measureText(q.text).width / (W - 20)); })();
    const pg = new THREE.PlaneGeometry(q.w, q.h);
    const uv = pg.attributes.uv;
    const v0 = 1 - (i + 1) / texts.length, v1 = 1 - i / texts.length;
    const u0 = 0.5 - 0.5 * Math.max(measure, 0.6), u1 = 0.5 + 0.5 * Math.max(measure, 0.6);
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, uv.getX(k) < 0.5 ? u0 : u1, uv.getY(k) < 0.5 ? v0 : v1);
    }
    if (q.facing < 0) pg.rotateY(Math.PI);
    pg.translate(q.x, q.y, q.z);
    geoms.push(pg);
  }
  const merged = mergeSimple(geoms);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'signs';
  return mesh;
}

function mergeSimple(geoms) {
  let count = 0, icount = 0;
  for (const g of geoms) { count += g.attributes.position.count; icount += g.index.count; }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const idx = new Uint32Array(icount);
  let o = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + o;
    o += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
