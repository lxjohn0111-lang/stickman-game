// Level 5 - Mountain Hotel, in falling snow.
//   snowy drive -> lobby (reception, grand stair), restaurant, service wing
//   (security office, kitchen, service stair) -> upper floor corridor with
//   guest rooms -> trapped civilian -> courtyard (frozen pond) between two
//   wings with balconies -> courtyard gate. Footprints in the snow fade
//   after a few seconds; the big windows crack when shot.
import * as THREE from 'three';
import { MOVE } from '../world.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const F2 = 4.2; // upper floor
const TOP = 7.6; // upper walls top

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ terrain + scenery
  K.ground('snow', -160, -200, 160, 160);
  K.deco('path', -4, -0.28, -4, 4, 0.012, 48, { edges: false });
  K.deco('path', -14, -0.28, 2, 14, 0.012, 10, { edges: false });
  let seed = 5;
  for (const [x, z, s] of [[-30, 20, 1.2], [-34, 8, 1], [-26, 36, 1.3], [30, 22, 1.1], [34, 6, 1.2], [26, 40, 1], [-14, 30, 0.9], [15, 32, 1], [-36, -40, 1.3], [36, -44, 1.2], [-6, -44, 0.8], [7, -40, 0.7], [-20, -70, 1.2], [18, -72, 1.1]]) K.pine(x, z, s);
  for (const [x, z, r, h] of [[-120, -150, 60, 70], [-30, -190, 70, 90], [80, -170, 60, 75], [150, -60, 50, 55], [-150, -30, 50, 60]]) {
    K.cyl('rock', x, h / 2, z, 0, r, h, 7, { edges: true });
    K.cyl('snow', x, h * 0.8, z, 0, r * 0.42, h * 0.4 + 0.2, 7, { edges: false });
  }
  // snow banks keep you on the drive until you're inside
  K.box('snow', -40, 0, -1, -24.3, 2.6, 1);
  K.box('snow', 24.3, 0, -1, 40, 2.6, 1);
  K.box('snow', -42, 0, -84, -40, 3, 50);
  K.box('snow', 40, 0, -84, 42, 3, 50);
  K.bounds(-40, -84, 40, 48);
  for (let x = -38; x < 38; x += 6) K.rock(x + (x % 4), 50, 3.2, 3 + (x % 3), seed++);
  for (const x of [-10, 10]) K.lampPost(x, 14, { arm: x < 0 ? 1 : -1 });
  K.car(-9, 22, 1, 'car3');
  K.car(9, 26, 1, 'car1');
  K.car(-16, 4.5, 0, 'car2');

  // ------------------------------------------------------------ ground floor shell
  const X0 = -24, X1 = 24, Z0 = -30, Z1 = -6;
  K.wall('hotel', 'x', Z1, 0.35, X0, X1, 0, F2, [
    ...K.wins(-22.5, -9.5, 2.4, 3.2, 0.6, 3.2),
    { a: -7, b: -3, lo: 0.3, hi: 3.4, kind: 'window' },
    { a: -1.5, b: 1.5, lo: 0, hi: 2.6, kind: 'gap' },
    { a: 3, b: 7, lo: 0.3, hi: 3.4, kind: 'window' },
    ...K.wins(10, 22.5, 1.6, 3.2, 1.0, 2.6),
  ]);
  for (const x of [-1.62, 1.62]) K.box('frame', x - 0.12, 0, Z1 - 0.3, x + 0.12, 2.6, Z1 + 0.3);
  K.wall('hotel', 'x', Z0, 0.35, X0, X1, 0, F2, [
    { a: -10, b: -4, lo: 0.6, hi: 3.2, kind: 'window' },
    { a: -1, b: 1, lo: 0, hi: 2.3, kind: 'door' },
    { a: 4, b: 10, lo: 0.6, hi: 3.2, kind: 'window' },
  ]);
  K.door({ hx: -1, hz: Z0, angle: 0, w: 2, h: 2.25, id: 'courtDoor', locked: true, role: 'wood' });
  K.wall('hotel', 'z', X0, 0.35, Z0, Z1, 0, F2, [K.win(-28, 2.4, 0.8, 3), K.op(-12, 1.0), K.win(-10, 2, 0.8, 3)]);
  K.doorAt('z', X0, -12, 1.0);
  K.wall('hotel', 'z', X1, 0.35, Z0, Z1, 0, F2, [K.op(-10, 1.0), K.win(-18, 1.6, 1.0, 2.6)]);
  K.doorAt('z', X1, -10, 1.0);
  // canopy over the entrance with the hotel's name
  K.box('hotelRoof', -4, 3.2, -6.2, 4, 3.4, -2.5);
  for (const x of [-3.8, 3.8]) K.cyl('steel', x, 1.6, -2.8, 0.08, 0.08, 3.2, 8);
  K.sign('HOTEL EDELWEISS', 0, 3.75, -5.8, 7, 0.7, 1);
  K.deco('wood', -3.7, 3.4, -5.95, 3.7, 4.1, -5.8);

  // floors
  K.deco('marble', -8, -0.28, Z0, 8, 0.012, Z1, { edges: false });
  K.deco('wood', X0, -0.28, Z0, -8, 0.012, Z1, { edges: false });
  K.deco('tile', 8, -0.28, Z0, X1, 0.012, Z1, { edges: false });
  for (let x = -7; x < 8; x += 2) K.detail(x, 0.015, Z0, x, 0.015, Z1);

  // lobby | restaurant arch, lobby | service door
  K.wall('wall', 'z', -8, 0.25, Z0, Z1, 0, F2, [{ a: -21, b: -17, lo: 0, hi: 3, kind: 'gap' }]);
  K.wall('wall', 'z', 8, 0.25, Z0, Z1, 0, F2, [K.op(-14, 1.0)]);
  K.doorAt('z', 8, -14, 1.0);

  // lobby: reception, sofas, pillars, grand stair
  K.box('counter', 1, 0, -27.5, 7, 1.1, -26.5);
  K.box('counter', 6.2, 0, -26.5, 7, 1.1, -23);
  K.box('wood', 1, 0, -29.7, 7, 2.4, -29.4, { col: false });
  for (const [x, z] of [[-3.5, -22], [3.5, -15], [-3.5, -15]]) K.box('tileWall', x - 0.3, 0, z - 0.3, x + 0.3, F2, z + 0.3);
  K.box('sofa', 1.5, 0, -12, 4.5, 0.8, -11);
  K.box('sofa', 1.5, 0, -9.2, 4.5, 0.8, -8.2);
  K.box('table', 2.3, 0, -10.6, 3.7, 0.45, -9.6);
  K.stairs({ x: -6.5, z: -10, y0: 0, dir: 'n', n: 17, rise: F2 / 17, run: 0.3, w: 1.6, role: 'marble', rails: 'right' });
  K.lampLight(0, F2 - 0.3, -18, { sx: 2.4, sz: 2.4 });
  K.lampLight(0, F2 - 0.3, -10, { sx: 1.6, sz: 1.6 });
  K.sign('RECEPTION', 4, 2.6, -29.2, 3, 0.45, 1);

  // restaurant: tables and a bar
  for (const [x, z] of [[-20, -10], [-14, -10], [-20, -16], [-14, -16], [-20, -22], [-14, -26]]) K.tableSet(x, z, { chairs: 4, w: 1.2, d: 1.2 });
  K.box('counter', -23.7, 0, -29.7, -17, 1.1, -28.6);
  K.box('wood', -23.7, 1.1, -29.8, -17, 2.8, -29.5, { col: false });
  for (let x = -23; x < -17.5; x += 0.5) K.cyl('glass', x, 1.3, -29.2, 0.05, 0.05, 0.3, 6, { edges: false });
  K.lampLight(-16, F2 - 0.3, -18, { sx: 5, sz: 0.4 });

  // service wing: security office, kitchen, service hall, stairwell
  K.wall('wall', 'x', -12, 0.2, 8, 16, 0, F2, [K.op(11, 1.0)]);
  K.doorAt('x', -12, 11, 1.0);
  K.wall('wall', 'z', 16, 0.2, -20, -6, 0, F2, [{ a: -18, b: -15, lo: 0, hi: 2.4, kind: 'gap' }]);
  K.wall('wall', 'x', -20, 0.2, 16, 24, 0, F2, [K.op(19, 1.0)]);
  K.doorAt('x', -20, 19, 1.0);
  K.wall('wall', 'z', 20, 0.2, Z0, -22, 0, F2);
  K.wall('wall', 'x', -22, 0.2, 20, 24, 0, F2, [{ a: 21.1, b: 22.9, lo: 0, hi: 2.6, kind: 'gap' }]);
  K.stairs({ x: 22, z: -22.4, y0: 0, dir: 'n', n: 17, rise: F2 / 17, run: 0.3, w: 1.6, role: 'concrete', rails: 'left' });
  K.box('panel', 8.25, 0, -11.2, 9.0, 0.9, -7.6);
  K.box('machine', 13.5, 0, -11.7, 15.7, 2.2, -11);
  K.box('appliance', 16.3, 0, -8, 23.7, 0.95, -6.4);
  K.box('appliance', 22.6, 0, -19.7, 23.7, 2.1, -12);
  K.box('counter', 18, 0, -15, 21, 0.95, -12.5);
  K.shelf(9, -29.6, 18, -28.8, 2.2);
  K.crateStack(10, -23);
  K.interact('courtExit', 9.4, 1.1, -6.5, { prompt: 'prompt.exit', face: 'n', from: 3, actions: [{ unlock: 'courtDoor' }, { open: 'courtGate' }, { open: 'courtGate2' }, { spawn: 'final' }, { sound: 'alarmBeep' }] });
  K.interact('freeCiv', 7.5, F2 + 1.1, -26.4, { prompt: 'prompt.free', panel: false, face: 's', from: 2, actions: [{ civilians: 'follow' }], sound: 'objective' });
  K.lampLight(12, F2 - 0.3, -9);
  K.lampLight(20, F2 - 0.3, -13);
  K.lampLight(14, F2 - 0.3, -24);

  // ------------------------------------------------------------ upper floor
  // slab with holes over both stairs
  K.slab('carpet', X0, Z0, 21.2, -15.2, F2, 0.25);
  K.slab('carpet', 22.8, Z0, X1, -15.2, F2, 0.25);
  K.slab('carpet', 21.2, Z0, 22.8, -27.5, F2, 0.25);
  K.slab('carpet', 21.2, -22.4, 22.8, -15.2, F2, 0.25);
  K.slab('carpet', X0, -15.2, -7.35, Z1, F2, 0.25);
  K.slab('carpet', -5.65, -15.2, X1, Z1, F2, 0.25);
  K.slab('carpet', -7.35, -10, -5.65, Z1, F2, 0.25);
  // (the second slab covers the service stair hole except its opening)
  K.collider(20.9, F2, -27.7, 21.1, F2 + 1, -22.4, MOVE);
  K.collider(-7.4, F2, -15.2, -7.3, F2 + 1, -10, MOVE);
  K.wall('hotel', 'x', Z1, 0.35, X0, X1, F2, TOP, [
    ...K.wins(-22.5, -17, 2, 3, 0.9, 2.6), ...K.wins(-15, -9, 2, 3, 0.9, 2.6),
    { a: -7.5, b: -3.5, lo: 0.3, hi: 3.0, kind: 'window' },
    ...K.wins(-2, 4, 2, 3, 0.9, 2.6), ...K.wins(6, 12, 2, 3, 0.9, 2.6), ...K.wins(14.5, 23, 2, 3, 0.9, 2.6),
  ]);
  K.wall('hotel', 'x', Z0, 0.35, X0, X1, F2, TOP, [...K.wins(-10.5, -6.8, 1.6, 2, 0.9, 2.6), ...K.wins(-4.5, 2, 1.6, 3, 0.9, 2.6), ...K.wins(4.5, 11, 1.6, 3, 0.9, 2.6)]);
  K.wall('hotel', 'z', X0, 0.35, Z0, Z1, F2, TOP, [K.win(-28, 2, 0.9, 2.6), K.win(-13, 2, 0.9, 2.6)]);
  K.wall('hotel', 'z', X1, 0.35, Z0, Z1, F2, TOP, [K.win(-13, 2, 0.9, 2.6)]);
  // corridor walls with guest-room doors
  const southDoors = [-21, -13, 0, 8, 17];
  const northDoors = [-20, -11, -2, 7, 15];
  K.wall('wall', 'x', -16, 0.2, X0, X1, F2, TOP, [...southDoors.map((a) => K.op(a, 1.0)), { a: -8, b: -3, lo: 0, hi: 3, kind: 'gap' }]);
  K.wall('wall', 'x', -20, 0.2, X0, X1, F2, TOP, [...northDoors.map((a) => K.op(a, 1.0)), { a: 20.4, b: 23.6, lo: 0, hi: 3, kind: 'gap' }]);
  for (const a of southDoors) K.doorAt('x', -16, a, 1.0, F2);
  for (const a of northDoors) K.doorAt('x', -20, a, 1.0, F2, a === 7 ? { id: 'civDoor', locked: true } : {});
  for (const x of [-16, -8, -3, 5, 13]) K.wall('wall', 'z', x, 0.2, -16, Z1, F2, TOP);
  for (const x of [-15, -6, 3, 12, 20]) K.wall('wall', 'z', x, 0.2, Z0, -20, F2, TOP);
  K.deco('hotelRoof', X0 - 0.4, TOP, Z0 - 0.4, X1 + 0.4, TOP + 0.3, Z1 + 0.4);
  K.collider(X0, TOP, Z0, X1, TOP + 0.3, Z1, MOVE, null, 'roof');
  K.box('hotelRoof', X0 - 0.4, TOP + 0.3, Z1 - 0.1, X1 + 0.4, TOP + 1.1, Z1 + 0.4);
  // guest rooms: bed, nightstand, wardrobe
  const rooms = [[-24, -16, -16, -6], [-16, -8, -16, -6], [-3, 5, -16, -6], [5, 13, -16, -6], [13, 24, -16, -6], [-24, -15, -30, -20], [-15, -6, -30, -20], [-6, 3, -30, -20], [3, 12, -30, -20], [12, 20, -30, -20]];
  rooms.forEach(([x0, x1, z0, z1], i) => {
    const south = z1 === -6;
    const bz = south ? z1 - 2.6 : z0 + 0.3;
    K.box('bed', x0 + 0.6, F2, bz, x0 + 2.6, F2 + 0.55, bz + 2.3);
    K.deco('sofa', x0 + 0.6, F2 + 0.55, south ? bz + 1.7 : bz, x0 + 2.6, F2 + 0.7, south ? bz + 2.3 : bz + 0.6);
    K.box('wood', x0 + 2.8, F2, south ? z1 - 0.9 : z0 + 0.3, x0 + 3.4, F2 + 0.6, south ? z1 - 0.3 : z0 + 0.9);
    K.box('wood', x1 - 1.2, F2, south ? z1 - 1.0 : z0 + 0.3, x1 - 0.3, F2 + 2.1, south ? z1 - 0.3 : z0 + 1.0);
    K.lampLight((x0 + x1) / 2, TOP - 0.05, (z0 + z1) / 2, { sx: 0.8, sz: 0.8 });
    void i;
  });
  for (let x = -20; x < 22; x += 8) K.lampLight(x, TOP - 0.05, -18, { sx: 1.4, sz: 0.3 });
  K.sign('ROOM 309', 7.5, F2 + 2.4, -19.88, 1.3, 0.3, 1);

  // ------------------------------------------------------------ wings, balconies, courtyard
  K.box('hotel', -24, 0, -54, -12, TOP, -30);
  K.box('hotel', 12, 0, -54, 24, TOP, -30);
  K.deco('hotelRoof', -24.4, TOP, -54.4, -11.6, TOP + 0.3, -30);
  K.deco('hotelRoof', 11.6, TOP, -54.4, 24.4, TOP + 0.3, -30);
  for (const s of [-1, 1]) {
    const wx = s * 12;
    for (let z = -52; z < -31; z += 3) {
      K.deco('wood', wx - 0.02 * s, 0.9, z, wx + 0.02 * s, 3.2, z + 1.6);
      K.pane(Math.min(wx, wx + 0.03 * s), 0.9, z, Math.max(wx, wx + 0.03 * s), 3.2, z + 1.6);
      K.deco('wood', wx - 0.02 * s, F2 + 0.2, z + 0.3, wx + 0.02 * s, F2 + 2.4, z + 1.3);
    }
    // balcony along the wing, facing the courtyard
    const bx0 = s < 0 ? -12 : 10.2, bx1 = s < 0 ? -10.2 : 12;
    K.box('wood', bx0, F2 - 0.2, -53.5, bx1, F2, -30.5, { surf: 'indoor' });
    const rx = s < 0 ? -10.25 : 10.25;
    K.rod('steel', V(rx, F2 + 1, -53.4), V(rx, F2 + 1, -30.6), 0.03);
    for (let z = -53; z < -30; z += 1.5) K.rod('steel', V(rx, F2, z), V(rx, F2 + 1, z), 0.02, 4);
    K.collider(rx - 0.05, F2, -53.5, rx + 0.05, F2 + 1.05, -30.5, MOVE);
    for (const z of [-53.4, -30.6]) K.collider(bx0, F2, z - 0.05, bx1, F2 + 1.05, z + 0.05, MOVE);
    for (let z = -50; z < -31; z += 6) K.box('wood', rx - 0.08, 0, z - 0.08, rx + 0.08, F2 - 0.2, z + 0.08);
  }
  K.deco('snow', -12, -0.28, -54, 12, 0.02, -30, { edges: false });
  K.cyl('ice', 0, 0.03, -42, 5.5, 5.5, 0.06, 20, { edges: true });
  for (let a = 0; a < 6; a++) K.detail(Math.cos(a) * 2 - 1, 0.07, -42 + Math.sin(a) * 3, Math.cos(a + 2) * 3, 0.07, -42 + Math.sin(a + 1.3) * 2);
  K.box('stone', -0.7, 0, -42.7, 0.7, 1.2, -41.3);
  K.cyl('stone', 0, 1.9, -42, 0.2, 0.45, 1.4, 8);
  K.cyl('stone', 0, 2.9, -42, 0.001, 0.35, 0.6, 8);
  for (const [x, z] of [[-7, -34], [7, -34], [-7, -50], [7, -50]]) K.box('wood', x - 1, 0, z - 0.3, x + 1, 0.45, z + 0.3);
  for (const x of [-9, 9]) K.lampPost(x, -42, { h: 4, arm: x < 0 ? 1 : -1 });
  // courtyard gate
  K.wall('hotel', 'x', -54, 0.5, -12, 12, 0, 3.5, [{ a: -2.5, b: 2.5, lo: 0, hi: 3, kind: 'door' }]);
  K.door({ hx: -2.5, hz: -54, angle: 0, w: 2.5, h: 2.9, id: 'courtGate', locked: true, role: 'steel', panels: false, name: 'Gate' });
  K.door({ hx: 2.5, hz: -54, angle: Math.PI, w: 2.5, h: 2.9, id: 'courtGate2', locked: true, role: 'steel', panels: false, name: 'Gate', noNav: true });
  K.box('snow', -40, 0, -56, -12, 3.5, -54);
  K.box('snow', 12, 0, -56, 40, 3.5, -54);
  // beyond the gate: the service road down the mountain
  K.deco('path', -4, -0.28, -84, 4, 0.012, -54, { edges: false });
  K.car(6, -66, 1, 'car2');
  K.box('snow', -18, 0, -84, -14, 2, -56);
  K.box('snow', 14, 0, -84, 18, 2, -56);

  // ------------------------------------------------------------ nav
  K.navGrid(-38, 38, 1.5, 46, 0, 3);
  K.navGrid(-38, -24.8, -52.5, -2, 0, 3);
  K.navGrid(24.8, 38, -52.5, -2, 0, 3);
  K.navGrid(-24, 24, -5.2, -2, 0, 3);
  K.navGrid(-23.5, 23.5, -29.5, -6.5, 0, 1.5);
  K.navGrid(-23.5, 23.5, -29.5, -6.5, F2, 1.5);
  K.navGrid(-11.5, 11.5, -53.5, -30.8, 0, 2);
  K.navGrid(-13, 13, -82, -55.5, 0, 3);

  // ------------------------------------------------------------ enemies
  K.spawn(-12, 0, 8, E, 'smg', { patrol: [[-12, 8], [12, 8], [-12, 8]] });
  K.spawn(14, 0, 14, S, 'pistol');
  K.spawn(-2, 0, 18, S, 'shotgun', { hold: true });
  K.spawn(-4, 0, -24, S, 'smg', { hold: true });
  K.spawn(5, 0, -18, S, 'pistol');
  K.spawn(2, 0, -27.8, S, 'shotgun', { hold: true });
  K.spawn(-16, 0, -18, E, 'smg', { patrol: [[-16, -18], [-16, -8], [-22, -18], [-16, -18]] });
  K.spawn(-20, 0, -27, S, 'rifle', { hold: true });
  K.spawn(-12, 0, -12, S, 'pistol');
  K.spawn(12, 0, -22, S, 'shotgun', { hold: true });
  K.spawn(20, 0, -10, W, 'smg');
  K.spawn(-4, 0, -36, S, 'smg', { hold: true });
  K.spawn(5, 0, -48, S, 'pistol', { hold: true });
  // upper floor (the objective group)
  K.spawn(-20, F2, -18, E, 'smg', { group: 'upper', patrol: [[-20, -18], [18, -18], [-20, -18]] });
  K.spawn(-12, F2, -10, S, 'pistol', { group: 'upper' });
  K.spawn(1, F2, -11, S, 'shotgun', { group: 'upper', hold: true });
  K.spawn(9.5, F2, -18, W, 'heavy', { group: 'upper', hold: true });
  K.spawn(18, F2, -11, W, 'rifle', { group: 'upper', hold: true });
  K.spawn(-10, F2, -25, S, 'smg', { group: 'upper', hold: true });
  K.spawn(16, F2, -25, S, 'pistol', { group: 'upper' });
  K.spawn(22, F2, -21.5, W, 'shotgun', { group: 'upper', hold: true });
  K.spawn(7.5, F2, -27.4, S, 'civilian', { group: 'civ' });
  // final: balconies and the lobby
  K.spawn(-11.1, F2, -40, E, 'rifle', { group: 'final', perch: true });
  K.spawn(-11.1, F2, -49, E, 'smg', { group: 'final', perch: true });
  K.spawn(11.1, F2, -36, W, 'rifle', { group: 'final', perch: true });
  K.spawn(11.1, F2, -46, W, 'pistol', { group: 'final', perch: true, weapon: 'revolver' });
  K.spawn(-5, 0, -9, S, 'smg', { group: 'final' });
  K.spawn(-20, 0, -14, E, 'shotgun', { group: 'final' });
  K.spawn(-2, 0, -58, S, 'heavy', { group: 'final', hold: true });
  K.entry('drive', 0, 0, 44, N);
  K.entry('road', 0, 0, -80, S);
  K.entry('restW', -22, 0, -12, E);
  K.entry('stairNE', 22, F2, -26, W);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, 0, 42, N);
  K.zone('lobby', -8, -1, -30, 8, 3, -6);
  K.zone('exit', -14, -1, -84, 14, 4, -62);
  K.checkpoint(0, 0, -12, N, { need: 1, r: 6 });
  K.checkpoint(0, F2, -18, N, { need: 1, r: 10, at: [-5.4, F2, -17.5, E] });
  K.checkpoint(12, 0, -9, N, { need: 3, r: 5 });
  K.secret(-23.3, 0, -28);
  K.secret(-23, F2, -7.2);
  K.secret(9.5, 0, -52.6);
  K.item('health', 3, 0, 30, { tier: 3 });
  K.item('ammo', -6, 0, 12);
  K.item('health', 6.5, 0, -28.5);
  K.item('ammo', -22, 0, -8);
  K.item('health', 22, 0, -8.5, { tier: 2 });
  K.item('ammo', 17, 0, -26);
  K.item('health', -17, F2, -29, { tier: 2 });
  K.item('ammo', 12.5, F2, -7.5);
  K.item('health', 22.5, F2, -7.5);
  K.item('ammo', -9, 0, -45, { tier: 2 });
  K.item('health', 9, 0, -38, { tier: 3 });
  K.weapon('rifle', 8.62, 0.93, -9.4, 1.57);
  K.weapon('burst', 7, F2 + 0.6, -7, 1.3);
  K.weapon('mpistol', 19.5, 0.97, -13.5, 0.3);
  K.weapon('revolver', -22.4, F2 + 0.6, -7, 0.4);
  K.area('area.L5.lobby', -8, -30, 8, -6, -1, 3);
  K.area('area.L5.restaurant', -24, -30, -8, -6, -1, 3);
  K.area('area.L5.rooms', -24, -30, 24, -6, 3, 9);
  K.area('area.L5.court', -40, -90, 40, -30);
  K.data.arenas.push({ x: 0, y: 0, z: -14, yaw: S, entries: ['drive', 'restW', 'stairNE'] });
  K.data.arenas.push({ x: 0, y: 0, z: -40, yaw: N, entries: ['road', 'restW'] });
  yield 1;
}

export default {
  id: 'L5',
  num: 5,
  bounds: { x0: -60, z0: -100, x1: 60, z1: 60 },
  mapBounds: { x0: -40, x1: 40, z0: -84, z1: 48 },
  par: 540,
  loadout: { main: ['smg', 32, 128], side: ['pistol', 12, 48] },
  env: {
    classic: { paper: 0xffffff, fog: [26, 140] },
    neo: { sky: ['#5d7cf0', '#a4bfff', '#eef4ff', '#dfe8ff'], fog: 0xe8efff, fogRange: [50, 230], sun: [30, 42, -20], sunColor: 0xfff6ee, sunI: 0.48, hemiI: 0.74, hemiSky: 0xffffff, hemiGround: 0xb8c8ff, clouds: true, shadowBox: 40 },
    weather: 'snow',
    footprints: true,
    ambience: ['wind'],
  },
  groundSurf: 'snow',
  menuOrbit: { x: 0, z: -20, r: 60, h: 26, look: 3 },
  previewCam: { p: [-6, 1.7, 24], yaw: -0.15, pitch: 0.08 },
  startGroups: ['main', 'upper', 'civ'],
  objectives: [
    { key: 'L5.o1', type: 'reach', zone: 'lobby', marker: [0, 1.4, -8] },
    { key: 'L5.o2', type: 'kill', group: 'upper', showEnemies: true },
    { key: 'L5.o3', type: 'interact', ids: ['freeCiv'], onStart: [{ unlock: 'civDoor' }] },
    { key: 'L5.o4', type: 'interact', ids: ['courtExit'] },
    { key: 'L5.o5', type: 'reach', zone: 'exit', marker: [0, 1.4, -64], final: true },
  ],
  build,
};
