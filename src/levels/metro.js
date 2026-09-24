// Level 3 - Underground Station.
//   street entrance (y 9.6) -> stairs -> ticket hall (y 5.2: barriers, booth)
//   -> escalators -> two side platforms (y 1.1) with a stopped train you can
//   walk through -> electrical rooms behind each platform -> dark tunnel to
//   the maintenance exit. Lights flicker until the power is restored; then
//   the station fights back from both platforms and the train.
import * as THREE from 'three';
import { MOVE } from '../world.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const ST = 9.6; // street level
const CC = 5.2; // concourse floor
const PF = 1.1; // platform top
const HALL = 7.6; // platform hall ceiling (north part)

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ street
  K.box('asphalt', -22, ST - 0.3, 28, -1.6, ST, 50, { edges: false });
  K.box('asphalt', 1.6, ST - 0.3, 28, 22, ST, 50, { edges: false });
  K.box('asphalt', -1.6, ST - 0.3, 29.45, 1.6, ST, 50, { edges: false });
  K.box('sidewalk', -22, ST, 28, -1.75, ST + 0.12, 33, { edges: true });
  K.box('sidewalk', 1.75, ST, 28, 22, ST + 0.12, 33, { edges: true });
  for (let x = -20; x < 20; x += 4) K.detail(x, ST + 0.005, 40, x + 2, ST + 0.005, 40);
  K.collider(-22, ST, 49.5, 22, ST + 6, 50, MOVE);
  K.collider(-22, ST, 28, -21.5, ST + 6, 50, MOVE);
  K.collider(21.5, ST, 28, 22, ST + 6, 50, MOVE);
  K.box('brick', -22, ST, 50, 22, ST + 14, 54);
  for (let x = -20; x < 20; x += 4) { K.line(x, ST + 3, 49.98, x + 2.4, ST + 3, 49.98); K.line(x, ST + 7, 49.98, x + 2.4, ST + 7, 49.98); }
  K.box('brick', -26, ST, 20, -22, ST + 12, 50);
  K.box('brick', 22, ST, 20, 26, ST + 12, 50);
  K.box('brick', -22, ST, 20, -1.75, ST + 10, 28);
  K.box('brick', 1.75, ST, 20, 22, ST + 10, 28);
  K.box('shop', -14, ST, 27.8, -6, ST + 3.2, 28.2, { col: false });
  K.box('neon1', -12, ST + 3.6, 27.6, -8, ST + 4.2, 27.8, { col: false });
  // stairwell mouth with railings and the METRO sign
  for (const x of [-1.75, 1.6]) K.box('tileWall', x, CC, 23.5, x + 0.15, ST + 1.0, 29.5);
  K.cyl('steel', 3.2, ST + 1.8, 31, 0.08, 0.08, 3.6, 8);
  K.box('trainTrim', 2.4, ST + 3.4, 30.9, 4, ST + 4.3, 31.1, { col: false });
  K.sign('METRO', 3.2, ST + 3.85, 31.12, 1.5, 0.7, 1);
  for (const x of [-16, 16]) K.lampPost(x, 34, { y: ST, arm: x < 0 ? 1 : -1 });
  K.car(-12, 44, 0, 'car2');
  K.car(11, 45, 0, 'car1');
  K.stairs({ x: 0, z: 23.5, y0: CC, dir: 's', n: 18, rise: (ST - CC) / 18, run: 0.33, w: 3, role: 'tile', rails: false });

  // ------------------------------------------------------------ ticket hall
  K.box('tile', -18, CC - 0.3, -6, 18, CC, 24, { edges: false });
  for (let x = -16; x <= 16; x += 4) K.detail(x, CC + 0.004, -6, x, CC + 0.004, 24);
  K.room(-18, -6, 18, 24, CC, {
    role: 'tileWall', h: 4,
    n: [K.gap(-11.5, 3, 4), K.gap(8.5, 3, 4)],
    s: [K.gap(-1.5, 3, 4)],
    ceil: 'ceiling',
  });
  // ticket barriers: waist-high posts with gaps
  for (let x = -16.5; x < 16.5; x += 1.9) {
    if (x > -2 && x < 1) continue;
    K.box('steel', x, CC, 3.7, x + 0.9, CC + 1.0, 4.3);
    K.deco('trainTrim', x + 0.05, CC + 1.0, 3.75, x + 0.85, CC + 1.05, 4.25);
  }
  K.box('steel', -2, CC, 3.7, -1.1, CC + 1.0, 4.3);
  K.box('steel', 1.1, CC, 3.7, 2, CC + 1.0, 4.3);
  // ticket booth
  K.room(-17, 14, -10, 20, CC, { role: 'wall', h: 2.8, e: [K.op(16.5, 1.0), K.win(18, 1.4, 1.0, 2.2)], n: [K.win(-16, 5, 1.0, 2.2)], ceil: 'ceiling' });
  K.doorAt('z', -10, 16.5, 1.0, CC);
  K.box('counter', -16.5, CC, 14.3, -11, CC + 1.0, 15);
  K.sign('TICKETS', -13.5, CC + 2.5, 13.85, 3, 0.5, -1);
  // pillars, benches, machines
  for (const x of [-9, 9]) for (const z of [0, 10, 18]) { K.box('tileWall', x - 0.35, CC, z - 0.35, x + 0.35, CC + 4, z + 0.35); }
  for (const [x, z] of [[-4, -3], [4, -3], [13, 12]]) K.box('wood', x - 1, CC, z - 0.25, x + 1, CC + 0.45, z + 0.25);
  K.box('vending', 15.8, CC, 16, 17.6, CC + 1.9, 17.2);
  K.box('vending', 15.8, CC, 18, 17.6, CC + 1.9, 19.2);
  for (const [x, z] of [[-13, 8], [0, 12], [13, 4], [-6, -2], [6, -2]]) K.lampLight(x, CC + 3.95, z, { sx: 2, sz: 0.3 });
  K.sign('PLATFORMS', 0, CC + 3.4, -5.85, 4, 0.5, 1);
  K.sign('WAY OUT', 0, CC + 3.4, 23.85, 3, 0.45, -1);

  // escalators down to the platforms
  for (const x of [-10, 10]) {
    K.ramp({ x, z: -16, y0: PF, y1: CC, dir: 's', len: 10, w: 2.4, role: 'steel', rails: 'both' });
    for (let z = -15.5; z < -6; z += 0.5) K.detail(x - 1.1, PF + (CC - PF) * ((z + 16) / 10) + 0.02, z, x + 1.1, PF + (CC - PF) * ((z + 16) / 10) + 0.02, z);
  }

  // ------------------------------------------------------------ platform hall
  K.wall('tileWall', 'z', -14, 0.3, -62, -6, 0, HALL, [{ a: -36, b: -35, lo: PF, hi: PF + 2.1, kind: 'door' }]);
  K.wall('tileWall', 'z', 14, 0.3, -62, -6, 0, HALL, [{ a: -44, b: -43, lo: PF, hi: PF + 2.1, kind: 'door' }]);
  K.wall('tileWall', 'z', -14, 0.3, -6, 14, 0, CC - 0.3);
  K.wall('tileWall', 'z', 14, 0.3, -6, 14, 0, CC - 0.3);
  K.wall('tileWall', 'x', -62, 0.3, -14.15, 14.15, 0, HALL, [{ a: -6, b: 6, lo: 0, hi: 4.5, kind: 'gap' }]);
  K.wall('tileWall', 'x', 14, 0.3, -14.15, 14.15, 0, CC - 0.3);
  K.deco('ceiling', -14.15, HALL, -62.15, 14.15, HALL + 0.2, -6);
  K.collider(-14.15, HALL, -62.15, 14.15, HALL + 0.2, -6, MOVE, null, 'roof');
  K.deco('tileWall', -18, HALL, -6.2, 18, CC + 4, -5.9);
  // platforms with edge stripes
  K.box('platform', -14, 0, -62, -6, PF, 14, { edges: true });
  K.box('platform', 6, 0, -62, 14, PF, 14, { edges: true });
  K.deco('hazard', -6.6, PF, -62, -6, PF + 0.01, 14);
  K.deco('hazard', 6, PF, -62, 6.6, PF + 0.01, 14);
  // tracks
  for (const cx of [-3.5, 3.5]) {
    for (const off of [-0.72, 0.72]) K.rod('rail', V(cx + off, 0.12, -92), V(cx + off, 0.12, 14), 0.06, 6);
    for (let z = -91; z < 14; z += 1.2) K.deco('wood', cx - 1.1, 0, z, cx + 1.1, 0.08, z + 0.25, { edges: false });
  }
  // steps from the track bed back onto the platforms
  K.stairs({ x: -5.2, z: -58, y0: 0, dir: 'w', n: 4, rise: PF / 4, run: 0.3, w: 1.2, role: 'concrete', rails: false });
  K.stairs({ x: 5.2, z: -58, y0: 0, dir: 'e', n: 4, rise: PF / 4, run: 0.3, w: 1.2, role: 'concrete', rails: false });
  K.stairs({ x: 5.2, z: 10, y0: 0, dir: 'e', n: 4, rise: PF / 4, run: 0.3, w: 1.2, role: 'concrete', rails: false });
  for (const z of [-54, -42, -30, -18]) { K.lampLight(-10, HALL - 0.05, z, { sx: 0.3, sz: 3 }); K.lampLight(10, HALL - 0.05, z, { sx: 0.3, sz: 3 }); }
  for (const z of [-2, 8]) { K.lampLight(-10, CC - 0.35, z, { sx: 0.3, sz: 3 }); K.lampLight(10, CC - 0.35, z, { sx: 0.3, sz: 3 }); }
  for (const z of [-50, -26]) { K.box('wood', -13.5, PF, z - 1, -13, PF + 0.45, z + 1); K.box('wood', 13, PF, z - 1, 13.5, PF + 0.45, z + 1); }
  K.sign('PLATFORM 1', -13.82, 3.4, -24, 4, 0.55, 1, 'x');
  K.sign('PLATFORM 2', 13.82, 3.4, -32, 4, 0.55, -1, 'x');

  // ------------------------------------------------------------ the train
  const carriage = (z0, z1, front) => {
    K.deco('train', -5.7, 0.35, z0, -1.3, 0.9, z1);
    for (const z of [z0 + 2, z1 - 2]) for (const x of [-5.1, -1.9]) K.cyl('tire', x, 0.35, z, 0.35, 0.35, 0.25, 10, { rz: Math.PI / 2 });
    const doorsZ = [z0 + 3, z1 - 4.3];
    K.room(-5.7, z0, -1.3, z1, PF, {
      role: 'train', t: 0.12, h: 2.4,
      w: [...doorsZ.map((a) => K.gap(a, 1.3, 2.1)), K.win(z0 + 5.3, 5.2, 0.8, 1.9)],
      e: [K.win(z0 + 1, 2.4, 0.8, 1.9), K.win(z0 + 5.3, 5.2, 0.8, 1.9), K.win(z1 - 3.6, 2.4, 0.8, 1.9)],
      n: front === 'n' ? [K.win(-5.2, 3.4, 0.9, 1.9)] : [K.gap(-3.95, 0.9, 2.0)],
      s: front === 's' ? [K.win(-5, 3, 0.9, 1.9)] : [K.gap(-3.95, 0.9, 2.0)],
      floor: 'platform', ceil: 'train',
    });
    K.deco('trainTrim', -5.8, PF + 0.3, z0, -5.76, PF + 0.55, z1);
    K.deco('trainTrim', -1.24, PF + 0.3, z0, -1.2, PF + 0.55, z1);
    // benches along the windows, handrails
    for (const [a, b] of [[z0 + 0.3, doorsZ[0] - 0.2], [doorsZ[0] + 1.5, doorsZ[1] - 0.2], [doorsZ[1] + 1.5, z1 - 0.3]]) {
      if (b - a < 0.8) continue;
      K.box('chair', -1.9, PF, a, -1.45, PF + 0.45, b);
    }
    K.rod('steel', V(-3.5, PF + 2.05, z0 + 0.5), V(-3.5, PF + 2.05, z1 - 0.5), 0.02);
    K.navGrid(-4.4, -2.9, z0 + 0.8, z1 - 0.8, PF, 1.5);
  };
  carriage(-24, -8, 's');
  carriage(-41, -25, 'n');
  K.box('platform', -4.2, 0.9, -25, -2.8, PF, -24, { edges: false });
  K.deco('ink', -4.3, PF, -25, -4.2, PF + 2.1, -24);
  K.deco('ink', -2.8, PF, -25, -2.7, PF + 2.1, -24);
  K.collider(-4.3, PF, -25, -4.2, PF + 2.1, -24, MOVE);
  K.collider(-2.8, PF, -25, -2.7, PF + 2.1, -24, MOVE);
  // driver's cab at the north end of carriage 2
  K.wall('train', 'x', -39.4, 0.1, -5.6, -1.4, PF, PF + 2.4, [K.gap(-3.9, 0.9, 2.0)]);
  K.box('panel', -5.5, PF, -40.8, -4.3, PF + 0.9, -40.2);

  // ------------------------------------------------------------ electrical rooms
  K.room(-24, -40, -14, -30, PF, { role: 'concrete', h: 3, e: [{ a: -36, b: -35, lo: 0, hi: 2.1, kind: 'door' }], floor: 'concrete', ceil: 'ceiling' });
  K.doorAt('z', -14, -36, 1.0, PF);
  K.room(14, -48, 24, -38, PF, { role: 'concrete', h: 3, w: [{ a: -44, b: -43, lo: 0, hi: 2.1, kind: 'door' }], floor: 'concrete', ceil: 'ceiling' });
  K.doorAt('z', 14, -44, 1.0, PF);
  for (const [x0, x1, z0, z1] of [[-23.7, -21.5, -39.7, -37.5], [21.5, 23.7, -40.5, -38.3]]) K.box('machine', x0, PF, z0, x1, PF + 2.2, z1);
  for (let i = 0; i < 4; i++) { K.box('pipe', -23.8, PF + 0.4, -31 - i * 0.5, -23.5, PF + 2.7, -30.8 - i * 0.5); K.box('pipe', 23.5, PF + 0.4, -47 + i * 0.5, 23.8, PF + 2.7, -46.8 + i * 0.5); }
  K.lampLight(-19, PF + 2.95, -35, { sx: 1.2 });
  K.lampLight(19, PF + 2.95, -43, { sx: 1.2 });
  K.interact('powerW', -23.6, PF + 1.1, -34.5, { prompt: 'prompt.power', face: 'e', from: 1 });
  K.interact('powerE', 23.6, PF + 1.1, -42.5, { prompt: 'prompt.power', face: 'w', from: 1 });
  K.navGrid(-23, -15, -39, -31, PF, 1.8);
  K.navGrid(15, 23, -47, -39, PF, 1.8);

  // ------------------------------------------------------------ tunnel + maintenance exit
  K.wall('concrete', 'z', -6, 0.3, -92, -62, 0, 4.5);
  K.wall('concrete', 'z', 6, 0.3, -92, -62, 0, 4.5, [{ a: -84, b: -83, lo: 0, hi: 2.1, kind: 'door' }]);
  K.wall('concrete', 'x', -92, 0.3, -6, 6, 0, 4.5);
  K.deco('ceiling', -6.2, 4.5, -92.2, 6.2, 4.7, -62);
  K.collider(-6.2, 4.5, -92.2, 6.2, 4.7, -62, MOVE, null, 'roof');
  for (let z = -88; z < -64; z += 3) K.rod('pipe', V(5.6, 3.6, z), V(5.6, 3.6, z + 2.5), 0.08);
  K.lampLight(0, 4.45, -70, { sx: 0.3, sz: 1 });
  K.lampLight(0, 4.45, -86, { sx: 0.3, sz: 1 });
  K.box('concrete', -6, 0, -76.5, -5, 2.2, -75.5, { col: false });
  K.room(6, -90, 14, -78, 0, { role: 'concrete', h: 3.2, w: [{ a: -84, b: -83, lo: 0, hi: 2.1, kind: 'door' }], ceil: 'ceiling' });
  K.door({ hx: 6, hz: -84, angle: Math.PI / 2, w: 1.0, h: 2.08, y0: 0, id: 'maint', locked: true, role: 'steel' });
  for (const x of [11.7, 12.3]) K.rod('steel', V(x, 0, -89.8), V(x, 3.2, -89.8), 0.03);
  for (let y = 0.3; y < 3.2; y += 0.32) K.rod('steel', V(11.7, y, -89.8), V(12.3, y, -89.8), 0.015, 4, { edges: false });
  K.deco('steel', 11.4, 3.15, -89.9, 12.6, 3.25, -88.8);
  K.sign('MAINTENANCE', 5.8, 2.6, -83.5, 2.6, 0.4, -1, 'x');
  K.sign('NO ENTRY', 0, 4.1, -62.3, 3, 0.45, 1);
  K.lampLight(10, 3.15, -84);

  // ------------------------------------------------------------ nav
  K.navGrid(-18, 18, 31, 46, ST, 3);
  K.navGrid(-17, 17, -5, 23, CC, 2.2);
  K.navGrid(-13.4, -6.6, -61.4, 13.4, PF, 1.7);
  K.navGrid(6.6, 13.4, -61.4, 13.4, PF, 1.7);
  K.navGrid(-5.4, 5.4, -61.5, 13.4, 0, 2);
  K.navGrid(-5.4, 5.4, -91, -62.5, 0, 2.2);
  K.navGrid(7, 13, -89, -79, 0, 1.8);
  K.bounds(-26, -95, 26, 50);

  // ------------------------------------------------------------ enemies
  K.spawn(-13.5, CC, 12, E, 'pistol');
  K.spawn(-6, CC, 8, S, 'smg', { patrol: [[-6, 8], [6, 8], [6, 16], [-6, 8]] });
  K.spawn(5, CC, -1, S, 'shotgun', { hold: true });
  K.spawn(12, CC, -3, S, 'rifle', { hold: true });
  K.spawn(-12, CC, -1, E, 'smg');
  K.spawn(-10, PF, -30, S, 'smg', { patrol: [[-10, -30], [-10, -52], [-10, -30]] });
  K.spawn(-12.5, PF, -20, E, 'pistol');
  K.spawn(-3.6, PF, -14, S, 'shotgun', { hold: true });
  K.spawn(10, PF, -56, S, 'rifle', { hold: true });
  K.spawn(11, PF, -24, W, 'smg', { patrol: [[11, -24], [11, -48], [11, -24]] });
  K.spawn(11.5, PF, -40.5, W, 'heavy', { hold: true });
  K.spawn(-19, PF, -33, E, 'pistol', { hold: true });
  K.spawn(0, 0, -74, S, 'rifle', { hold: true });
  K.spawn(-3, 0, -86, S, 'smg', { hold: true });
  // after the power comes back: both platforms and the train
  K.spawn(-10, PF, -58, S, 'smg', { group: 'final' });
  K.spawn(-12.5, PF, -54, S, 'rifle', { group: 'final' });
  K.spawn(-3.6, PF, -33, S, 'shotgun', { group: 'final' });
  K.spawn(-3.2, PF, -37, S, 'pistol', { group: 'final', weapon: 'revolver' });
  K.spawn(10, PF, 6, N, 'smg', { group: 'final' });
  K.spawn(12, PF, 2, N, 'heavy', { group: 'final' });
  K.entry('tunnelN', 0, 0, -90, S);
  K.entry('hallS', 0, CC, 20, N);
  K.entry('trackS', -3, 0, 12, N);
  K.entry('platW', -12.5, PF, -60, S);
  K.entry('platE', 12.5, PF, -60, S);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, ST, 44, N);
  K.zone('platforms', -14, -0.5, -62, 14, 3.5, 14);
  K.zone('exit', 6.3, -1, -90, 14, 4, -78);
  K.checkpoint(0, CC, 12, N, { need: 0, r: 5 });
  K.checkpoint(0, PF, -20, N, { need: 1, r: 11, at: [-10, PF, -19, N] });
  K.checkpoint(0, PF, -40, N, { need: 2, r: 13, at: [10, PF, -36, N] });
  K.secret(-15.5, CC, 18.5);
  K.secret(-2.6, PF, -40.5);
  K.secret(-5.4, 0, -73);
  K.item('health', -2, CC, 20, { tier: 3 });
  K.item('ammo', 14.5, CC, 18);
  K.item('health', -12, PF, -8, { tier: 2 });
  K.item('ammo', -2.4, PF, -20);
  K.item('health', -16, PF, -38);
  K.item('ammo', 16, PF, -46);
  K.item('health', 12.5, PF, -30, { tier: 2 });
  K.item('health', 2, 0, -64, { tier: 3 });
  K.item('ammo', -12, PF, -45, { tier: 2 });
  K.weapon('shotgun', -1.68, PF + 0.47, -18, 0.3);
  K.weapon('rifle', -13.8, CC, 16.2, 0.2);
  K.weapon('mpistol', 20, PF, -46.5, 1.1);
  K.area('area.L3.hall', -30, -6, 30, 60, CC - 0.3, 30);
  K.area('area.L3.platform', -30, -62, 30, 20, -1, CC - 0.5);
  K.area('area.L3.tunnel', -30, -120, 30, -62);
  K.data.arenas.push({ x: 0, y: CC, z: 10, yaw: N, entries: ['hallS', 'platW', 'platE'] });
  K.data.arenas.push({ x: -10, y: PF, z: -30, yaw: S, entries: ['tunnelN', 'platE', 'trackS'] });
  yield 1;
}

// Restoring power: lights steady, hum instead of silence.
const hooks = {
  power(g) {
    if (g.hazards.flicker) g.hazards.flicker.on = false;
    g.audio.play('powerUp', { gain: 0.8 });
    g.audio.setAmbience(['hum']);
  },
};

export default {
  id: 'L3',
  num: 3,
  bounds: { x0: -40, z0: -110, x1: 40, z1: 60 },
  mapBounds: { x0: -26, x1: 26, z0: -94, z1: 50 },
  par: 450,
  loadout: { main: ['smg', 32, 128], side: ['pistol', 12, 48] },
  env: {
    classic: { paper: 0xe9e9e9, fog: [9, 62] },
    neo: { sky: ['#0b1030', '#141a44', '#1f2754', '#0d1128'], fog: 0x1a2046, fogRange: [12, 80], sun: [20, 60, 30], sunColor: 0xfff2d0, sunI: 0.22, hemiI: 0.9, hemiSky: 0xd8e6ff, hemiGround: 0x5a4a8a, clouds: false, shadowBox: 34 },
    flicker: true,
    ambience: [],
    reverb: 0.4,
  },
  groundSurf: 'indoor',
  menuOrbit: { x: 0, z: -24, r: 26, h: 14, look: 1 },
  previewCam: { p: [-9.5, PF + 1.65, -44], yaw: -0.18, pitch: 0.02 },
  objectives: [
    { key: 'L3.o1', type: 'reach', zone: 'platforms', marker: [-10, PF + 1.2, -18] },
    { key: 'L3.o2', type: 'interact', ids: ['powerW'] },
    { key: 'L3.o3', type: 'interact', ids: ['powerE'], onComplete: [{ hook: 'power' }, { spawn: 'final' }, { unlock: 'maint' }, { music: 'combat' }] },
    { key: 'L3.o4', type: 'reach', zone: 'exit', marker: [10, 1.2, -84], final: true },
  ],
  hooks,
  saveState(g) { return { power: !!(g.hazards.flicker && !g.hazards.flicker.on) }; },
  loadState(g, s) { if (g.hazards.flicker) g.hazards.flicker.on = !(s && s.power); g.audio.setAmbience(s && s.power ? ['hum'] : []); },
  build,
};
