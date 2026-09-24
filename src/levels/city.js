// Level 7 - Rainy City Block, at night.
//   main street between shop fronts and apartments (enemies at windows and
//   on balconies, cars as cover) -> cross street -> plaza -> multistorey
//   garage (three ramps) -> roof: hold the extraction zone for 90 seconds.
//   Optional routes: through the bar and the laundromat into the back alley,
//   or up the fire escape, over the bridge and across the rooftops.
import * as THREE from 'three';
import { MOVE } from '../world.js';
import { t } from '../i18n.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const RF = 7.2; // block roofs
const G1 = 3.5, G2 = 7, G3 = 10.5; // garage levels

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ streets
  K.ground('asphalt', -80, -100, 80, 90);
  for (let z = 56; z > -26; z -= 5) if (z < 12 || z > 26) K.detail(0, 0.015, z, 0, 0.015, z - 2.5);
  for (let x = -30; x < 30; x += 5) if (x < -6 || x > 6) K.detail(x, 0.015, 19, x + 2.5, 0.015, 19);
  for (let x = -5; x < 6; x += 1.2) K.deco('path', x, 0.004, 25.2, x + 0.6, 0.016, 26.6, { edges: false });
  for (const [x0, x1] of [[-10, -6], [6, 10]]) {
    K.box('sidewalk', x0, 0, 26, x1, 0.12, 62);
    K.box('sidewalk', x0, 0, -28, x1, 0.12, 12);
  }
  let seed = 3;
  for (let i = 0; i < 14; i++) {
    const x = ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 11;
    const z = 58 - i * 6.5;
    K.deco('puddle', x - 0.9, 0.003, z - 0.5, x + 0.9, 0.011, z + 0.6, { edges: false });
  }
  K.box('brick', -60, 0, 62, 60, 14, 66);

  // ------------------------------------------------------------ block A (west, south): bar + window nests
  K.box('brick', -30, 0, 42, -10, 11, 58);
  for (let z = 44; z < 57; z += 3) for (const y of [4.5, 7.5]) { K.line(-9.98, y, z, -9.98, y, z + 1.6); K.line(-9.98, y + 1.6, z, -9.98, y + 1.6, z + 1.6); }
  K.box('shop', -10.3, 0.4, 45, -9.9, 3, 55, { col: false });
  K.pane(-9.92, 0.6, 45.5, -9.88, 2.8, 54.5);
  K.box('neon2', -9.9, 3.2, 46, -9.7, 3.8, 54, { col: false });
  K.sign('PAWN', -9.68, 3.5, 50, 3, 0.55, 1, 'x');
  K.room(-30, 26, -10, 42, 0, { role: 'brick', h: 3.6, t: 0.3, e: [K.win(27, 5, 0.6, 2.6), K.op(33, 1.2), K.win(35.5, 5.5, 0.6, 2.6)], w: [K.op(30, 1.0)], ceil: 'ceiling', floor: 'wood' });
  K.doorAt('z', -10, 33, 1.2);
  K.doorAt('z', -30, 30, 1.0);
  K.box('brick', -30, G1 + 0.1, 26, -12, 11, 42);
  K.box('brick', -12, 6, 26, -10, 11, 42);
  K.wall('brick', 'z', -10, 0.3, 26, 42, 3.8, 6, [{ a: 29, b: 31, lo: 0.5, hi: 2, kind: 'gap' }, { a: 36, b: 38, lo: 0.5, hi: 2, kind: 'gap' }]);
  K.box('counter', -28, 0, 36, -26.8, 1.1, 41.5);
  K.box('wood', -29.8, 1.1, 36, -29.4, 2.8, 41.5, { col: false });
  for (const [x, z] of [[-20, 30], [-16, 36], [-21, 38]]) K.tableSet(x, z, { chairs: 3, w: 1, d: 1 });
  K.box('neon1', -9.9, 2.9, 32, -9.7, 3.4, 35.5, { col: false });
  K.sign('BAR', -9.68, 3.15, 33.75, 1.6, 0.45, 1, 'x');
  K.lampLight(-20, 3.55, 34, { sx: 1.2, sz: 1.2 });

  // ------------------------------------------------------------ block C (west, north): laundromat
  K.box('brick', -30, 0, 4, -10, 11, 12);
  K.box('brick', -30, 0, -28, -10, 11, -12);
  K.room(-30, -12, -10, 4, 0, { role: 'brick', h: 3.6, t: 0.3, e: [K.win(-11, 5.5, 0.6, 2.6), K.op(-5, 1.2), K.win(-2.5, 5.5, 0.6, 2.6)], w: [K.op(-8, 1.0)], ceil: 'ceiling', floor: 'tile' });
  K.doorAt('z', -10, -5, 1.2);
  K.doorAt('z', -30, -8, 1.0);
  K.box('brick', -30, G1 + 0.1, -12, -12, 11, 4);
  K.box('brick', -12, 6, -12, -10, 11, 4);
  K.wall('brick', 'z', -10, 0.3, -12, 4, 3.8, 6, [{ a: -9, b: -7, lo: 0.5, hi: 2, kind: 'gap' }, { a: -1, b: 1, lo: 0.5, hi: 2, kind: 'gap' }]);
  for (let z = -10; z < 3; z += 1.4) K.box('appliance', -29.6, 0, z, -28.6, 1.0, z + 1.1);
  K.box('counter', -18, 0, -11.5, -12, 0.95, -10.5);
  K.box('neon2', -9.9, 2.9, -8, -9.7, 3.4, -3, { col: false });
  K.sign('LAUNDRY 24H', -9.68, 3.15, -5.5, 4, 0.45, 1, 'x');
  K.lampLight(-20, 3.55, -4, { sx: 2, sz: 0.3 });
  for (let z = -26; z < 10; z += 3) if (z < -13 || z > 5) for (const y of [4.5, 7.5]) K.line(-9.98, y, z, -9.98, y + 1.6, z + 1.6);

  // ------------------------------------------------------------ blocks B and D (east): apartments, balconies, roofs
  K.box('brick', 10, 0, 26, 30, RF, 58);
  K.box('brick', 10, 0, -28, 30, RF, 12);
  for (const [z0, z1] of [[26, 58], [-28, 12]]) {
    for (let z = z0 + 1.5; z < z1 - 1; z += 3) for (const y of [1.2, 4.6]) { K.line(9.98, y, z, 9.98, y, z + 1.4); K.line(9.98, y + 1.6, z, 9.98, y + 1.6, z + 1.4); K.line(9.98, y, z, 9.98, y + 1.6, z); K.line(9.98, y, z + 1.4, 9.98, y + 1.6, z + 1.4); }
  }
  K.box('shop', 9.7, 0.3, -24, 10.1, 3, -14, { col: false });
  K.box('neon1', 9.7, 3.1, -23, 9.9, 3.7, -15, { col: false });
  K.sign('NOODLES', 9.68, 3.4, -19, 3.2, 0.55, -1, 'x');
  // balconies on B
  for (const [z0, z1] of [[30, 34], [42, 46], [52, 56]]) {
    K.box('concrete', 8.6, G1 - 0.2, z0, 10, G1, z1);
    K.collider(8.55, G1, z0, 8.7, G1 + 1, z1, MOVE);
    K.rod('steel', V(8.62, G1 + 1, z0), V(8.62, G1 + 1, z1), 0.03);
    for (let z = z0; z <= z1; z += 1) K.rod('steel', V(8.62, G1, z), V(8.62, G1 + 1, z), 0.015, 4, { edges: false });
    K.deco('door', 9.95, G1, z0 + 1.5, 10.02, G1 + 2.1, z0 + 2.5);
  }
  // roof parapets with gaps for the fire escapes
  const parapet = (x0, z0, x1, z1, gaps) => {
    K.box('brick', x0, RF, z0, x0 + 0.3, RF + 1, z1);
    K.box('brick', x1 - 0.3, RF, z0, x1, RF + 1, z1);
    const along = (z, g) => {
      let a = x0;
      for (const [g0, g1] of g) { if (g0 > a) K.box('brick', a, RF, z - 0.15, g0, RF + 1, z + 0.15); a = g1; }
      if (a < x1) K.box('brick', a, RF, z - 0.15, x1, RF + 1, z + 0.15);
    };
    along(z0 + 0.15, gaps.n || []);
    along(z1 - 0.15, gaps.s || []);
  };
  parapet(10, 26, 30, 58, { n: [[19.4, 21]] });
  parapet(10, -28, 30, 12, { n: [[19.4, 21]], s: [[19.4, 21]] });
  for (const [x, z] of [[14, 50], [24, 34], [16, -10], [26, 4]]) { K.box('machine', x - 1, RF, z - 1, x + 1, RF + 1.4, z + 1); K.cyl('steel', x, RF + 1.9, z, 0.4, 0.4, 1, 8); }
  K.box('tank', 22, RF, 44, 26, RF + 2.4, 48);
  // fire escapes up B's north face and down D's north face, bridge between
  K.stairs({ x: 11, z: 25.4, y0: 0, dir: 'e', n: 28, rise: RF / 28, run: 0.3, w: 1.2, role: 'steel', rails: 'left' });
  K.box('steel', 19.4, RF - 0.15, 24.6, 21, RF, 26);
  K.catwalk(19.4, 12, 21, 24.6, RF, { rails: 'ew', legs: false });
  K.stairs({ x: 11, z: -28.6, y0: 0, dir: 'e', n: 28, rise: RF / 28, run: 0.3, w: 1.2, role: 'steel', rails: 'right' });
  K.box('steel', 19.4, RF - 0.15, -29.2, 21, RF, -28);
  K.box('brick', 30, 0, -40, 44, 14, 12);
  K.box('brick', 30, 0, 26, 44, 14, 62);
  K.box('brick', 34, 0, 12, 44, 8, 26);

  // ------------------------------------------------------------ alley (west)
  K.box('brick', -44, 0, -40, -34, 14, 62);
  for (const [z, r] of [[48, 'steel'], [16, 'cont4'], [-20, 'steel']]) K.box(r, -33.8, 0, z, -32, 1.4, z + 2.2);
  for (let i = 0; i < 5; i++) K.drum(-33.3, 5 - i * 0.8);
  K.lampLight(-30.2, 3.2, 20, { sx: 0.3, sz: 0.6 });
  K.lampLight(-30.2, 3.2, -16, { sx: 0.3, sz: 0.6 });

  // ------------------------------------------------------------ street furniture
  for (const z of [54, 40, 2, -12, -26]) { K.lampPost(-7.5, z, { arm: 1 }); K.lampPost(7.5, z - 6, { arm: -1 }); }
  K.lampPost(-24, 18, { arm: 1 });
  K.lampPost(24, 20, { arm: -1 });
  K.car(-4.2, 44, 1, 'car1');
  K.car(4.3, 30, 1, 'car3');
  K.car(-4, 6, 1, 'car2');
  K.car(3.8, -14, 1, 'car1');
  K.car(-18, 16, 0, 'car3');
  K.car(20, 22, 0, 'car2');
  K.car(0, 20.5, 0, 'car1');
  K.box('glass', -6.5, 0.12, 8, -6.3, 2.4, 11, { col: false });
  K.box('steel', -6.6, 2.4, 7.8, -8.8, 2.55, 11.2, { col: false });
  K.box('wood', -8.4, 0.12, 8.5, -8, 0.6, 10.5);
  K.barrier(-2, -30, 'x');
  K.barrier(3, -32, 'x');
  K.sign('MAIN ST', -7.2, 4.8, 13, 2, 0.4, -1);

  // ------------------------------------------------------------ garage
  const GX0 = -24, GX1 = 24, GZ0 = -72, GZ1 = -36;
  const slabs = [
    [G1, [[GX0, 16.5, GZ0, GZ1], [21.5, GX1, GZ0, GZ1], [16.5, 21.5, GZ0, -52]]],
    [G2, [[GX0, -21.5, GZ0, GZ1], [-16.5, GX1, GZ0, GZ1], [-21.5, -16.5, GZ0, -64], [-21.5, -16.5, -52, GZ1]]],
    [G3, [[GX0, 16.5, GZ0, GZ1], [21.5, GX1, GZ0, GZ1], [16.5, 21.5, GZ0, -64], [16.5, 21.5, -52, GZ1]]],
  ];
  for (const [y, parts] of slabs) for (const [x0, x1, z0, z1] of parts) K.slab('concrete', x0, z0, x1, z1, y, 0.3, { edges: true });
  for (const x of [-16, -8, 0, 8, 16]) for (const z of [-44, -60]) if (!(x === 16 && z === -44) && !(x === -16 && z === -60)) K.box('concrete', x - 0.3, 0, z - 0.3, x + 0.3, G3 - 0.3, z + 0.3);
  // parapets on the upper levels (the ground level is open)
  for (const y of [G1, G2, G3]) {
    K.box('concrete', GX0, y, GZ0, GX1, y + 1, GZ0 + 0.3);
    K.box('concrete', GX0, y, GZ0, GX0 + 0.3, y + 1, GZ1);
    K.box('concrete', GX1 - 0.3, y, GZ0, GX1, y + 1, GZ1);
    K.box('concrete', GX0, y, GZ1 - 0.3, GX1, y + 1, GZ1);
    K.deco('stripe', GX0, y + 0.45, GZ1 + 0.001, GX1, y + 0.6, GZ1 + 0.01);
  }
  K.wall('concrete', 'x', GZ0, 0.3, GX0, GX1, 0, G1);
  // ramps with guard rails around the holes above them
  K.ramp({ x: 19, z: -40, y0: 0, y1: G1, dir: 'n', len: 12, w: 5, role: 'concrete', rails: 'both' });
  K.ramp({ x: -19, z: -64, y0: G1, y1: G2, dir: 's', len: 12, w: 5, role: 'concrete', rails: 'both' });
  K.ramp({ x: 19, z: -52, y0: G2, y1: G3, dir: 'n', len: 12, w: 5, role: 'concrete', rails: 'both' });
  const holeRail = (y, x0, x1, z0, z1, open) => {
    if (open !== 'w') K.collider(x0 - 0.1, y, z0, x0, y + 1, z1, MOVE);
    if (open !== 'e') K.collider(x1, y, z0, x1 + 0.1, y + 1, z1, MOVE);
    if (open !== 'n') K.collider(x0, y, z0 - 0.1, x1, y + 1, z0, MOVE);
    if (open !== 's') K.collider(x0, y, z1, x1, y + 1, z1 + 0.1, MOVE);
    K.rod('steel', V(x0, y + 1, z0), V(x0, y + 1, z1), 0.03);
    K.rod('steel', V(x1, y + 1, z0), V(x1, y + 1, z1), 0.03);
  };
  holeRail(G1, 16.5, 21.5, -52, -40, 'n');
  holeRail(G2, -21.5, -16.5, -64, -52, 's');
  holeRail(G3, 16.5, 21.5, -64, -52, 'n');
  for (const [y, z, txt] of [[0, -38, 'P1'], [G1, -54, 'P2'], [G2, -38, 'P3']]) K.sign(txt, 0, y + 2.6, z, 1.4, 0.6, 1);
  for (const y of [G1, G2]) for (const [x, z] of [[-10, -48], [10, -48], [-10, -64], [4, -64]]) K.lampLight(x, y - 0.32, z, { sx: 1.8, sz: 0.3 });
  for (const [x, z, r] of [[-12, -40, 0], [-4, -40, 0], [8, -66, 0], [-12, -68, 0]]) K.car(x, z, r, x < 0 ? 'car2' : 'car3');
  K.car(-6, -50, 0, 'car1');
  K.box('car1', -10, G1, -41, -6, G1 + 1.4, -39.2);
  K.box('car2', 4, G2, -70, 8, G2 + 1.4, -68.2);
  // roof: helipad + extraction light
  K.cyl('hazard', 0, G3 + 0.01, -54, 5, 5, 0.02, 24, { edges: true });
  K.cyl('concrete', 0, G3 + 0.02, -54, 4.2, 4.2, 0.02, 24, { edges: false });
  K.deco('ink', -1.6, G3 + 0.03, -56, -1, G3 + 0.04, -52);
  K.deco('ink', 1, G3 + 0.03, -56, 1.6, G3 + 0.04, -52);
  K.deco('ink', -1, G3 + 0.03, -54.3, 1, G3 + 0.04, -53.7);
  for (const [x, z] of [[-20, -40], [-20, -68], [20, -70], [12, -40]]) K.lampPost(x, z, { y: G3, h: 4, arm: x < 0 ? 1 : -1 });

  // helicopter (hidden until it comes for you)
  K.use('heli');
  const hy = G3 + 0.5;
  K.box('heli', -1.2, hy, -56.4, 1.2, hy + 2, -52.4, { col: false });
  K.box('heli', -0.9, hy + 0.2, -52.4, 0.9, hy + 1.8, -51.2, { col: false });
  K.deco('glass', -0.95, hy + 0.8, -51.3, 0.95, hy + 1.7, -51.1);
  K.rod('heli', V(0, hy + 1.4, -56.4), V(0, hy + 1.8, -63), 0.25, 8);
  K.box('heli', -0.1, hy + 1.6, -63.5, 0.1, hy + 3, -62.5, { col: false });
  for (const x of [-1.1, 1.1]) K.rod('steel', V(x, hy - 0.4, -57), V(x, hy - 0.4, -51.8), 0.06);
  for (const x of [-1.1, 1.1]) for (const z of [-56, -52.8]) K.rod('steel', V(x, hy - 0.4, z), V(x * 0.8, hy, z), 0.04);
  K.cyl('steel', 0, hy + 2.25, -54.4, 0.15, 0.15, 0.5, 8);
  K.deco('heli', -6, hy + 2.45, -54.6, 6, hy + 2.52, -54.2);
  K.deco('heli', -0.2, hy + 2.45, -60.4, 0.2, hy + 2.52, -48.4);
  K.use('main');

  // ------------------------------------------------------------ bounds + nav
  K.bounds(-34, -76, 34, 62);
  K.navGrid(-5.5, 5.5, -27, 60, 0, 2.5);
  K.navGrid(-9.5, -6.5, -27.5, 60, 0.12, 2.2);
  K.navGrid(6.5, 9.5, -27.5, 60, 0.12, 2.2);
  K.navGrid(-33.5, 33.5, 12.5, 25.5, 0, 2.5);
  K.navGrid(-33.5, -30.5, -27.5, 60, 0, 2);
  K.navGrid(-29.5, -10.5, 26.5, 41.5, 0, 2);
  K.navGrid(-29.5, -10.5, -11.5, 3.5, 0, 2);
  K.navGrid(10.8, 29.2, 26.8, 57.2, RF, 3);
  K.navGrid(10.8, 29.2, -27.2, 11.2, RF, 3);
  K.navGrid(-33.5, 33.5, -35.5, -28.5, 0, 2.5);
  for (const y of [0, G1, G2, G3]) K.navGrid(-23.3, 23.3, -71.3, -36.7, y, 2.6);

  // ------------------------------------------------------------ enemies
  K.spawn(-3, 0, 46, S, 'smg', { patrol: [[-3, 46], [3, 36], [-3, 46]] });
  K.spawn(8, 0.12, 40, W, 'pistol');
  K.spawn(-2, 0, 36, S, 'shotgun', { hold: true });
  K.spawn(9.3, G1, 32, W, 'rifle', { perch: true });
  K.spawn(9.3, G1, 54, W, 'pistol', { perch: true });
  K.spawn(-11, G1 + 0.3, 30, E, 'rifle', { perch: true });
  K.spawn(-11, G1 + 0.3, 37, E, 'smg', { perch: true });
  K.spawn(-20, 0, 33, E, 'shotgun', { hold: true });
  K.spawn(-26, 0, 29, E, 'pistol');
  K.spawn(-18, 0, 20, E, 'smg', { patrol: [[-18, 20], [-2, 16], [-18, 20]] });
  K.spawn(20, 0, 19.5, W, 'rifle', { hold: true });
  K.spawn(-8, 0.12, 14, S, 'pistol', { weapon: 'revolver' });
  K.spawn(20, RF, 0, S, 'rifle', { perch: true });
  K.spawn(25, RF, -20, W, 'smg', { hold: true });
  K.spawn(-11, G1 + 0.3, -8, E, 'rifle', { perch: true });
  K.spawn(-11, G1 + 0.3, 0, E, 'pistol', { perch: true });
  K.spawn(-20, 0, -3, E, 'shotgun', { hold: true });
  K.spawn(-32, 0, 10, S, 'smg');
  K.spawn(-31.5, 0, -22.5, S, 'heavy', { hold: true });
  K.spawn(0, 0, -33.5, S, 'heavy', { hold: true });
  K.spawn(-12, 0, -46, S, 'smg');
  K.spawn(12, 0, -47, S, 'rifle', { hold: true });
  K.spawn(0, G1, -60, S, 'smg', { patrol: [[0, -60], [12, -60]] });
  K.spawn(-12, G1, -50, E, 'pistol');
  K.spawn(8, G2, -56, S, 'shotgun', { hold: true });
  K.spawn(-10, G2, -68, E, 'rifle', { hold: true });
  K.spawn(0, G3, -44, S, 'smg');
  K.spawn(-18, G3, -69, E, 'rifle', { hold: true });
  K.entry('rampL2', 19, G2, -48, N);
  K.entry('garageL1', 0, G1, -68, S);
  K.entry('plaza', -10, 0, -32, N);
  K.entry('rampL2b', 12, G2, -44, N);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, 0, 58, N);
  K.zone('garage', -26, -1, -74, 26, 3, -34);
  K.zone('roof', -24, G3 - 0.5, -72, 24, G3 + 4, -36);
  K.zone('heli', -3.5, G3 - 0.5, -58, 3.5, G3 + 4, -50);
  K.checkpoint(0, 0, 18, N, { need: 0, r: 9 });
  K.checkpoint(0, 0, -31, N, { need: 0, r: 9 });
  K.checkpoint(19, G3, -68, W, { need: 1, r: 7, at: [14, G3, -68, W] });
  K.secret(-29, 0, 39.8);
  K.secret(29, RF, 57);
  K.secret(-33, 0, -26.5);
  K.item('health', 5, 0.12, 52, { tier: 3 });
  K.item('ammo', -8.5, 0.12, 30);
  K.item('health', -14, 0, 40);
  K.item('ammo', 12, 0, 16);
  K.item('health', -12, 0, -10, { tier: 2 });
  K.item('ammo', -31.5, 0, -2);
  K.item('health', 12, RF, 8);
  K.item('ammo', 28, RF, -26);
  K.item('health', 20, 0, -36, { tier: 2 });
  K.item('ammo', -20, G1, -70);
  K.item('health', 20, G2, -70);
  K.item('ammo', -22, G3, -38);
  K.item('health', 22, G3, -38, { tier: 2 });
  K.item('ammo', 0, G3, -70, { tier: 2 });
  K.weapon('rifle', -27.4, 1.13, 38.5, 1.57);
  K.weapon('shotgun', -15, 0.97, -11, 0.2);
  K.weapon('burst', 18, RF, -12, 0.4);
  K.weapon('revolver', -31, 0, 17.5, 0.4);
  K.area('area.L7.street', -10, -30, 10, 70);
  K.area('area.L7.alley', -34, -30, -10, 70);
  K.area('area.L7.garage', -40, -90, 40, -30);
  K.data.arenas.push({ x: 0, y: 0, z: 18, yaw: N, entries: ['plaza', 'garageL1'] });
  K.data.arenas.push({ x: 0, y: G3, z: -54, yaw: S, entries: ['rampL2', 'rampL2b', 'garageL1'] });
  yield 1;
}

function heliVisible(g, on) {
  const h = g.level && g.level.named.heli;
  if (!h) return;
  for (const m of h.meshes) m.visible = on;
  if (h.lines) h.lines.visible = on;
}

export default {
  id: 'L7',
  num: 7,
  bounds: { x0: -60, z0: -100, x1: 60, z1: 80 },
  mapBounds: { x0: -34, x1: 34, z0: -76, z1: 62 },
  par: 600,
  loadout: { main: ['smg', 32, 128], side: ['revolver', 6, 30] },
  env: {
    classic: { paper: 0xdfe2e8, fog: [16, 95] },
    neo: { sky: ['#07071f', '#15143f', '#35285f', '#0f0f2a'], fog: 0x29244e, fogRange: [26, 130], sun: [-20, 50, 30], sunColor: 0xa9bcff, sunI: 0.3, hemiI: 0.78, hemiSky: 0xb0bcff, hemiGround: 0x4a2a6a, clouds: false, shadowBox: 40 },
    weather: 'rain',
    reflections: true,
    ambience: ['rain'],
  },
  groundSurf: 'ground',
  menuOrbit: { x: 0, z: 0, r: 60, h: 34, look: 2 },
  previewCam: { p: [-3, 1.7, 56], yaw: -0.05, pitch: 0.05 },
  onStart(g) { heliVisible(g, false); },
  saveState(g) { const h = g.level.named.heli; return { heli: !!(h && h.meshes[0] && h.meshes[0].visible) }; },
  loadState(g, s) { heliVisible(g, !!(s && s.heli)); },
  objectives: [
    { key: 'L7.o1', type: 'reach', zone: 'garage', marker: [0, 1.4, -35] },
    { key: 'L7.o2', type: 'reach', zone: 'roof', marker: [19, G3 + 1.4, -66] },
    {
      key: 'L7.o3', type: 'survive', time: 90, zone: 'roof', marker: [0, G3 + 1.4, -54],
      onStart: [{ music: 'combat' }],
      waves: [
        { at: 2, count: 3, roles: ['smg', 'pistol', 'shotgun'], entries: ['rampL2', 'rampL2b'] },
        { at: 24, count: 4, roles: ['rifle', 'smg', 'shotgun', 'smg'], entries: ['rampL2', 'garageL1'] },
        { at: 46, count: 4, roles: ['heavy', 'smg', 'rifle', 'pistol'], entries: ['rampL2b', 'rampL2', 'plaza'] },
        { at: 66, count: 4, roles: ['shotgun', 'smg', 'rifle', 'heavy'], entries: ['rampL2', 'garageL1', 'rampL2b'] },
      ],
      onComplete: [{ hook: 'heli' }, { music: 'calm' }],
    },
    { key: 'L7.o4', type: 'reach', zone: 'heli', marker: [0, G3 + 1.4, -54], final: true },
  ],
  hooks: {
    heli(g) {
      heliVisible(g, true);
      g.audio.setAmbience(['rain', 'heli']);
      g.ui.toast(t('L7.heli'));
    },
  },
  build,
};
