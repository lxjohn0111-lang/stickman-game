// Level 8 - Island Fortress, the finale.
//   jetty and dock (containers, as at the port) -> sea gate -> outer bailey
//   with barracks -> three ways into the central courtyard (the barracks
//   tunnel, the east postern, or over the rampart stair) -> courtyard with a
//   watchtower, sandbags, a water tower and a stacked container -> disable the
//   alarm in the guardhouse -> the command tower (three floors and a roof)
//   -> the commander, who falls back and changes weapon as he's hurt.
import * as THREE from 'three';
import { MOVE } from '../world.js';

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const WH = 8; // outer wall height
const IW = 7; // inner wall height
const T1 = 4.5, T2 = 9, T3 = 13.5; // tower floors and roof

function* build(K) {
  K.use('main');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ helpers
  const merlons = (x0, z0, x1, z1, y, step = 2) => {
    const along = x1 - x0 > z1 - z0;
    const L = along ? x1 - x0 : z1 - z0;
    for (let a = 0.3; a < L - 0.5; a += step) {
      if (along) K.deco('stone', x0 + a, y, z0, x0 + a + 1, y + 0.9, z1);
      else K.deco('stone', x0, y, z0 + a, x1, y + 0.9, z0 + a + 1);
    }
  };
  const tower = (x, z, h = 4.2) => {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box('wood', x + dx * 1.1 - 0.1, 0, z + dz * 1.1 - 0.1, x + dx * 1.1 + 0.1, h + 2.3, z + dz * 1.1 + 0.1);
    K.box('wood', x - 1.3, h - 0.15, z - 1.3, x + 1.3, h, z + 1.3);
    K.box('wood', x - 1.3, h, z - 1.3, x + 1.3, h + 0.95, z - 1.2);
    K.box('wood', x - 1.3, h, z - 1.3, x - 1.2, h + 0.95, z + 1.3);
    K.box('wood', x + 1.2, h, z - 1.3, x + 1.3, h + 0.95, z + 1.3);
    K.box('wood', x - 1.3, h, z + 1.2, x - 0.35, h + 0.95, z + 1.3);
    K.box('wood', x + 0.35, h, z + 1.2, x + 1.3, h + 0.95, z + 1.3);
    K.deco('tent', x - 1.6, h + 2.3, z - 1.6, x + 1.6, h + 2.45, z + 1.6);
    K.ladder({ x, z: z + 1.35, y0: 0, y1: h, face: 'n' });
  };
  const waterTower = (x, z) => {
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) K.box('steel', x + dx - 0.12, 0, z + dz - 0.12, x + dx + 0.12, 8, z + dz + 0.12);
    for (const dz of [-1.6, 1.6]) K.rod('steel', V(x - 1.6, 1, z + dz), V(x + 1.6, 6, z + dz), 0.05);
    K.cyl('tank', x, 10, z, 2.6, 2.6, 4, 14);
    K.cyl('tank', x, 12.6, z, 0.2, 2.8, 1.2, 14);
  };

  // ------------------------------------------------------------ sea, dock, jetty
  K.ground('sand', -60, 36, 60, 57);
  K.ground('path', -60, -70, 60, 36);
  K.deco('water', -200, -1.2, 56, 200, -0.6, 200, { edges: false });
  K.deco('water', -200, -1.2, -200, -44, -0.6, 56, { edges: false });
  K.deco('water', 44, -1.2, -200, 200, -0.6, 56, { edges: false });
  K.deco('water', -200, -1.2, -200, 200, -0.6, -62, { edges: false });
  K.box('deck', -3, 0, 56, 3, 0.3, 76);
  for (let z = 57; z < 76; z += 1.2) K.line(-3, 0.305, z, 3, 0.305, z);
  for (const x of [-3, 3]) for (let z = 58; z < 76; z += 4) K.cyl('wood', x, -0.2, z, 0.18, 0.18, 1.5, 8);
  K.collider(-44, -2, 56, -3, 3, 57, MOVE);
  K.collider(3, -2, 56, 44, 3, 57, MOVE);
  K.collider(-3.3, 0.3, 56, -3, 1.3, 76, MOVE);
  K.collider(3, 0.3, 56, 3.3, 1.3, 76, MOVE);
  K.collider(-3.3, 0.3, 76, 3.3, 1.3, 76.3, MOVE);
  K.container(-22, 48, { role: 'cont2' });
  K.container(-22, 48, { y: 2.6, role: 'cont4' });
  K.container(22, 46, { role: 'cont1', doors: 'both' });
  K.container(-6, 44, { rot: 1, len: 6.1, role: 'cont3' });
  K.crateStack(10, 52);
  K.crateStack(-34, 44);
  for (const x of [-40, 40]) K.lampPost(x * 0.6, 54, { arm: x < 0 ? 1 : -1 });

  // ------------------------------------------------------------ outer walls + sea gate
  K.wall('stone', 'x', 37, 2, -44, 44, 0, WH, [{ a: -3, b: 3, lo: 0, hi: 5, kind: 'gap' }]);
  merlons(-44, 36, 44, 36.6, WH);
  K.wall('stone', 'z', -43, 2, -62, 36, 0, WH);
  K.wall('stone', 'z', 43, 2, -62, 36, 0, WH);
  K.wall('stone', 'x', -61, 2, -44, 44, 0, WH);
  for (const x of [-44, 44]) for (const z of [-62, 38]) { K.cyl('stoneDark', x, WH / 2 + 1, z, 3.2, 3.6, WH + 2, 10); K.cyl('flag', x, WH + 3, z, 0.001, 3.3, 2, 10); }
  K.box('stoneDark', -4.5, 5, 35.8, 4.5, 7, 38.2, { col: false });
  for (let x = -2.6; x < 3; x += 0.6) K.rod('steel', V(x, 5, 37), V(x, 4.2, 37), 0.05, 4);
  K.sign('SEA GATE', 0, 6.2, 38.25, 4, 0.7, 1);

  // ------------------------------------------------------------ outer bailey + barracks
  for (const [x0, x1, tunnel] of [[-38, -18, true], [18, 38, false]]) {
    K.room(x0, 14, x1, 32, 0, {
      role: 'stone', h: 3.6, t: 0.4,
      s: [K.win(x0 + 2, 1.6, 1.2, 2.4), K.op((x0 + x1) / 2 - 0.5, 1.0), K.win(x1 - 3.6, 1.6, 1.2, 2.4)],
      n: tunnel ? [{ a: -32, b: -28, lo: 0, hi: 3, kind: 'gap' }] : [K.win(x0 + 3, 1.6, 1.2, 2.4)],
      e: x0 < 0 ? [K.op(20, 1.0)] : [],
      w: x0 > 0 ? [K.op(20, 1.0)] : [],
      ceil: 'barracksRoof', floor: 'wood',
    });
    K.doorAt('x', 32, (x0 + x1) / 2 - 0.5, 1.0);
    K.doorAt('z', x0 < 0 ? x1 : x0, 20, 1.0);
    for (let x = x0 + 1.5; x < x1 - 2; x += 3.2) {
      K.box('bed', x, 0, 28.5, x + 1, 0.55, 31.5);
      K.box('steel', x, 0, 28.3, x + 1, 1.6, 28.5, { col: false });
    }
    K.box('locker', x0 + 0.4, 0, 16, x0 + 1, 2, 22);
    K.tableSet((x0 + x1) / 2, 22, { chairs: 4, w: 3, d: 1 });
    K.lampLight((x0 + x1) / 2, 3.55, 22, { sx: 3, sz: 0.3 });
  }
  K.sandbags(-8, 20, -4, 21, 1.1);
  K.sandbags(4, 26, 8, 27, 1.1);
  waterTower(10, 20);
  K.car(-10, 30, 1, 'car3');

  // ------------------------------------------------------------ inner wall: three ways through
  K.wall('stone', 'x', 10, 2, -42, 42, 0, IW, [
    { a: -32, b: -28, lo: 0, hi: 3, kind: 'gap' },
    { a: -3, b: 3, lo: 0, hi: 5, kind: 'door' },
    { a: 13.4, b: 14.6, lo: 0, hi: 2.2, kind: 'door' },
  ]);
  merlons(-42, 10.7, 42, 11, IW + 1);
  K.box('stone', -42, IW, 10.7, 42, IW + 1, 11, { col: true });
  // main gate is barred shut (portcullis)
  for (let x = -2.8; x < 3; x += 0.4) K.rod('steel', V(x, 0, 10), V(x, 5, 10), 0.05, 4);
  K.collider(-3, 0, 9.9, 3, 5, 10.1, MOVE);
  K.rod('steel', V(-3, 2.5, 10), V(3, 2.5, 10), 0.06, 4);
  // barracks tunnel (tiled, like the metro)
  K.wall('tileWall', 'z', -32, 0.3, -2, 14, 0, 3.2);
  K.wall('tileWall', 'z', -28, 0.3, -2, 14, 0, 3.2);
  K.deco('ceiling', -32.2, 3.2, -2, -27.8, 3.4, 14);
  K.collider(-32.2, 3.2, -2, -27.8, 3.4, 14, MOVE, null, 'roof');
  K.lampLight(-30, 3.15, 6, { sx: 0.4, sz: 1.2 });
  // east postern
  K.doorAt('x', 11, 13.4, 1.2, 0, { role: 'wood' });
  // rampart stair from the courtyard
  K.stairs({ x: -40, z: -2.2, y0: 0, dir: 's', n: 28, rise: IW / 28, run: 0.4, w: 1.4, role: 'stone', rails: 'right' });
  K.sign('KEEP', 0, 5.8, 8.95, 2.4, 0.6, -1);

  // ------------------------------------------------------------ courtyard
  K.container(14, -16, { rot: 1, role: 'cont2' });
  K.container(-14, -28, { role: 'cont3' });
  K.container(-14, -28, { y: 2.6, role: 'cont1' });
  K.container(28, -2, { rot: 1, len: 6.1, role: 'cont4' });
  tower(24, -10);
  waterTower(32, -32);
  K.sandbags(-3, -12, 3, -11, 1.1);
  K.sandbags(-24, -4, -20, -3, 1.1);
  K.sandbags(6, -36, 10, -35, 1.1);
  K.cyl('stone', 0, 0.35, -24, 3, 3.2, 0.7, 16);
  K.cyl('water', 0, 0.72, -24, 2.6, 2.6, 0.04, 16, { edges: false });
  K.cyl('stoneDark', 0, 1.8, -24, 0.4, 0.6, 2.2, 8);
  K.collider(-2.3, 0, -26.3, 2.3, 0.7, -21.7, MOVE);
  for (const [x, z] of [[-20, -18], [20, -26], [-34, -36], [34, -6]]) K.lampPost(x, z, { arm: x < 0 ? 1 : -1 });
  K.barrier(-8, -34, 'x');
  K.barrier(12, -40, 'x');
  // guardhouse with the alarm
  K.room(-40, -22, -28, -8, 0, { role: 'stone', h: 3.5, t: 0.4, e: [K.op(-16, 1.0), K.win(-12, 1.6, 1.2, 2.4)], s: [K.win(-36, 2, 1.2, 2.4)], ceil: 'barracksRoof' });
  K.doorAt('z', -28, -16, 1.0);
  K.box('machine', -39.8, 0, -16.8, -39.3, 1.8, -14.2);
  K.interact('alarm', -39.2, 1.3, -15.5, { prompt: 'prompt.alarm', face: 'e', from: 1 });
  K.tableSet(-34, -18, { chairs: 2 });
  K.lampLight(-34, 3.45, -14);

  // ------------------------------------------------------------ command tower
  const TX0 = -8, TX1 = 8, TZ0 = -58, TZ1 = -44;
  const narrow = (a0, a1) => K.wins(a0, a1, 0.6, 2.6, 1.2, 2.6);
  K.room(TX0, TZ0, TX1, TZ1, 0, { role: 'stone', h: T1, t: 0.5, s: [...narrow(-7, -2), { a: -1, b: 1, lo: 0, hi: 2.4, kind: 'door' }, ...narrow(2, 7)], e: narrow(-57, -45), w: narrow(-57, -45) });
  K.door({ hx: -1, hz: TZ1, angle: 0, w: 2, h: 2.35, id: 'towerDoor', locked: true, role: 'wood' });
  K.room(TX0, TZ0, TX1, TZ1, T1, { role: 'stone', h: T2 - T1, t: 0.5, s: narrow(-7, 7), n: narrow(-7, 7), e: narrow(-57, -45), w: narrow(-57, -45) });
  K.room(TX0, TZ0, TX1, TZ1, T2, { role: 'stone', h: T3 - T2, t: 0.5, s: K.wins(-6.5, 6.5, 1.4, 3, 1.0, 2.8), n: narrow(-7, 7), e: narrow(-57, -45), w: narrow(-57, -45) });
  // floors with stair holes (F0->F1 west, F1->F2 east, F2->roof west)
  const floor = (y, hx0, hx1, hz0, hz1) => {
    K.slab('stoneDark', TX0, TZ0, hx0, TZ1, y, 0.3);
    K.slab('stoneDark', hx1, TZ0, TX1, TZ1, y, 0.3);
    K.slab('stoneDark', hx0, TZ0, hx1, hz0, y, 0.3);
    K.slab('stoneDark', hx0, hz1, hx1, TZ1, y, 0.3);
  };
  K.stairs({ x: -6.6, z: -45.3, y0: 0, dir: 'n', n: 18, rise: T1 / 18, run: 0.31, w: 1.3, role: 'wood', rails: 'right' });
  floor(T1, -7.3, -5.9, -50.9, -45.3);
  K.collider(-5.95, T1, -50.9, -5.85, T1 + 1, -45.8, MOVE);
  K.stairs({ x: 6.6, z: -56.9, y0: T1, dir: 's', n: 18, rise: (T2 - T1) / 18, run: 0.31, w: 1.3, role: 'wood', rails: 'left' });
  floor(T2, 5.9, 7.3, -56.9, -51.3);
  K.collider(5.85, T2, -56.4, 5.95, T2 + 1, -51.3, MOVE);
  K.stairs({ x: -6.6, z: -45.3, y0: T2, dir: 'n', n: 18, rise: (T3 - T2) / 18, run: 0.31, w: 1.3, role: 'wood', rails: 'right' });
  floor(T3, -7.3, -5.9, -50.9, -45.3);
  K.collider(-5.95, T3, -50.9, -5.85, T3 + 1, -45.8, MOVE);
  // roof battlements
  K.box('stone', TX0 - 0.25, T3, TZ0 - 0.25, TX1 + 0.25, T3 + 1.1, TZ0 + 0.25);
  K.box('stone', TX0 - 0.25, T3, TZ1 - 0.25, TX1 + 0.25, T3 + 1.1, TZ1 + 0.25);
  K.box('stone', TX0 - 0.25, T3, TZ0, TX0 + 0.25, T3 + 1.1, TZ1);
  K.box('stone', TX1 - 0.25, T3, TZ0, TX1 + 0.25, T3 + 1.1, TZ1);
  merlons(TX0 - 0.25, TZ1 - 0.25, TX1 + 0.25, TZ1 + 0.25, T3 + 1.1, 1.6);
  merlons(TX0 - 0.25, TZ0 - 0.25, TX1 + 0.25, TZ0 + 0.25, T3 + 1.1, 1.6);
  K.cyl('steel', 5, T3 + 3, -55, 0.06, 0.06, 6, 6);
  K.box('flag', 5.06, T3 + 4.4, -55.1, 5.1, T3 + 5.8, -53, { col: false });
  // furniture: map table upstairs, crates below
  K.tableSet(0, -52, { chairs: 4, w: 3, d: 1.6, y: T2 });
  K.deco('path', -1.2, T2 + 0.77, -52.6, 1.2, T2 + 0.79, -51.4);
  K.crateStack(3, -56.5);
  K.box('locker', 5.4, T1, -50.5, 7.2, T1 + 2, -49.5);
  K.box('flag', -2, T2 + 1.2, -57.7, 2, T2 + 3.8, -57.6, { col: false });
  for (const y of [0, T1, T2]) K.lampLight(0, y + (y ? T1 : T1) - 0.35, -51, { sx: 2, sz: 0.4 });
  K.sign('COMMAND', 0, 3.1, -43.7, 3, 0.55, 1);

  // ------------------------------------------------------------ bounds + nav
  K.bounds(-42, -60, 42, 76);
  K.navGrid(-2.2, 2.2, 57, 75, 0.3, 2);
  K.navGrid(-41, 41, 38.5, 55, 0, 2.6);
  K.navGrid(-41.5, 41.5, 11.5, 35.5, 0, 2.4);
  K.navGrid(-37.5, -18.5, 14.5, 31.5, 0, 2);
  K.navGrid(18.5, 37.5, 14.5, 31.5, 0, 2);
  K.navGrid(-31.4, -28.6, -1.5, 13.5, 0, 1.4);
  K.navGrid(-41.5, 41.5, -59, 8.5, 0, 2.5);
  K.navGrid(-39.5, -28.5, -21.5, -8.5, 0, 1.8);
  K.navGrid(-41.5, 41.5, 9.2, 10.6, IW, 1.4);
  for (const y of [0, T1, T2, T3]) K.navGrid(-7.4, 7.4, -57.4, -44.6, y, 1.6);

  // ------------------------------------------------------------ enemies
  K.spawn(-15, 0, 50, E, 'smg', { patrol: [[-15, 50], [14, 52], [-15, 50]] });
  K.spawn(17, 0, 42, W, 'pistol');
  K.spawn(0, 0, 40, S, 'shotgun', { hold: true });
  K.spawn(-22, 5.2, 47.5, S, 'rifle', { perch: true });
  K.spawn(-8, 0, 26, S, 'smg', { patrol: [[-8, 26], [8, 16], [-8, 26]] });
  K.spawn(12, 0, 15, S, 'rifle', { hold: true });
  K.spawn(-30, 0, 24, E, 'shotgun', { hold: true });
  K.spawn(-22, 0, 17, S, 'pistol');
  K.spawn(28, 0, 24, W, 'smg');
  K.spawn(22, 0, 17, S, 'heavy', { hold: true });
  K.spawn(-30, 0, 3, S, 'smg', { hold: true });
  K.spawn(-20, IW, 9.9, N, 'sniper');
  K.spawn(20, IW, 9.9, N, 'rifle', { perch: true });
  K.spawn(-10, 0, -10, S, 'smg', { patrol: [[-10, -10], [10, -6], [-10, -10]] });
  K.spawn(8, 0, -20, S, 'rifle', { hold: true });
  K.spawn(-14, 5.2, -28, S, 'rifle', { perch: true });
  K.spawn(24, 4.2, -10.4, W, 'sniper');
  K.spawn(-34, 0, -12, E, 'shotgun', { hold: true });
  K.spawn(-31, 0, -20, E, 'pistol');
  K.spawn(-3, 0, -50, S, 'smg', { hold: true });
  K.spawn(4, T1, -48, S, 'rifle', { hold: true });
  K.spawn(-3, T1, -55, S, 'shotgun', { hold: true });
  K.spawn(-5, T2, -47, S, 'smg', { hold: true });
  K.spawn(5, T3, -56.5, S, 'rifle', { perch: true });
  K.spawn(0, T2, -54.5, S, 'commander', {
    weapon: 'rifle',
    stages: [{ x: 1, y: T3, z: -49, yaw: S, weapon: 'shotgun' }, { x: 2, y: T1, z: -53, yaw: S, weapon: 'smg' }],
  });
  K.entry('courtW', -38, 0, -34, E);
  K.entry('courtE', 38, 0, -38, W);
  K.entry('yard', 0, 0, 4, N);
  K.entry('postern', 14, 0, 7, N);

  // ------------------------------------------------------------ player, objectives
  K.setStart(0, 0.3, 72, N);
  K.zone('court', -42, -1, -42, 42, 3, 8.8);
  K.zone('tower', TX0 + 0.3, -1, TZ0 + 0.3, TX1 - 0.3, 3, TZ1 - 0.3);
  K.checkpoint(0, 0, 30, N, { need: 0, r: 9 });
  K.checkpoint(-22, 0, -6, N, { need: 1, r: 9 });
  K.checkpoint(0, 0, -40, N, { need: 2, r: 7 });
  K.secret(22, 0.12, 46);
  K.secret(-41.2, IW, 10);
  K.secret(-7, T3, -57);
  K.item('health', 0, 0.3, 60, { tier: 3 });
  K.item('ammo', -30, 0, 42);
  K.item('health', -36, 0, 30);
  K.item('ammo', 36, 0, 30);
  K.item('health', -30, 0, -1, { tier: 2 });
  K.item('ammo', 16, 0, 6);
  K.item('health', -36, 0, -20);
  K.item('ammo', 20, 0, -34);
  K.item('health', 6, 0, -40, { tier: 2 });
  K.item('ammo', -6, 0, -56);
  K.item('health', 6, T1, -45);
  K.item('ammo', -6, T2, -56);
  K.item('health', 6, T3, -45, { tier: 2 });
  K.item('health', -30, 0, -40, { tier: 3 });
  K.weapon('shotgun', -26.5, 0.77, 22, 0.3);
  K.weapon('rifle', 27.2, 0.77, 22, 1.4);
  K.weapon('revolver', -34, 0.77, -18, 0.4);
  K.weapon('mpistol', 2.6, 1.13, -56.5, 0.2);
  K.area('area.L8.dock', -60, 36, 60, 90);
  K.area('area.L8.tunnels', -33, -2, -27, 14);
  K.area('area.L8.court', -60, -43, 60, 9);
  K.area('area.L8.tower', TX0, TZ0, TX1, TZ1);
  K.data.arenas.push({ x: 0, y: 0, z: -24, yaw: S, entries: ['courtW', 'courtE', 'yard', 'postern'] });
  K.data.arenas.push({ x: 0, y: 0, z: 26, yaw: N, entries: ['postern', 'yard'] });
  yield 1;
}

export default {
  id: 'L8',
  num: 8,
  bounds: { x0: -70, z0: -80, x1: 70, z1: 90 },
  mapBounds: { x0: -46, x1: 46, z0: -64, z1: 78 },
  par: 660,
  loadout: { main: ['burst', 30, 120], side: ['pistol', 12, 48] },
  env: {
    classic: { paper: 0xffffff, fog: [30, 170] },
    neo: { sky: ['#3a6bd6', '#7fb0ff', '#d6ecff', '#bfe3ff'], fog: 0xcfe6ff, fogRange: [60, 260], sun: [-30, 50, 22], sunColor: 0xfff4e0, sunI: 0.5, hemiI: 0.7, hemiSky: 0xffffff, hemiGround: 0x9ab0e0, clouds: true, shadowBox: 44 },
    ambience: ['sea', 'siren'],
  },
  groundSurf: 'ground',
  menuOrbit: { x: 0, z: 0, r: 80, h: 40, look: 4 },
  previewCam: { p: [-2, 1.95, 70], yaw: 0.02, pitch: 0.1 },
  objectives: [
    { key: 'L8.o1', type: 'reach', zone: 'court', marker: [-30, 1.4, 0] },
    { key: 'L8.o2', type: 'interact', ids: ['alarm'], onComplete: [{ hook: 'alarmOff' }, { unlock: 'towerDoor' }, { wave: { count: 3, roles: ['smg', 'rifle', 'shotgun'], entries: ['courtE', 'postern'], announce: true } }] },
    { key: 'L8.o3', type: 'reach', zone: 'tower', marker: [0, 1.4, -45] },
    { key: 'L8.o4', type: 'boss', final: true, onStart: [{ music: 'combat' }] },
  ],
  bossStages: [
    [{ wave: { count: 3, roles: ['smg', 'rifle', 'shotgun'], entries: ['courtW', 'courtE', 'yard'] } }],
    [{ wave: { count: 3, roles: ['heavy', 'smg', 'rifle'], entries: ['courtE', 'courtW', 'postern'] } }],
  ],
  hooks: {
    alarmOff(g) {
      g.audio.setAmbience(['sea', 'wind']);
      g.audio.play('powerUp', { gain: 0.5, rate: 0.6 });
    },
  },
  saveState(g) { return { alarm: g.mission.used.has('alarm') }; },
  loadState(g, s) { g.audio.setAmbience(s && s.alarm ? ['sea', 'wind'] : ['sea', 'siren']); },
  build,
};
