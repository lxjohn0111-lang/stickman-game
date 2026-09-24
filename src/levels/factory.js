// Level 6 - Industrial Factory.
//   loading yard -> production hall: three assembly lines (low conveyor
//   belts that carry you, slow presses, timed steam vents), furnaces on the
//   west side, a storage room, a control booth on the north catwalk and the
//   freight elevator in the east. Each production control stops its line's
//   presses and vents; the transfer belt keeps running for the last fight.
import * as THREE from 'three';
import { MOVE } from '../world.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const BT = 0.35; // belt top
const CW = 4.5; // catwalk level
const H = 10; // hall height

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ yard outside
  K.ground('asphalt', -80, -90, 80, 60);
  for (let x = -30; x <= 30; x += 6) K.detail(x, 0.02, 14, x + 3, 0.02, 14);
  K.fence(-40, 40, 40, 40);
  K.fence(-40, 12, -40, 40);
  K.fence(40, 12, 40, 40);
  K.container(-26, 26, { role: 'cont3' });
  K.container(24, 30, { rot: 1, role: 'cont2' });
  K.crateStack(-12, 30);
  K.crateStack(10, 20);
  for (const x of [-20, 20]) K.lampPost(x, 16, { arm: x < 0 ? 1 : -1 });
  // chimneys: the landmark from outside
  for (const [x, z, h] of [[-30, -18, 26], [-30, -30, 22]]) { K.cyl('brick', x, h / 2, z, 1.4, 2, h, 12); K.cyl('ink', x, h + 0.1, z, 1.4, 1.4, 0.2, 12); }
  K.bounds(-40, -58, 40, 40);

  // ------------------------------------------------------------ hall shell
  const X0 = -36, X1 = 36, Z0 = -52, Z1 = 10;
  K.wall('brick', 'x', Z1, 0.4, X0, X1, 0, H, [K.gap(-3, 6, 4.6), ...K.wins(-34, -6, 3, 5, 6, 8.5), ...K.wins(6, 34, 3, 5, 6, 8.5)]);
  K.wall('brick', 'x', Z0, 0.4, X0, X1, 0, H, [K.gap(-14, 4, 4), ...K.wins(-34, -16, 3, 5, 6, 8.5), ...K.wins(-8, 34, 3, 5, 6, 8.5)]);
  K.wall('brick', 'z', X0, 0.4, Z0, Z1, 0, H, [K.op(-21, 1.2, 2.4), ...K.wins(-50, -24, 3, 5, 6, 8.5), ...K.wins(-18, 8, 3, 5, 6, 8.5)]);
  K.wall('brick', 'z', X1, 0.4, Z0, Z1, 0, H, [K.op(-31, 1.2, 2.4), ...K.wins(-50, -34, 3, 5, 6, 8.5), ...K.wins(-2, 8, 3, 5, 6, 8.5)]);
  K.doorAt('z', X0, -21, 1.2, 0, { role: 'steel', h: 2.35 });
  K.doorAt('z', X1, -31, 1.2, 0, { role: 'steel', h: 2.35 });
  K.deco('roof', X0 - 0.3, H, Z0 - 0.3, X1 + 0.3, H + 0.3, Z1 + 0.3);
  K.collider(X0, H, Z0, X1, H + 0.3, Z1, MOVE, null, 'roof');
  for (let x = -33; x < 34; x += 6) K.box('steel', x - 0.12, H - 1, Z0, x + 0.12, H, Z1, { col: false });
  K.deco('concrete', X0, -0.28, Z0, X1, 0.012, Z1, { edges: false });
  for (let z = -48; z < 8; z += 6) K.detail(X0 + 0.3, 0.015, z, X1 - 0.3, 0.015, z);
  K.sign('PLANT 3', 0, 5.4, 10.25, 4, 0.9, 1);
  K.deco('ink', -2.2, 4.9, 10.2, 2.2, 5.9, 10.3);
  for (const [x, z] of [[-18, -2], [0, -2], [18, -2], [-18, -26], [0, -26], [18, -26], [-18, -42], [0, -42]]) K.lampLight(x, H - 0.7, z, { sx: 3, sz: 0.4 });

  // ------------------------------------------------------------ assembly lines
  const lines = [{ z: -8, press: -2.5, vents: [[8, -11], [-14, -4.6]] }, { z: -20, press: 7.5, vents: [[-8, -23.4], [12, -16.6]] }, { z: -32, press: -14.5, vents: [[0, -35.4], [-20, -28.6]] }];
  for (const L of lines) K.conveyor({ x0: -26, z0: L.z - 0.8, x1: 18, z1: L.z + 0.8, y: BT, dir: 'e', speed: 1.5 });
  K.conveyor({ x0: 21.2, z0: -34.5, x1: 22.8, z1: 2, y: BT, dir: 'n', speed: 1.8 });
  lines.forEach((L, i) => {
    K.press({ x0: L.press - 1.4, z0: L.z - 0.8, x1: L.press + 1.4, z1: L.z + 0.8, yTop: 3.2, yLow: BT + 0.1, headH: 0.6, period: 5.6, phase: i * 1.7, floorY: BT, posts: 'z' });
    for (const [vx, vz] of L.vents) K.vent({ x: vx, z: vz, r: 0.75, period: 5 + i * 0.4, burst: 1.3, phase: i * 1.3 + vx * 0.1 });
    K.box('machine', -29, 0, L.z - 1.2, -26, 2.2, L.z + 1.2);
    K.box('machine', 18, 0, L.z - 1.1, 20, 1.6, L.z + 1.1);
    K.deco('hazard', -28.6, 2.2, L.z - 0.9, -26.4, 2.3, L.z + 0.9);
    K.sign(['LINE A', 'LINE B', 'LINE C'][i], -27.5, 3.2, L.z + 1.22, 2.2, 0.45, 1);
  });
  // overhead pipes
  for (const z of [-14, -26, -38]) K.rod('pipe', V(-34, 7.2, z), V(34, 7.2, z), 0.18, 8);
  for (const x of [-20, 0, 20]) K.rod('pipe', V(x, 7.2, -50), V(x, 7.2, 8), 0.12, 8);

  // ------------------------------------------------------------ furnaces (west)
  for (const z of [-12, -26]) {
    K.cyl('furnace', -32, 3.5, z, 2.6, 3, 7, 12);
    K.box('ink', -29.4, 0.6, z - 1, -29.2, 2.4, z + 1, { col: false });
    K.box('furnace', -29.5, 0.8, z - 0.8, -29.3, 2.2, z + 0.8, { col: false });
    K.collider(-35, 0, z - 3, -29, 7, z + 3);
    K.rod('pipe', V(-32, 7, z), V(-32, H, z), 0.5, 10);
  }
  K.box('machine', -31, 0, -40.8, -29.5, 1.4, -39.2);
  K.interact('ctrlC', -29.4, 1.1, -40, { prompt: 'prompt.control', face: 'e', actions: [{ hook: 'line2' }] });
  K.sandbags(-26, -46, -24, -45, 1.1);

  // ------------------------------------------------------------ storage room (north-east)
  K.room(22, -52, 36, -36, 0, { role: 'wall', h: 4, w: [K.op(-42, 1.0)], s: [K.op(28, 1.0)], ceil: 'ceiling' });
  K.doorAt('z', 22, -42, 1.0);
  K.doorAt('x', -36, 28, 1.0);
  K.shelf(24, -50.5, 34, -49.7, 2.4);
  K.shelf(24, -46, 30, -45.2, 2.4);
  K.crateStack(31, -41);
  K.box('machine', 35.4, 0, -46, 35.8, 1.4, -44);
  K.interact('ctrlB', 35.3, 1.1, -45, { prompt: 'prompt.control', face: 'w', actions: [{ hook: 'line1' }] });
  K.lampLight(29, 3.95, -44);

  // ------------------------------------------------------------ north catwalk + control booth
  K.catwalk(-24, -49.6, -4, -46.4, CW, { rails: 's', legs: true, gaps: [{ side: 's', a: -23.6, b: -21.4 }] });
  K.catwalk(4, -49.6, 14, -46.4, CW, { rails: 's', legs: true, gaps: [{ side: 's', a: 11.4, b: 13.6 }] });
  K.catwalk(-23.4, -46.4, -21.6, -43.5, CW, { rails: 'ew', legs: false });
  K.catwalk(11.6, -46.4, 13.4, -43.5, CW, { rails: 'ew', legs: false });
  K.stairs({ x: -22.5, z: -37.8, y0: 0, dir: 'n', n: 18, rise: CW / 18, run: 0.32, w: 1.6, role: 'steel' });
  K.stairs({ x: 12.5, z: -37.8, y0: 0, dir: 'n', n: 18, rise: CW / 18, run: 0.32, w: 1.6, role: 'steel' });
  K.box('catwalk', -4, CW - 0.2, -50, 4, CW, -45.2);
  K.room(-4, -50, 4, -45.2, CW, { role: 'panel', h: 2.8, t: 0.15, s: K.wins(-3.5, 3.5, 1.6, 2.2, 0.9, 2.3), w: [K.op(-48.5, 1.0)], e: [K.op(-48.5, 1.0)], ceil: 'ceiling' });
  K.doorAt('z', -4, -48.5, 1.0, CW);
  K.doorAt('z', 4, -48.5, 1.0, CW);
  K.box('machine', -2, CW, -49.9, 2, CW + 0.9, -49.3);
  K.interact('ctrlA', 0, CW + 1.1, -49.1, { prompt: 'prompt.control', face: 's', actions: [{ hook: 'line0' }] });
  K.navGrid(-3, 3, -49, -46, CW, 1.5);
  K.sign('CONTROL', 0, CW + 3.1, -45.1, 2.2, 0.4, 1);

  // ------------------------------------------------------------ freight elevator (east)
  K.wall('steel', 'x', -14, 0.3, 26, 34, 0, H);
  K.wall('steel', 'x', -4, 0.3, 26, 34, 0, H);
  K.wall('steel', 'z', 34, 0.3, -14, -4, 0, H);
  for (const z of [-14, -4]) K.box('hazard', 25.6, 0, z - 0.2, 26.2, H, z + 0.2);
  K.door({ hx: 26, hz: -13.8, angle: Math.PI / 2, w: 4.8, h: 3.4, id: 'liftGate', locked: true, role: 'hazard', panels: false, name: 'Gate' });
  K.door({ hx: 26, hz: -4.2, angle: -Math.PI / 2, w: 4.8, h: 3.4, id: 'liftGate2', locked: true, role: 'hazard', panels: false, name: 'Gate', noNav: true });
  K.lift({ id: 'freight', x0: 26.3, z0: -13.7, x1: 33.7, z1: -4.3, y0: 8.5, y1: 0, speed: 0.19 });
  K.box('machine', 25.2, 0, -3.8, 25.8, 1.6, -2.8);
  K.interact('callLift', 25.1, 1.1, -3.3, { prompt: 'prompt.lift', face: 'w', from: 1 });
  K.sign('FREIGHT', 25.9, 4, -9, 3, 0.6, -1, 'x');
  K.navGrid(27, 33, -13, -5, 0, 2);

  // ------------------------------------------------------------ nav
  K.navGrid(-38, 38, 12, 38, 0, 3);
  K.navGrid(-35.2, 35.2, -51.2, 9.2, 0, 1.8);
  K.navGrid(23, 35, -51, -37, 0, 1.8);
  K.navGrid(-14, -8, -57, -53, 0, 2);
  K.navGrid(-39.5, -36.8, -24, -16, 0, 1.4);
  K.navGrid(36.8, 39.5, -34, -26, 0, 1.4);

  // ------------------------------------------------------------ enemies
  K.spawn(-14, 0, 24, E, 'smg', { patrol: [[-14, 24], [14, 24], [-14, 24]] });
  K.spawn(16, 0, 34, S, 'pistol');
  K.spawn(-6, 0, 2, S, 'shotgun', { hold: true });
  K.spawn(10, 0, 3, S, 'smg');
  K.spawn(-20, 0, -14, E, 'smg', { patrol: [[-20, -14], [14, -14], [-20, -14]] });
  K.spawn(4, 0, -26, S, 'pistol');
  K.spawn(-10, 0, -38, E, 'rifle', { hold: true });
  K.spawn(-18, CW, -47.5, S, 'rifle', { perch: true });
  K.spawn(8, CW, -47.5, S, 'rifle', { perch: true });
  K.spawn(-1, CW, -46.3, S, 'smg', { hold: true });
  K.spawn(-26, 0, -34, E, 'shotgun', { hold: true });
  K.spawn(-27, 0, -20, E, 'pistol', { hold: true, weapon: 'revolver' });
  K.spawn(28, 0, -44, W, 'heavy', { hold: true });
  K.spawn(32, 0, -39, W, 'smg', { hold: true });
  K.spawn(28, 0, -20, W, 'rifle', { hold: true });
  K.spawn(30, 0, 2, W, 'smg', { patrol: [[30, 2], [30, -18], [30, 2]] });
  K.entry('westDoor', -38, 0, -20.4, E, null);
  K.entry('eastDoor', 38, 0, -30.4, W, null);
  K.entry('south', 0, 0, 16, N);
  K.entry('dock', -12, 0, -56, S);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, 0, 32, N);
  K.zone('liftArea', 14, -1, -24, 26, 4, 6);
  K.zone('lift', 26.5, -1, -13.5, 33.5, 3, -4.5);
  K.checkpoint(0, 0, 4, N, { need: 0, r: 7 });
  K.checkpoint(0, 0, -26, N, { need: 0, r: 10, at: [-4, 0, -24, N] });
  K.checkpoint(20, 0, -8, E, { need: 1, r: 8 });
  K.secret(-34.2, 0, -50.2);
  K.secret(13.4, CW, -49);
  K.secret(35, 0, -51);
  K.item('health', 6, 0, 30, { tier: 3 });
  K.item('ammo', -8, 0, 22);
  K.item('health', -24, 0, 6);
  K.item('ammo', 12, 0, -2);
  K.item('health', 16, 0, -38, { tier: 2 });
  K.item('ammo', -22, CW, -48.2);
  K.item('health', 26, 0, -48);
  K.item('ammo', 34, 0, -38);
  K.item('health', 18, 0, -14, { tier: 2 });
  K.item('ammo', -30, 0, -44, { tier: 2 });
  K.item('health', 24, 0, 6, { tier: 3 });
  K.weapon('shotgun', -27.5, 0, -12.5, 0.2);
  K.weapon('burst', 1.2, CW + 0.93, -49.6, 0);
  K.weapon('mpistol', 25, 0, -51.2, 0.8);
  K.area('area.L6.floor', -36, -52, 22, 10);
  K.area('area.L6.store', 22, -52, 36, -36);
  K.area('area.L6.furnace', -36, -52, -26, 10);
  K.data.arenas.push({ x: 0, y: 0, z: -14, yaw: N, entries: ['westDoor', 'eastDoor', 'south', 'dock'] });
  yield 1;
}

// Each production control stops its line: belt, press and steam vents.
function stopLine(g, i) {
  const L = g.level.data.conveyors[i];
  if (L) L.conv.on = false;
  const p = g.hazards.presses[i];
  if (p) p.off = true;
  for (const v of g.hazards.vents.slice(i * 2, i * 2 + 2)) v.off = true;
  g.audio.play('powerUp', { gain: 0.5, rate: 0.7 });
}

export default {
  id: 'L6',
  num: 6,
  bounds: { x0: -60, z0: -80, x1: 60, z1: 60 },
  mapBounds: { x0: -40, x1: 40, z0: -58, z1: 40 },
  par: 540,
  loadout: { main: ['shotgun', 6, 30], side: ['mpistol', 20, 80] },
  env: {
    classic: { paper: 0xf2f2f2, fog: [22, 120] },
    neo: { sky: ['#232642', '#454a70', '#8d99ae', '#5c6078'], fog: 0x6d7394, fogRange: [34, 150], sun: [20, 50, 12], sunColor: 0xfff0dc, sunI: 0.34, hemiI: 0.82, hemiSky: 0xfff0e0, hemiGround: 0x6a5a9a, clouds: false, shadowBox: 42 },
    ambience: ['hum'],
    reverb: 0.18,
  },
  groundSurf: 'indoor',
  menuOrbit: { x: 0, z: -20, r: 58, h: 30, look: 2 },
  previewCam: { p: [-12, 1.7, 0], yaw: -0.5, pitch: -0.02 },
  objectives: [
    { key: 'L6.o1', type: 'interact', ids: ['ctrlA', 'ctrlB', 'ctrlC'] },
    { key: 'L6.o2', type: 'interact', ids: ['callLift'] },
    {
      key: 'L6.o3', type: 'survive', time: 45, zone: 'liftArea', marker: [22, 1.4, -9],
      onStart: [{ lift: { id: 'freight', y: 0 } }, { sound: 'elevator' }, { music: 'combat' }],
      waves: [
        { at: 1, count: 3, roles: ['smg', 'shotgun', 'pistol'], entries: ['westDoor', 'south'] },
        { at: 15, count: 3, roles: ['rifle', 'smg', 'shotgun'], entries: ['eastDoor', 'dock'] },
        { at: 29, count: 4, roles: ['heavy', 'smg', 'rifle', 'shotgun'], entries: ['westDoor', 'eastDoor', 'south'] },
      ],
      onComplete: [{ open: 'liftGate' }, { open: 'liftGate2' }, { music: 'calm' }, { sound: 'objective' }],
    },
    { key: 'L6.o4', type: 'reach', zone: 'lift', marker: [30, 1.4, -9], final: true },
  ],
  hooks: {
    line0(g) { stopLine(g, 0); },
    line1(g) { stopLine(g, 1); },
    line2(g) { stopLine(g, 2); },
  },
  build,
};
