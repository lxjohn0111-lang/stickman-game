// Level 2 - Container Port, at sunset.
//   container yard (stacked rows: narrow gaps between open lanes, walk-through
//   containers, a gantry crane) -> warehouse (shelves, catwalk, office)
//   -> quay with a moored cargo ship -> harbour control room -> security gate.
// North is -Z. The yard is fenced off from the quay, so the way on is
// through the warehouse; the quay and ship give long sightlines.
import * as THREE from 'three';
import { MOVE } from '../world.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const CT = 2.6; // container height

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ ground, water, bounds
  K.ground('asphalt', -70, -110, 44, 70);
  K.deco('platform', -8, -0.28, -90, 44, 0.015, -7.6, { edges: false });
  for (let z = 44; z > -6; z -= 6) K.detail(-47, 0.02, z, 41, 0.02, z);
  K.deco('water', 44, -1.6, -120, 170, -0.7, 90, { edges: false });
  K.deco('concrete', 43.7, -1.6, -120, 44.2, 0.05, 90, { edges: false });
  K.line(44.2, 0.05, -120, 44.2, 0.05, 90);
  K.collider(44.1, -2, -120, 44.8, 6, -9.3, MOVE);
  K.collider(44.1, -2, -6.7, 44.8, 6, 90, MOVE);
  K.bounds(-50, -96, 64, 50);
  K.mapRect(44.2, -96, 64, 50, 'water');
  for (let z = -60; z < 44; z += 6.5) K.cyl('steel', 43, 0.35, z, 0.18, 0.22, 0.7, 8);

  // south fence with the closed entry gate behind the player
  K.fence(-50, 49, -4, 49);
  K.fence(4, 49, 44, 49);
  K.box('steel', -4, 0, 48.7, 4, 2.6, 49.1, { edges: true });
  for (let x = -3.5; x < 4; x += 0.5) K.line(x, 0.1, 48.68, x, 2.5, 48.68);
  K.fence(-50, 49, -50, -7.6);

  // ------------------------------------------------------------ container yard
  const rows = [
    { z: 34, list: [[-36, 'cont1'], [-22.6, 'cont2', 2], [-9.2, 'cont3', 1, 'both'], [9.5, 'cont4'], [22.9, 'cont1', 2], [36.3, 'cont2']] },
    { z: 22, list: [[-40, 'cont3'], [-26.6, 'cont4'], [-11.4, 'cont1'], [1.8, 'cont2', 1, 'both'], [17.1, 'cont3'], [30.5, 'cont4', 2]] },
    { z: 10, list: [[-35, 'cont2'], [-18, 'cont1', 2], [-0.4, 'cont4', 1, 'both'], [12.8, 'cont3'], [28.1, 'cont2', 2]] },
    { z: -2, list: [[4, 'cont1'], [17.5, 'cont3'], [30.5, 'cont2', 2], [-30, 'cont4']] },
  ];
  for (const r of rows) {
    for (const [x, role, h = 1, doors = null] of r.list) {
      K.container(x, r.z, { role, doors });
      if (h > 1) K.container(x, r.z, { y: CT, role: role === 'cont1' ? 'cont3' : 'cont1' });
    }
  }
  // loose containers turned across the lanes as cover
  K.container(-6, 28, { rot: 1, len: 6.1, role: 'cont4' });
  K.container(24, 16, { rot: 1, len: 6.1, role: 'cont1' });
  K.container(-28, 4, { rot: 1, len: 6.1, role: 'cont2' });
  K.crateStack(-44, 28);
  K.crateStack(38, 4);
  K.crateStack(-4, 41);
  // ladder + catwalk between two stacked tops (row 2 and row 3, east side)
  K.ladder({ x: 33.5, z: 23.25, y0: 0, y1: CT * 2, face: 'n' });
  K.catwalk(26.5, 11.3, 29.5, 20.7, CT * 2, { rails: 'ew', legs: false });
  K.ladder({ x: -18, z: 11.25, y0: 0, y1: CT * 2, face: 'n' });

  // gantry crane over the yard: landmark with a platform on one leg
  for (const [x, z] of [[-34, 4], [-34, 16], [14, 4], [14, 16]]) {
    K.box('crane', x - 0.45, 0, z - 0.45, x + 0.45, 16, z + 0.45);
    K.box('crane', x - 0.9, 0, z - 0.9, x + 0.9, 0.5, z + 0.9);
  }
  K.deco('crane', -35, 15, 3.4, 15, 16.6, 4.6);
  K.deco('crane', -35, 15, 15.4, 15, 16.6, 16.6);
  K.deco('crane', -34.6, 15, 4.6, -33.4, 16.6, 15.4);
  K.deco('crane', 13.4, 15, 4.6, 14.6, 16.6, 15.4);
  for (let x = -32; x < 14; x += 4) { K.rod('crane', V(x, 15, 4), V(x + 2, 11.5, 4), 0.09); K.rod('crane', V(x + 2, 11.5, 4), V(x + 4, 15, 4), 0.09); }
  K.deco('steel', -6, 14.2, 3.2, -2, 15, 16.8);
  K.deco('crane', -5.2, 11.6, 8.4, -2.8, 14.2, 11.2);
  K.pane(-5.21, 12.4, 8.6, -5.19, 13.8, 11.0, { edges: true });
  K.rod('steel', V(-4, 14.2, 12.5), V(-4, 6, 12.5), 0.03);
  K.box('steel', -4.6, 5.4, 11.9, -3.4, 6, 13.1);
  K.catwalk(14.45, 14.6, 17.4, 17.4, 8, { rails: 'new', legs: false });
  K.ladder({ x: 16, z: 17.45, y0: 0, y1: 8, face: 'n' });
  K.sign('CRANE 2', -4, 13.4, 16.7, 3, 0.7, 1);

  // ------------------------------------------------------------ warehouse
  K.room(-44, -34, -8, -8, 0, {
    role: 'shed', h: 8, t: 0.3,
    s: [K.gap(-30, 6, 4.6), K.op(-20, 1.0), ...K.wins(-42, -9, 2, 4, 5.4, 6.8, [[-31, -19]])],
    e: [K.gap(-24, 5, 4.6), ...K.wins(-33, -9, 2, 4, 5.4, 6.8, [[-25, -18]])],
    n: K.wins(-42, -9, 2, 4, 5.4, 6.8),
    w: K.wins(-33, -9, 2, 4, 5.4, 6.8),
    ceil: 'shed',
  });
  K.doorAt('x', -8, -20, 1.0);
  for (let x = -30; x < -24; x += 0.35) K.line(x, 4.6, -7.84, x, 4.9, -7.84);
  K.shelf(-40, -15, -30, -14);
  K.shelf(-40, -20.5, -30, -19.5);
  K.shelf(-40, -26, -32, -25);
  K.crateStack(-26, -14);
  K.crateStack(-20, -22);
  K.crate(-16, 0, -12);
  // forklift
  K.box('crane', -14.8, 0.2, -18.2, -12.8, 1.3, -16.8);
  K.deco('ink', -14.6, 1.3, -17.9, -13.8, 2.5, -17.1);
  K.deco('steel', -15.6, 0.05, -18.1, -14.8, 0.12, -17.9);
  K.deco('steel', -15.6, 0.05, -17.1, -14.8, 0.12, -16.9);
  // office in the north-west corner
  K.room(-44, -34, -36, -26, 0, { role: 'wall', h: 3.2, e: [K.op(-31, 1.0)], s: [K.win(-42, 2)], ceil: 'ceiling' });
  K.doorAt('z', -36, -31, 0.95);
  K.tableSet(-40, -30, { chairs: 2 });
  // catwalk along the north wall with a stair
  K.stairs({ x: -12, z: -24, y0: 0, dir: 'n', n: 16, rise: 0.25, run: 0.35, w: 1.2 });
  K.catwalk(-43.6, -33.6, -9, -30.2, 4, { rails: 's', legs: true, gaps: [{ side: 's', a: -12.8, b: -11.2 }] });
  K.lampLight(-26, 7.7, -21, { sx: 3, sz: 0.3 });
  K.lampLight(-16, 7.7, -21, { sx: 3, sz: 0.3 });
  K.sign('WAREHOUSE 4', -27, 5.4, -7.8, 6, 1.1, 1);

  // fence between the yard and the quay: the way on is the warehouse
  K.fence(-8, -7.6, 44, -7.6);
  K.fence(-50, -7.6, -44.2, -7.6);

  // ------------------------------------------------------------ quay + ship
  for (const [x, z] of [[18, -20], [30, -30], [-2, -28]]) K.container(x, z, { rot: 1, len: 6.1, role: 'cont3' });
  K.container(-15, -40, { role: 'cont2' });
  K.container(-15, -40, { y: CT, role: 'cont4' });
  K.container(18, -44, { rot: 1, role: 'cont1' });
  K.container(-18, -52, { rot: 1, role: 'cont3' });
  K.crate(25, 0, -12);
  K.crateStack(34, -40);
  K.barrier(8, -24, 'x');
  K.barrier(-4, -18, 'z');
  for (const z of [-50, -34, -18]) K.lampPost(41, z, { arm: -1 });
  // ship alongside
  K.box('hull', 47, -3, -50, 63, 5.5, 10, { surf: 'metal' });
  K.box('hull', 49, -3, 10, 61, 5.5, 16, { surf: 'metal' });
  K.box('hull', 52, -3, 16, 58, 5.5, 20, { surf: 'metal' });
  K.deco('deck', 47.2, 5.5, -49.8, 62.8, 5.52, 9.8, { edges: false });
  for (const x of [47.15, 62.85]) K.rod('steel', V(x, 6.5, -49.5), V(x, 6.5, 9.5), 0.03);
  K.collider(47.05, 5.5, -50, 47.25, 6.6, -9.3, MOVE);
  K.collider(47.05, 5.5, -6.7, 47.25, 6.6, 10, MOVE);
  K.collider(62.75, 5.5, -50, 62.95, 6.6, 10, MOVE);
  K.collider(47, 5.5, -50.3, 63, 6.6, -49.9, MOVE);
  K.collider(47, 5.5, 9.9, 63, 6.6, 20, MOVE);
  K.box('shed', 50, 5.5, -48.5, 60, 13, -40, { surf: 'metal' });
  for (let x = 50.6; x < 59.6; x += 1.8) K.line(x, 11.2, -39.98, x + 1.2, 11.2, -39.98);
  K.deco('ink', 50.4, 11, -39.96, 59.6, 12.2, -39.95);
  K.box('crane', 54.5, 13, -45, 55.5, 17, -44);
  K.container(52, -20, { y: 5.5, rot: 1, role: 'cont2' });
  K.container(57.5, -20, { y: 5.5, rot: 1, role: 'cont4' });
  K.container(57.5, -20, { y: 5.5 + CT, rot: 1, role: 'cont1' });
  K.container(55, -2, { y: 5.5, rot: 1, len: 6.1, role: 'cont3' });
  K.navGrid(48.5, 61.5, -38.5, 8.5, 5.5, 2.5);
  K.ramp({ x: 33, z: -8, y0: 0, y1: 5.5, dir: 'e', len: 14, w: 2.2, role: 'catwalk', rails: 'both' });
  K.sign('HELENA MAERSK', 63.05, 3.5, -20, 10, 1.1, 1, 'x');

  // ------------------------------------------------------------ harbour control
  K.room(-6, -58, 10, -46, 0, {
    role: 'wallExt', h: 4,
    s: [...K.wins(-5, 0, 1.6, 2.6), K.op(1, 1.0), ...K.wins(3.5, 9.5, 1.6, 2.6)],
    e: [K.op(-56.5, 1.0)],
    n: K.wins(-5, 9.5, 1.6, 2.6),
    w: K.wins(-57, -47, 1.6, 2.6),
  });
  K.doorAt('x', -46, 1, 1.0);
  K.doorAt('z', 10, -56.5, 1.0);
  K.stairs({ x: -4.6, z: -47.4, y0: 0, dir: 'n', n: 17, rise: 0.247, run: 0.3, w: 1.1, rails: 'right' });
  K.slab('concrete', -3.9, -58, 10, -46, 4.2, 0.25);
  K.slab('concrete', -6, -58, -3.9, -52.45, 4.2, 0.25);
  K.collider(-3.95, 4.2, -52.45, -3.85, 5.2, -47.3, MOVE);
  K.rod('steel', V(-3.9, 5.2, -52.45), V(-3.9, 5.2, -47.3), 0.03);
  K.room(-6, -58, 10, -46, 4.2, {
    role: 'wallExt', h: 3.4,
    s: K.wins(-5, 9.6, 2.2, 2.6, 0.9, 2.8),
    n: K.wins(-5, 9.6, 2.2, 2.6, 0.9, 2.8),
    e: [K.op(-50.8, 1.0)],
    w: K.wins(-57, -47, 1.6, 2.6),
    ceil: 'roof',
  });
  K.doorAt('z', 10, -50.8, 1.0, 4.2);
  K.tableSet(5, -52, { chairs: 2, w: 3, d: 0.9, y: 4.2 });
  K.box('panel', -2, 4.2, -57.6, 1.2, 5.0, -56.9);
  K.box('panel', 2.8, 4.2, -57.6, 6, 5.0, -56.9);
  K.stairs({ x: 11.3, z: -44, y0: 0, dir: 'n', n: 17, rise: 0.247, run: 0.3, w: 1.2, rails: 'right' });
  K.box('concrete', 10.1, 3.95, -51.4, 12.6, 4.2, -48.8);
  K.collider(12.5, 4.2, -51.4, 12.7, 5.2, -48.8, MOVE);
  K.sign('HARBOUR CONTROL', 2, 3.55, -45.84, 7, 0.75, 1);
  K.navGrid(-3.2, 9.4, -57.4, -46.6, 4.2, 1.8);
  K.navGrid(-5.4, 9.4, -57.4, -46.6, 0, 1.8);
  K.interact('gateConsole', 2, 5.1, -57.2, { prompt: 'prompt.gate', face: 's', from: 1, actions: [{ open: 'gate' }, { open: 'gate2' }, { sound: 'alarmBeep' }] });

  // security gate
  K.fence(-50, -66, -5.3, -66);
  K.fence(5.3, -66, 44, -66);
  for (const x of [-5.6, 5.6]) K.box('steel', x - 0.3, 0, -66.3, x + 0.3, 3.4, -65.7);
  K.door({ hx: -5.3, hz: -66, angle: 0, w: 5.3, h: 3, id: 'gate', locked: true, role: 'steel', panels: false, name: 'Gate' });
  K.door({ hx: 5.3, hz: -66, angle: Math.PI, w: 5.3, h: 3, id: 'gate2', locked: true, role: 'steel', panels: false, name: 'Gate', noNav: true });
  K.sign('SECURITY GATE 3', 0, 3.8, -65.6, 6, 0.7, 1);
  K.deco('steel', -5.9, 3.4, -66.2, 5.9, 3.6, -65.8);
  for (const x of [-18, 14]) K.lampPost(x, -69);
  K.container(-26, -80, { rot: 1, role: 'cont4' });
  K.container(24, -78, { role: 'cont1' });

  // ------------------------------------------------------------ nav
  K.navGrid(-48, 42, -6, 46, 0, 2.5);
  K.navGrid(-43, -9, -33, -9, 0, 2.2);
  K.navGrid(-6, 42, -64, -9.5, 0, 2.5);
  K.navGrid(-48, -8, -64, -35, 0, 2.5);
  K.navGrid(-22, 22, -94, -68, 0, 3);

  // ------------------------------------------------------------ enemies
  K.spawn(-20, 0, 28, S, 'pistol', { patrol: [[-20, 28], [-4, 28], [-20, 28]] });
  K.spawn(8, 0, 28.5, S, 'smg');
  K.spawn(-30, 0, 16, E, 'smg', { patrol: [[-30, 16], [-8, 16]] });
  K.spawn(28, CT * 2, 21.5, S, 'rifle', { perch: true });
  K.spawn(5, 0, 4, S, 'shotgun', { hold: true });
  K.spawn(-18, CT * 2, 9.5, S, 'rifle', { perch: true });
  K.spawn(16, 8, 15.4, S, 'sniper');
  K.spawn(-25, 0, 2, E, 'smg', { hold: true });
  K.spawn(20, 0, 4, W, 'pistol');
  K.spawn(-35, 0, -18, S, 'smg', { patrol: [[-35, -18], [-15, -18], [-15, -29], [-35, -18]] });
  K.spawn(-22, 4, -31.5, S, 'rifle', { hold: true });
  K.spawn(-14, 0, -28, S, 'shotgun', { hold: true });
  K.spawn(-40, 0, -23, E, 'pistol');
  K.spawn(15, 0, -20, W, 'smg');
  K.spawn(25, 0, -28, W, 'rifle', { hold: true });
  K.spawn(55, 5.5, -12, W, 'rifle', { perch: true });
  K.spawn(10, 0, -34, W, 'smg', { patrol: [[10, -34], [28, -36], [10, -34]] });
  K.spawn(2, 0, -44.2, S, 'heavy', { hold: true });
  K.spawn(-15, CT * 2, -40, E, 'rifle', { perch: true });
  K.spawn(18, CT, -44, W, 'smg', { perch: true });
  K.spawn(-18, CT, -52, E, 'pistol', { perch: true, weapon: 'revolver' });
  K.spawn(6, 0, -54, S, 'smg', { hold: true });
  K.spawn(-1, 4.2, -52, E, 'pistol', { hold: true });
  K.entry('gateN1', -8, 0, -86, S);
  K.entry('gateN2', 8, 0, -86, S);
  K.entry('quayN', 40, 0, -62, W);
  K.entry('wareE', -12, 0, -30, E);
  K.entry('yardE', 40, 0, 28, W);
  K.entry('yardW', -46, 0, 42, E);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, 0, 44, N);
  K.zone('warehouse', -44, -1, -34, -8, 7, -8);
  K.zone('control', -6, 3.6, -58, 10, 8, -46);
  K.zone('exit', -30, -1, -110, 30, 5, -70);
  K.checkpoint(-27, 0, -4.5, N, { need: 0, r: 4 });
  K.checkpoint(-11, 0, -21.5, E, { need: 1, r: 3.5 });
  K.checkpoint(2, 0, -40, N, { need: 1, r: 4 });
  K.secret(16.6, 8, 17);
  K.secret(55, 5.5, -49.2);
  K.secret(-42.8, 4, -31.5);
  K.item('health', 0, 0, 40, { tier: 3 });
  K.item('ammo', -9.2, 0.12, 33.4);
  K.item('health', -26, 0, -10, { tier: 2 });
  K.item('health', -41.5, 0, -27.5);
  K.item('ammo', -18, 4, -31.5);
  K.item('health', 8, 0, -40, { tier: 2 });
  K.item('ammo', 30, 0, -22);
  K.item('health', 4, 4.2, -48, { tier: 3 });
  K.item('ammo', 52, 5.5, -8);
  K.item('health', 36, 0, 10, { tier: 2 });
  K.item('ammo', -30, 0, 12, { tier: 2 });
  K.weapon('shotgun', 1.8, 0.14, 22, 0.4);
  K.weapon('burst', -40, 0.77, -30, 1.2);
  K.weapon('mpistol', 25, 1.13, -12, 0.3);
  K.area('area.L2.yard', -60, -7.6, 50, 60);
  K.area('area.L2.warehouse', -44, -34, -8, -8);
  K.area('area.L2.control', -60, -120, 70, -45);
  K.area('area.L2.quay', -8, -45, 70, -7.6);
  K.data.arenas.push({ x: 0, y: 0, z: 16, yaw: N, entries: ['yardE', 'yardW', 'wareE'] });
  K.data.arenas.push({ x: 10, y: 0, z: -30, yaw: N, entries: ['gateN1', 'gateN2', 'quayN', 'wareE'] });
  yield 1;
}

export default {
  id: 'L2',
  num: 2,
  bounds: { x0: -80, z0: -120, x1: 90, z1: 70 },
  mapBounds: { x0: -52, x1: 66, z0: -96, z1: 52 },
  par: 420,
  loadout: { main: ['smg', 32, 128], side: ['pistol', 12, 48] },
  env: {
    classic: { paper: 0xffffff, fog: [32, 170] },
    neo: { sky: ['#5a3d9a', '#ff7a59', '#ffc07a', '#ffb49a'], fog: 0xffb997, fogRange: [60, 280], sun: [-40, 22, 18], sunColor: 0xffc890, sunI: 0.55, hemiI: 0.62, hemiSky: 0xffe0c0, hemiGround: 0xb08cff, clouds: true, shadowBox: 42 },
    ambience: ['wind', 'sea'],
  },
  menuOrbit: { x: 0, z: -10, r: 72, h: 32, look: 2 },
  previewCam: { p: [3, 1.7, 40], yaw: 0.25, pitch: 0.04 },
  objectives: [
    { key: 'L2.o1', type: 'reach', zone: 'warehouse', marker: [-27, 1.4, -10] },
    { key: 'L2.o2', type: 'reach', zone: 'control', marker: [11.3, 5.6, -50] },
    { key: 'L2.o3', type: 'interact', ids: ['gateConsole'], onComplete: [{ toast: 'hud.reinforce' }, { wave: { count: 3, roles: ['smg', 'shotgun', 'rifle'], entries: ['gateN1', 'gateN2', 'quayN'], announce: false } }] },
    { key: 'L2.o4', type: 'reach', zone: 'exit', marker: [0, 1.4, -72], final: true },
  ],
  build,
};
