// Level 4 - Desert Outpost.
//   wadi between rock walls -> open plain -> fenced outpost (tents, command
//   bunker, two watchtowers) with a west camp and an east ridge of trenches
//   -> vehicle checkpoint on the north road. Three radio transmitters must be
//   shot to pieces in any order. Blowing dust thins out the distance; the
//   crosshair area always stays clear.
import * as THREE from 'three';
import { MOVE } from '../world.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const TW = 4.2; // watchtower floor

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ helpers
  const tower = (x, z, h = TW) => {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      K.box('wood', x + dx * 1.1 - 0.1, 0, z + dz * 1.1 - 0.1, x + dx * 1.1 + 0.1, h + 2.3, z + dz * 1.1 + 0.1);
    }
    for (const dz of [-1, 1]) K.rod('wood', V(x - 1.1, 0.4, z + dz * 1.1), V(x + 1.1, h - 0.4, z + dz * 1.1), 0.05);
    K.box('wood', x - 1.3, h - 0.15, z - 1.3, x + 1.3, h, z + 1.3);
    K.box('wood', x - 1.3, h, z - 1.3, x + 1.3, h + 0.95, z - 1.2);
    K.box('wood', x - 1.3, h, z - 1.3, x - 1.2, h + 0.95, z + 1.3);
    K.box('wood', x + 1.2, h, z - 1.3, x + 1.3, h + 0.95, z + 1.3);
    K.box('wood', x - 1.3, h, z + 1.2, x - 0.35, h + 0.95, z + 1.3);
    K.box('wood', x + 0.35, h, z + 1.2, x + 1.3, h + 0.95, z + 1.3);
    K.deco('tent', x - 1.6, h + 2.3, z - 1.6, x + 1.6, h + 2.45, z + 1.6);
    K.ladder({ x, z: z + 1.35, y0: 0, y1: h, face: 'n' });
    K.mapRect(x - 1.3, z - 1.3, x + 1.3, z + 1.3, 'prop');
  };
  const truck = (x, z, rot = 0, role = 'tent') => {
    const L = 7, Wd = 2.4;
    const hx = rot ? Wd / 2 : L / 2, hz = rot ? L / 2 : Wd / 2;
    const f = rot ? [0, -1] : [-1, 0];
    K.box(role, x - hx, 0.6, z - hz, x + hx, 1.2, z + hz, { col: false });
    const cx = x + f[0] * 2.6, cz = z + f[1] * 2.6;
    K.deco('car3', cx - (rot ? 1.2 : 0.9), 1.2, cz - (rot ? 0.9 : 1.2), cx + (rot ? 1.2 : 0.9), 2.7, cz + (rot ? 0.9 : 1.2));
    K.pane(cx + f[0] * 0.91 - (rot ? 1 : 0.01), 1.9, cz + f[1] * 0.91 - (rot ? 0.01 : 1), cx + f[0] * 0.91 + (rot ? 1 : 0.01), 2.5, cz + f[1] * 0.91 + (rot ? 0.01 : 1), { edges: false });
    const bx0 = x - hx + (rot ? 0 : 0), bz0 = z - hz;
    const bedA = rot ? [x - hx, z - hz + 2.2] : [x - hx + 2.2, z - hz];
    K.deco(role, bedA[0], 1.2, bedA[1], x + hx, 2.2, rot ? z + hz : z - hz + 0.1);
    K.deco(role, bedA[0], 1.2, rot ? bedA[1] : z + hz - 0.1, rot ? x - hx + 0.1 : x + hx, 2.2, z + hz);
    void bx0; void bz0;
    for (const a of [-2.4, 0.4, 2.4]) for (const s of [-1, 1]) {
      const wx = rot ? x + s * (Wd / 2) : x + a, wz = rot ? z + a : z + s * (Wd / 2);
      K.cyl('tire', wx, 0.5, wz, 0.5, 0.5, 0.35, 10, rot ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 });
    }
    K.collider(x - hx, 0, z - hz, x + hx, 2.7, z + hz, 7, null, 'metal');
    K.mapRect(x - hx, z - hz, x + hx, z + hz, 'cover');
  };
  const transmitter = (id, x, z) => {
    K.destructible(id, [x - 0.9, 0, z - 0.9, x + 0.9, 7.5, z + 0.9], 260, (pb) => {
      pb.box('transmitter', x, 0.6, z, 1.6, 1.2, 1.6);
      pb.box('ink', x, 0.7, z + 0.81, 0.9, 0.5, 0.02);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pb.rod('steel', V(x + a * 0.55, 1.2, z + b * 0.55), V(x + a * 0.12, 7.4, z + b * 0.12), 0.05);
      for (let y = 1.6; y < 7; y += 1.1) {
        const k0 = 0.55 - (y - 1.2) * 0.07, k1 = 0.55 - (y + 1.1 - 1.2) * 0.07;
        for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) pb.rod('steel', V(x + a * k0, y, z + b * k0), V(x + c * k1, y + 1.1, z + d * k1), 0.025, 4);
      }
      pb.cyl('transmitter', x, 5.6, z + 0.45, 0.75, 0.25, 0.3, 12, { rx: Math.PI / 2 });
      pb.rod('steel', V(x, 7.4, z), V(x, 9.2, z), 0.03);
      pb.box('lightOff', x, 9.25, z, 0.15, 0.15, 0.15);
    }, (pw) => {
      pw.box('transmitter', x, 0.3, z, 1.6, 0.6, 1.6, { rz: 0.1 });
      pw.box('ink', x + 0.3, 0.02, z - 0.2, 3.2, 0.04, 3.2);
      for (let i = 0; i < 4; i++) pw.rod('steel', V(x - 0.4 + i * 0.25, 0.2, z), V(x + 1.4 + i * 0.4, 0.15, z - 5.5 + i * 0.3), 0.05);
      pw.cyl('transmitter', x + 2, 0.25, z - 3, 0.75, 0.25, 0.3, 12);
    });
    K.mapCircle(x, z, 0.9, 'rock');
  };

  // ------------------------------------------------------------ ground + border
  K.ground('sand', -130, -170, 130, 120);
  const R = [0];
  const dunes = [[-60, 30], [-40, 40], [40, 36], [62, 24], [-66, -60], [66, -66], [-30, -100], [30, -104]];
  for (const [x, z] of dunes) for (let k = -3; k <= 3; k++) K.detail(x - 12, 0.02, z + k * 1.4, x + 12, 0.02, z + k * 1.4 + Math.sin(k) * 0.8);
  // wadi entrance: rock walls either side
  let seed = 11;
  for (let z = 22; z < 54; z += 5) {
    K.rock(-12 - (z % 3), z, 4.5, 5 + (z % 4), seed++);
    K.rock(12 + (z % 4), z + 2, 4.8, 5.5 + (z % 3), seed++);
  }
  for (let x = -70; x <= 70; x += 9) { K.rock(x, 56, 5, 6, seed++); }
  for (let z = -104; z < 52; z += 9) { K.rock(-72, z, 5, 5 + (z % 3), seed++); K.rock(72, z + 4, 5, 5 + (z % 4), seed++); }
  K.bounds(-68, -112, 68, 52);
  void R;

  // ------------------------------------------------------------ central plain
  for (const [x, z, r, h] of [[-22, 12, 3, 2.4], [18, 8, 3.5, 2.2], [-6, -2, 2.2, 1.6], [30, -4, 2.8, 2.6], [-34, 16, 3, 3]]) K.rock(x, z, r, h, seed++);
  for (let i = 0; i < 6; i++) K.drum(6 + (i % 3) * 0.7, 12 + Math.floor(i / 3) * 0.7);
  K.sandbags(-4, 4, 4, 5.2, 1.1);

  // ------------------------------------------------------------ fenced outpost
  K.fence(-28, -12, -3, -12);
  K.fence(3, -12, 28, -12);
  K.fence(-28, -52, -3, -52);
  K.fence(3, -52, 28, -52);
  K.fence(-28, -12, -28, -26);
  K.fence(-28, -30, -28, -52);
  K.fence(28, -12, 28, -30);
  K.fence(28, -34, 28, -52);
  for (const x of [-3.3, 3.3]) { K.box('sandbag', x - 0.3, 0, -12.5, x + 0.3, 1.6, -11.5); K.box('sandbag', x - 0.3, 0, -52.5, x + 0.3, 1.6, -51.5); }
  // command bunker: thick walls, narrow doors, firing slits
  K.room(-6, -38, 6, -28, 0, {
    role: 'bunker', h: 2.6, t: 0.6,
    s: [{ a: -0.5, b: 0.5, lo: 0, hi: 2.0, kind: 'gap' }, { a: -5, b: -2, lo: 1.35, hi: 1.7, kind: 'gap' }, { a: 2, b: 5, lo: 1.35, hi: 1.7, kind: 'gap' }],
    n: [{ a: 3, b: 4, lo: 0, hi: 2.0, kind: 'gap' }, { a: -5, b: -1, lo: 1.35, hi: 1.7, kind: 'gap' }],
    e: [{ a: -35, b: -31, lo: 1.35, hi: 1.7, kind: 'gap' }],
    w: [{ a: -35, b: -31, lo: 1.35, hi: 1.7, kind: 'gap' }],
    ceil: 'bunker',
  });
  K.box('sandbag', -6.8, 2.6, -38.8, 6.8, 3.2, -27.2, { edges: true });
  K.wall('bunker', 'z', 0, 0.3, -37.7, -32.5, 0, 2.6);
  K.tableSet(-3, -33, { chairs: 2 });
  K.box('machine', 3, 0, -37.5, 5.5, 1.4, -36.5);
  K.lampLight(-3, 2.55, -33);
  K.lampLight(3, 2.55, -33);
  // tents, emplacements, towers, transmitter B
  K.tent(-18, -20, 5, 7, 3);
  K.tent(-18, -42, 5, 7, 3, 1);
  K.tent(17, -21, 5, 7, 3, 1);
  K.sandbags(-12, -26, -9, -25, 1.1);
  K.sandbags(10, -46, 14, -45, 1.1);
  K.sandbags(8, -18, 12, -17, 1.1);
  K.crateStack(18, -46);
  truck(-10, -46, 0, 'tent');
  tower(-24, -48);
  tower(24, -16);
  transmitter('txB', 12, -38);
  K.sign('OUTPOST 7', 0, 3.2, -11.9, 3, 0.5, 1);
  K.deco('wood', -2.8, 2.6, -12.1, 2.8, 3.6, -11.9);

  // ------------------------------------------------------------ west camp
  K.tent(-44, -2, 5, 8, 3.2);
  K.tent(-58, 4, 5, 7, 3);
  truck(-44, 6, 0, 'tent');
  truck(-60, -14, 1, 'sand');
  for (let i = 0; i < 8; i++) K.drum(-40 + (i % 4) * 0.7, -22 + Math.floor(i / 4) * 0.7);
  K.sandbags(-50, -18, -46, -17, 1.1);
  K.sandbags(-56, -8, -55, -4, 1.1);
  K.room(-60, -32, -50, -24, 0, { role: 'bunker', h: 2.5, t: 0.5, e: [{ a: -29, b: -28, lo: 0, hi: 2, kind: 'gap' }, { a: -27, b: -25, lo: 1.3, hi: 1.65, kind: 'gap' }], n: [{ a: -58, b: -53, lo: 1.3, hi: 1.65, kind: 'gap' }], ceil: 'bunker' });
  transmitter('txA', -50, -10);
  K.fence(-66, -34, -36, -34);

  // ------------------------------------------------------------ east ridge + trenches
  for (const [x, z, r, h] of [[44, 4, 4, 3.5], [60, -4, 5, 4], [64, -26, 4.5, 3.6], [40, -46, 4, 3], [58, -48, 5, 4.2], [48, -20, 2.5, 1.8]]) K.rock(x, z, r, h, seed++);
  const trench = (ax, az, bx, bz) => {
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    if (along) { K.sandbags(x0, z0 - 1.9, x1, z0 - 1.1, 1.3); K.sandbags(x0, z0 + 1.1, x1, z0 + 1.9, 1.3); } else { K.sandbags(x0 - 1.9, z0, x0 - 1.1, z1, 1.3); K.sandbags(x0 + 1.1, z0, x0 + 1.9, z1, 1.3); }
  };
  trench(32, -10, 46, -10);
  trench(51, -13, 51, -38);
  trench(36, -30, 47, -30);
  K.sandbags(54, -34, 62, -33, 1.2);
  K.sandbags(54, -41, 62, -40, 1.2);
  K.sandbags(61.5, -40, 62.5, -34, 1.2);
  transmitter('txC', 58, -37);
  tower(40, -6);

  // ------------------------------------------------------------ north road + vehicle checkpoint
  K.deco('path', -4, -0.28, -110, 4, 0.01, -52, { edges: false });
  for (let z = -108; z < -54; z += 4) K.detail(0, 0.015, z, 0, 0.015, z + 2);
  for (const [x, z] of [[-2.2, -60], [2.4, -66], [-2.6, -72], [2.2, -78]]) K.barrier(x, z, 'x', 2.6);
  trench(-12, -58, -12, -80);
  trench(12, -58, 12, -80);
  K.room(-9, -88, -5, -84, 0, { role: 'bunker', h: 2.6, e: [K.win(-87.4, 2.6, 1.0, 2)], s: [K.op(-7.5, 1.0)], ceil: 'tent' });
  K.room(5, -88, 9, -84, 0, { role: 'bunker', h: 2.6, w: [K.win(-87.4, 2.6, 1.0, 2)], s: [K.op(6, 1.0)], ceil: 'tent' });
  // barrier arm across the road (walk past on the pedestrian lane)
  K.box('stripe', -4.6, 0, -86.3, -4.2, 1.2, -85.7);
  K.box('barrier', -4.2, 0.95, -86.1, 2.4, 1.12, -85.9);
  K.collider(-4.2, 0, -86.1, 2.4, 1.12, -85.9, MOVE);
  for (let x = -3.8; x < 2.4; x += 0.8) K.deco('stripe', x, 0.949, -86.12, x + 0.4, 1.121, -85.88);
  K.fence(-68, -88, -9.3, -88);
  K.fence(9.3, -88, 68, -88);
  tower(16, -82);
  K.sign('CHECKPOINT', 0, 3.4, -85.8, 4, 0.6, 1);
  K.deco('wood', -4.8, 3.0, -86, 4.8, 3.8, -85.6);
  for (const x of [-4.9, 4.9]) K.box('wood', x - 0.15, 0, -86, x + 0.15, 3.8, -85.6);

  // ------------------------------------------------------------ nav
  K.navGrid(-66, 66, -108, 50, 0, 3);
  K.navGrid(-5.4, 5.4, -37.3, -28.7, 0, 1.6);

  // ------------------------------------------------------------ enemies
  K.spawn(-8, 0, 6, S, 'smg', { patrol: [[-8, 6], [10, 4], [-8, 6]] });
  K.spawn(20, 0, 2, S, 'pistol');
  K.spawn(-20, 0, 6, S, 'rifle', { hold: true });
  K.spawn(4, 0, -6, S, 'smg', { patrol: [[4, -6], [22, -8]] });
  K.spawn(-24, TW, -48.4, S, 'rifle', { perch: true });
  K.spawn(24, TW, -16.4, W, 'rifle', { perch: true });
  K.spawn(-3, 0, -30, S, 'shotgun', { hold: true });
  K.spawn(3, 0, -34, S, 'smg', { hold: true });
  K.spawn(14, 0, -42, W, 'heavy', { hold: true });
  K.spawn(-14, 0, -32, E, 'pistol', { patrol: [[-14, -32], [-14, -48], [10, -48], [-14, -32]] });
  K.spawn(-42, 0, -10, E, 'smg', { patrol: [[-42, -10], [-42, 10], [-42, -10]] });
  K.spawn(-54, 0, -6, E, 'shotgun', { hold: true });
  K.spawn(-47, 0, -18.6, S, 'rifle', { hold: true });
  K.spawn(-55, 0, -28, E, 'pistol', { hold: true });
  K.spawn(40, 0, -10, W, 'smg');
  K.spawn(51, 0, -22, S, 'smg', { hold: true });
  K.spawn(40, TW, -6.4, W, 'sniper');
  K.spawn(56, 0, -30, W, 'shotgun', { hold: true });
  K.spawn(44, 0, -30, W, 'rifle', { hold: true });
  // final: checkpoint defenders
  K.spawn(16, TW, -82.4, S, 'sniper');
  K.spawn(-2.2, 0, -61.2, S, 'rifle', { hold: true });
  K.spawn(2.4, 0, -67.2, S, 'rifle', { hold: true });
  K.spawn(-12, 0, -66, S, 'smg');
  K.spawn(12, 0, -70, S, 'shotgun');
  K.spawn(-7, 0, -86, S, 'pistol', { hold: true });
  K.spawn(7, 0, -80, S, 'heavy', { hold: true });
  K.entry('north', 0, 0, -104, S);
  K.entry('westFar', -64, 0, -40, E);
  K.entry('eastFar', 64, 0, -60, W);
  K.entry('southWadi', 0, 0, 30, N);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, 0, 46, N);
  K.zone('exit', -30, -1, -112, 30, 5, -90);
  K.checkpoint(0, 0, -6, N, { need: 0, r: 8 });
  K.checkpoint(0, 0, -44, N, { need: 0, r: 9, at: [0, 0, -44, N] });
  K.checkpoint(0, 0, -55, N, { need: 1, r: 8 });
  K.secret(-58, 0, -30);
  K.secret(66, 0, -86);
  K.secret(-44, 0, 3.6);
  K.item('health', 0, 0, 20, { tier: 3 });
  K.item('ammo', -6, 0, 3);
  K.item('health', -5, 0, -36);
  K.item('ammo', 5, 0, -30);
  K.item('health', -48, 0, -22, { tier: 2 });
  K.item('ammo', -56, 0, 0);
  K.item('health', 54, 0, -12, { tier: 2 });
  K.item('ammo', 48, 0, -34);
  K.item('health', 0, 0, -56, { tier: 2 });
  K.item('ammo', -8, 0, -64);
  K.item('health', 8, 0, -76, { tier: 3 });
  K.weapon('burst', -3, 0.77, -33, 0.4);
  K.weapon('shotgun', -58, 0, -26, 1.2);
  K.weapon('revolver', 46, 0, -12, 0.3);
  K.area('area.L4.dunes', -80, -12, 80, 60);
  K.area('area.L4.camp', -80, -60, 30, -12);
  K.area('area.L4.trench', 30, -60, 80, -12);
  K.area('area.L4.check', -80, -120, 80, -60);
  K.data.arenas.push({ x: 0, y: 0, z: -24, yaw: S, entries: ['westFar', 'eastFar', 'southWadi'] });
  K.data.arenas.push({ x: 0, y: 0, z: -70, yaw: N, entries: ['north', 'westFar', 'eastFar'] });
  yield 1;
}

export default {
  id: 'L4',
  num: 4,
  bounds: { x0: -90, z0: -130, x1: 90, z1: 70 },
  mapBounds: { x0: -68, x1: 68, z0: -112, z1: 54 },
  par: 480,
  loadout: { main: ['rifle', 30, 120], side: ['pistol', 12, 48] },
  env: {
    classic: { paper: 0xfcfaf4, fog: [24, 125] },
    neo: { sky: ['#ff9a3d', '#ffc36b', '#fff0c4', '#f2cf8a'], fog: 0xf6dca6, fogRange: [40, 190], sun: [30, 60, 12], sunColor: 0xfff2d6, sunI: 0.62, hemiI: 0.62, hemiSky: 0xfff6e0, hemiGround: 0xd48a5a, clouds: true, shadowBox: 44 },
    weather: 'dust',
    ambience: ['wind'],
  },
  groundSurf: 'ground',
  menuOrbit: { x: 0, z: -30, r: 70, h: 30, look: 2 },
  previewCam: { p: [0, 1.7, 30], yaw: 0.05, pitch: 0.03 },
  objectives: [
    { key: 'L4.o1', type: 'destroy', ids: ['txA', 'txB', 'txC'] },
    { key: 'L4.o2', type: 'reach', zone: 'exit', marker: [3.6, 1.4, -86], final: true, onStart: [{ toast: 'hud.reinforce' }, { wave: { count: 3, roles: ['smg', 'shotgun', 'rifle'], entries: ['westFar', 'eastFar'], announce: false } }] },
  ],
  build,
};
