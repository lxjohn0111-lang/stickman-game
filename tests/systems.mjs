// Deterministic checks of the game systems, driven through the real code in
// Chromium: movement rules, weapons, health rules, slots and pickups, enemy
// roles (sniper laser, heavy stagger), checkpoints, style switching, ladders,
// conveyors and quality presets.
import { launch } from './harness.mjs';

const { browser, page, logs } = await launch();
const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info)}`); if (!ok) fails.push(name); };

async function level(n) {
  await page.evaluate((n) => { WT.game.manual = true; WT.game.startLevel(n); }, n);
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  await page.evaluate(() => { const g = WT.game; g.godMode = false; g.beginLevel(); if (g.state === 'lockwait') g._enterPlaying(); g.noRender = true; });
}

// shared helpers inside the page
await page.evaluate(() => {
  window.H = {
    clear() { const i = WT.game.input; for (const k in i.keys) i.keys[k] = false; i.left = i.right = false; },
    run(n, fn) { const g = WT.game; for (let i = 0; i < n; i++) { if (fn) fn(i); g.step(1 / 60); } },
    place(x, y, z, yaw) { const P = WT.game.player, b = P.body; b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.grounded = true; b.jumping = false; P.yaw = yaw; P.pitch = 0; },
    calm() { for (const e of WT.game.enemies.list) { e.alive = false; e.ragdoll = null; } WT.game.bullets.reset(); },
  };
});

// ---------------------------------------------------------------- Level 1: movement
await level(1);
let r = await page.evaluate(() => {
  const g = WT.game, P = g.player, b = P.body, inp = g.input;
  H.calm();
  const out = {};
  H.place(-20, 5, 2.0, 0);
  let maxY = 5, crossed = false;
  H.run(240, (i) => { H.clear(); inp.keys.KeyW = true; if (i % 30 === 0) inp.pressed.Space = true; maxY = Math.max(maxY, b.y); if (b.z < 0.3) crossed = true; });
  out.parapet = { crossed, maxY: +maxY.toFixed(2) };
  H.place(0, 5, 14.6, 0);
  let air = 0;
  H.run(300, () => { H.clear(); inp.keys.KeyW = true; if (!b.grounded) air++; });
  out.stairsDown = { y: +b.y.toFixed(2), z: +b.z.toFixed(2), air };
  H.place(0, 0, 5.0, Math.PI);
  H.run(300, () => { H.clear(); inp.keys.KeyW = true; });
  out.stairsUp = { y: +b.y.toFixed(2), z: +b.z.toFixed(2) };
  return out;
});
check('parapet cannot be jumped', !r.parapet.crossed && r.parapet.maxY < 5.9, r.parapet);
check('walk down stairs without bouncing', r.stairsDown.y < 0.01 && r.stairsDown.air < 4, r.stairsDown);
check('walk up stairs', r.stairsUp.y > 4.99, r.stairsUp);

// ---------------------------------------------------------------- weapons
r = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  H.calm();
  H.place(-18, 0, -20, 0);
  const out = {};
  let frame = 0;
  const log = [];
  const origPlay = g.audio.play.bind(g.audio);
  g.audio.play = (name, o) => { log.push(['sound', name, frame]); return origPlay(name, o); };
  const origKick = g.vm.kick.bind(g.vm);
  g.vm.kick = (s) => { log.push(['flash', frame]); return origKick(s); };
  const origFire = g.bullets.firePlayer.bind(g.bullets);
  let pellets = 0;
  g.bullets.firePlayer = (...a) => { pellets++; return origFire(...a); };
  for (const [w, slot] of [['smg', 'main'], ['rifle', 'main'], ['burst', 'main'], ['shotgun', 'main'], ['pistol', 'side'], ['mpistol', 'side'], ['revolver', 'side']]) {
    const lo = { main: ['smg', 32, 0], side: ['pistol', 12, 0], active: slot };
    lo[slot] = [w, 200, 0];
    P.setLoadout(lo);
    H.run(40, () => { frame++; });
    log.length = 0; pellets = 0;
    // hold the trigger for 2 s, pressing it again every 0.5 s for semi-autos
    H.run(120, (i) => { H.clear(); g.input.left = true; if (i % 30 === 0) g.input.leftPressed = true; frame++; });
    H.clear();
    const flashes = log.filter((l) => l[0] === 'flash');
    const sounds = log.filter((l) => l[0] === 'sound' && l[1] === P.weapon.def.sound);
    out[w] = { shots: flashes.length, pellets, sameFrame: flashes.every((f) => sounds.some((s) => s[2] === f[1])), mag: P.weapon.mag };
  }
  g.audio.play = origPlay; g.vm.kick = origKick; g.bullets.firePlayer = origFire;
  return out;
});
check('SMG fires 0.09 s cadence', Math.abs(r.smg.shots - 22) <= 1, r.smg);
check('rifle fires 0.125 s cadence', Math.abs(r.rifle.shots - 16) <= 1, r.rifle);
check('burst rifle fires 3-round bursts', r.burst.shots % 3 === 0 && r.burst.shots >= 9 && r.burst.shots <= 15, r.burst);
check('shotgun fires 8 pellets per shot', r.shotgun.pellets === r.shotgun.shots * 8 && r.shotgun.shots >= 2, r.shotgun);
check('pistol is semi-automatic', r.pistol.shots === 4, r.pistol);
check('auto pistol is automatic', r.mpistol.shots >= 25, r.mpistol);
check('revolver fires slowly', r.revolver.shots === 4, r.revolver);
check('flash and sound on the same frame', Object.values(r).every((v) => v.sameFrame), Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.sameFrame])));

// ---------------------------------------------------------------- reload: no firing until the mag is in
r = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  P.setLoadout({ main: ['smg', 0, 64], side: ['pistol', 12, 36], active: 'main' });
  H.run(30);
  g.input.pressed.KeyR = true;
  let firedDuring = 0;
  const origFire = g.bullets.firePlayer.bind(g.bullets);
  g.bullets.firePlayer = (...a) => { firedDuring++; return origFire(...a); };
  H.run(60, () => { g.input.left = true; });
  const midReload = { reloading: P.reloading, fired: firedDuring, mag: P.weapon.mag };
  H.run(60, () => { g.input.left = false; });
  g.bullets.firePlayer = origFire;
  return { midReload, after: { mag: P.weapon.mag, reserve: P.weapon.reserve, reloading: P.reloading } };
});
check('no firing during a reload', r.midReload.reloading && r.midReload.fired === 0, r);
check('reload fills the magazine', r.after.mag === 32 && r.after.reserve === 32, r.after);

// ---------------------------------------------------------------- health rules
r = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  H.calm();
  const out = {};
  P.health = 100; P.lastDamage = -99;
  P.damage(60, P.x + 5, P.z, 'test');
  const at40 = P.health;
  H.run(60 * 4);
  out.beforeDelay = +P.health.toFixed(1);
  H.run(60 * 8);
  out.capNormal = +P.health.toFixed(1);
  out.at40 = at40;
  // kit: +35, never above 100, not used at full health
  P.health = 90;
  g.items.list.push({ key: 'tk1', type: 'health', x: P.x, y: P.y, z: P.z, rest: true, yaw: 0 });
  H.run(2);
  out.kitAt90 = P.health;
  g.items.list.push({ key: 'tk2', type: 'health', x: P.x, y: P.y, z: P.z, rest: true, yaw: 0 });
  H.run(2);
  out.kitLeftAtFull = g.items.list.some((i) => i.key === 'tk2');
  P.health = 20;
  H.run(2);
  out.kitFrom20 = P.health;
  // hard: regen cap 50
  g.settings.difficulty = 'hard'; g.applySettings(false);
  P.health = 20; P.lastDamage = g.time;
  H.run(60 * 12);
  out.capHard = +P.health.toFixed(1);
  g.settings.difficulty = 'normal'; g.applySettings(false);
  return out;
});
check('regeneration waits 5 s', r.beforeDelay === r.at40, r);
check('regeneration caps at 75 on Normal', Math.abs(r.capNormal - 75) < 0.01, r);
check('health kit gives up to 100', r.kitAt90 === 100 && Math.abs(r.kitFrom20 - 55) < 0.5, r);
check('health kit not used at full health', r.kitLeftAtFull, r);
check('regeneration caps at 50 on Hard', Math.abs(r.capHard - 50) < 0.01, r);

// ---------------------------------------------------------------- slots + dropped guns keep their ammo
r = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  P.setLoadout({ main: ['smg', 17, 40], side: ['pistol', 5, 10], active: 'main' });
  g.input.pressed.Digit2 = true; H.run(30);
  const afterTwo = P.active;
  g.input.pressed.Digit1 = true; H.run(30);
  const afterOne = P.active;
  const p = g.items.drop('rifle', 11, 22, P.x, P.y, P.z, 0, false);
  p.rest = true; p.y = P.y + 0.03;
  P.takeWeapon(p);
  const dropped = g.items.list.find((i) => i.type === 'weapon' && i.weapon === 'smg');
  return { afterTwo, afterOne, now: P.getLoadout(), dropped: dropped && [dropped.mag, dropped.reserve] };
});
check('keys 1 and 2 switch main/sidearm', r.afterTwo === 'side' && r.afterOne === 'main', r);
check('picked-up gun keeps its ammo', r.now.main[0] === 'rifle' && r.now.main[1] === 11 && r.now.main[2] === 22, r.now);
check('dropped gun keeps its ammo', r.dropped && r.dropped[0] === 17 && r.dropped[1] === 40, r);

// ---------------------------------------------------------------- sniper laser + heavy stagger
r = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  H.calm();
  g.godMode = true;
  H.place(-14, 0, -30, Math.PI);
  const s = g.enemies.add({ role: 'sniper', x: -14, y: 0, z: -55, yaw: 0 }, { hunt: false });
  g.enemies.alert(s, P.x, P.y, P.z);
  s.reactT = 0; s.burstCd = 0;
  let laserFrames = 0, firstShot = -1, laserStart = -1;
  const orig = g.bullets.fireEnemy.bind(g.bullets);
  g.bullets.fireEnemy = (...a) => { if (firstShot < 0) firstShot = frame; return orig(...a); };
  let frame = 0;
  H.run(300, () => { frame++; if (s.snipe.on) { laserFrames++; if (laserStart < 0) laserStart = frame; } });
  g.bullets.fireEnemy = orig;
  const laser = { laserStart, firstShot, laserSec: +((firstShot - laserStart) / 60).toFixed(2) };
  s.alive = false; s.ragdoll = null;
  // heavy: repeated hits -> one stagger, then a cooldown
  const h = g.enemies.add({ role: 'heavy', x: -14, y: 0, z: -40, yaw: 0 }, { hunt: false });
  const pt = new WT.THREE.Vector3(-14, 1.2, -40), dir = new WT.THREE.Vector3(0, 0, -1);
  const staggers = [];
  let wasStag = false;
  for (let i = 0; i < 60; i++) {
    g.enemies.damage(h, 20, 'body', pt, dir);
    H.run(3);
    const st = h.stagger > 0;
    if (st && !wasStag) staggers.push(i);
    wasStag = st;
    if (!h.alive) break;
  }
  g.godMode = false;
  return { laser, staggers, heavyHp: Math.round(h.health), vest: !!h.R.vest, scale: h.k };
});
check('sniper laser shows ~1 s before the shot', r.laser.firstShot > 0 && r.laser.laserSec >= 0.95 && r.laser.laserSec <= 1.15, r.laser);
check('heavy staggers but cannot be stun-locked', r.staggers.length >= 1 && r.staggers.every((v, i) => i === 0 || v - r.staggers[i - 1] >= 15), { staggers: r.staggers });
check('heavy is bigger and wears a vest', r.vest && r.scale > 1.1, r);

// ---------------------------------------------------------------- checkpoint restore
await level(1);
r = await page.evaluate(() => {
  const g = WT.game, P = g.player, m = g.mission;
  const alive0 = g.enemies.alive;
  // stand on checkpoint 1 once its objective is active, with no fight nearby
  m.index = 1; m.obj = m.objectives[1];
  const cp = g.level.data.checkpoints[0];
  H.place(cp.x, cp.y, cp.z, 0);
  for (const e of g.enemies.list) { e.state = 'idle'; }
  H.run(10);
  const got = m.cpIndex;
  const loadout = JSON.stringify(P.getLoadout());
  // kill two enemies after the checkpoint, lose health and ammo, die
  const victims = g.enemies.list.filter((e) => e.alive).slice(0, 2);
  for (const e of victims) g.enemies.damage(e, 9999, 'body', new WT.THREE.Vector3(e.body.x, 1, e.body.z), new WT.THREE.Vector3(0, 0, -1));
  P.weapon.mag = 1;
  P.damage(500, P.x + 3, P.z, 'test');
  const dead = !P.alive;
  g.restartCheckpoint();
  if (g.state === 'lockwait') g._enterPlaying();
  return { alive0, got, dead, aliveAfter: g.enemies.alive, hp: P.health, loadoutSame: JSON.stringify(P.getLoadout()) === loadout, state: g.state, pos: [P.x, P.z].map((v) => +v.toFixed(1)), cp: [cp.x, cp.z] };
});
check('checkpoint activates when the area is calm', r.got === 0, r);
check('checkpoint restore: full health, same loadout, enemies back', r.dead && r.hp === 100 && r.loadoutSame && r.aliveAfter === r.alive0 && r.state === 'playing', r);

// ---------------------------------------------------------------- style switch keeps everything
r = await page.evaluate(() => {
  const g = WT.game;
  g.noRender = false;
  const keyOf = () => { const s = g.snapshot(); return JSON.stringify({ p: s.player, e: s.enemies.map((e) => [e.x, e.y, e.z, e.health, e.alive]), i: s.items.length, d: s.doors }); };
  H.run(5);
  const before = keyOf();
  g.setStyle('neo'); const mid = keyOf();
  g.setStyle('classic'); const after = keyOf();
  g.step(1 / 60);
  return { same: before === mid && mid === after };
});
check('style switch leaves game state untouched', r.same, r);

// ---------------------------------------------------------------- quality presets
r = await page.evaluate(() => {
  const g = WT.game;
  const out = {};
  for (const q of ['low', 'medium', 'high']) {
    g.settings.quality = q; g.applySettings(false);
    g.step(1 / 60); g.step(1 / 60);
    out[q] = { draws: g.drawCalls, shadow: g.sun.shadow.mapSize.x, particles: g.fx.q.particles, lines: g.materials.lineScale, ratio: g.renderer.getPixelRatio() };
  }
  return out;
});
check('quality presets change rendering only', r.low.shadow === 1024 && r.high.shadow === 2048 && r.low.particles < r.high.particles && r.low.lines < r.high.lines, r);

// ---------------------------------------------------------------- ladder (Level 2) + conveyor (Level 6)
await level(2);
r = await page.evaluate(() => {
  const g = WT.game, P = g.player, b = P.body, inp = g.input;
  H.calm();
  H.place(33.5, 0, 24.4, 0);
  let maxY = 0, climbed = false;
  H.run(240, () => { H.clear(); inp.keys.KeyW = true; if (P.climb) climbed = true; maxY = Math.max(maxY, b.y); if (b.y > 5.1 && b.grounded) H.clear(); });
  return { climbed, maxY: +maxY.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) };
});
check('ladder climbs to the container stack', r.climbed && r.maxY > 5.1, r);
await level(6);
r = await page.evaluate(() => {
  const g = WT.game, P = g.player, b = P.body;
  H.calm();
  H.place(-20, 0.35, -8, 0);
  H.run(10);
  const x0 = b.x;
  H.run(120, () => H.clear());
  const moved = b.x - x0;
  // shut the line down: the belt stops
  g.mission.interact(g.level.data.interacts.find((i) => i.id === 'ctrlA'));
  H.place(-20, 0.35, -8, 0);
  H.run(10);
  const x1 = b.x;
  H.run(120, () => H.clear());
  return { moved: +moved.toFixed(2), afterStop: +(b.x - x1).toFixed(2) };
});
check('conveyor carries the player; control stops it', r.moved > 2.5 && Math.abs(r.afterStop) < 0.05, r);

const errs = logs.filter((l) => l.startsWith('pageerror'));
check('no page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all systems checks passed');
process.exit(fails.length ? 1 : 0);
