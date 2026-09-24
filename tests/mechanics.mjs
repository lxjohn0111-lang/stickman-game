// Deterministic checks of movement rules, doors, style switching and
// damage/death/restart, driven through the real game code in Chromium.
import { launch, root } from './harness.mjs';
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
const results = await page.evaluate(() => {
  const g = WT.game;
  g.manual = true;
  const P = g.player, b = P.body, inp = g.input;
  const out = {};
  const clearKeys = () => { for (const k in inp.keys) inp.keys[k] = false; inp.left = inp.right = false; };
  const run = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(i); g.step(1 / 60); } };
  const place = (x, y, z, yaw) => { b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.grounded = true; b.jumping = false; P.yaw = yaw; P.pitch = 0; };
  // freeze enemies so they don't interfere
  const freeze = () => { for (const e of g.enemies.list) { e.alive = false; e.ragdoll = null; } };
  const saved = g.enemies.list.map((e) => e.alive);

  // 1. parapet: 1.05 m, can't be jumped even when jumping into it repeatedly
  freeze();
  place(-20, 5, 2.0, 0); // facing north toward the parapet at z 0..0.3
  let maxY = 5, crossed = false;
  run(240, (i) => { clearKeys(); inp.keys.KeyW = true; if (i % 30 === 0) inp.pressed.Space = true; maxY = Math.max(maxY, b.y); if (b.z < 0.3) crossed = true; });
  out.parapet = { crossed, maxFeetY: +maxY.toFixed(3), finalZ: +b.z.toFixed(3), ok: !crossed && maxY < 5.9 };

  // 2. stairs: walk down all 20 steps without leaving the ground (no bounce)
  place(0, 5, 14.6, 0);
  let airborneFrames = 0, minY = 5;
  run(300, () => { clearKeys(); inp.keys.KeyW = true; if (!b.grounded) airborneFrames++; minY = Math.min(minY, b.y); });
  out.stairsDown = { endY: +b.y.toFixed(3), endZ: +b.z.toFixed(2), airborneFrames, ok: b.y < 0.01 && b.z < 6 && airborneFrames < 4 };

  // 3. stairs up (step-up only while grounded)
  place(0, 0, 5.0, Math.PI);
  run(300, () => { clearKeys(); inp.keys.KeyW = true; });
  out.stairsUp = { endY: +b.y.toFixed(3), endZ: +b.z.toFixed(2), ok: b.y > 4.99 && b.z > 13.5 };

  // 4. jumping next to a crate stack must not teleport the body on top of it
  place(-12.6, 0, -10.8, Math.PI); // just south of the crate at (-12.6,-12)
  run(120, (i) => { clearKeys(); inp.keys.KeyW = true; if (i === 5) inp.pressed.Space = true; });
  out.crateNoTeleport = { y: +b.y.toFixed(3), ok: b.y < 0.05 };
  // overlapping a tall collider from inside (e.g. spawned into it) resolves sideways, not upward
  place(-12.6, 0, -12.0, 0);
  run(5, () => clearKeys());
  out.insideCollider = { y: +b.y.toFixed(3), x: +b.x.toFixed(2), z: +b.z.toFixed(2), ok: b.y < 0.05 };

  // 5. every door opens onto walkable floor on both sides
  const doors = g.doors.map((d) => {
    const sides = [];
    for (const s of [1, -1]) {
      const nx = -Math.sin(d.closed) * s, nz = Math.cos(d.closed) * s;
      const px = d.cx + nx * 0.7, pz = d.cz + nz * 0.7;
      const floor = g.world.groundBelow(px, pz, 0.2, d.y0 + 0.05, 0.3);
      // swing zone: sample points along the open leaf on that side
      let clear = true;
      for (let t = 0.2; t <= d.w; t += 0.2) {
        const a = d.closed + (s > 0 ? 1 : -1) * Math.PI / 2 * 0.96;
        const x = d.hx + Math.cos(a) * t, z = d.hz + Math.sin(a) * t;
        if (g.world.overlaps(x, z, 0.05, d.y0 + 0.1, d.y0 + 1.9)) clear = false;
        if (g.world.groundBelow(x, z, 0.05, d.y0 + 0.05, 0.3) === null) clear = false;
      }
      sides.push({ floor: floor !== null && Math.abs(floor - d.y0) < 0.05, swingClear: clear });
    }
    return { name: d.name, sides, ok: sides.every((x) => x.floor && x.swingClear) };
  });
  out.doors = doors;

  // 6. door opens away from the player and blocks bullets
  const hut = g.doors[0];
  hut.reset();
  place(0, 5, 16.8, 0);
  out.aliveBeforeDoor = P.alive;
  const hitBefore = {};
  const blocked = g.world.raycast(0, 6.5, 16.8, 0, 0, -1, 5, 2, hitBefore) && hitBefore.door === hut;
  run(1, () => { clearKeys(); inp.pressed.KeyF = true; });
  run(60, () => clearKeys());
  const leafEndZ = hut.hz + Math.sin(hut.angle) * hut.w;
  out.doorSwing = { blockedWhenClosed: blocked, open: hut.isOpen, leafEndZ: +leafEndZ.toFixed(2), awayFromPlayer: leafEndZ < hut.hz, ok: blocked && hut.isOpen && leafEndZ < hut.hz };

  // restore enemies
  g.enemies.spawnAll(g.level.spawns);
  return out;
});
const { doors, ...rest } = results;
console.log(JSON.stringify(rest));
console.log('doors', doors.map((d) => d.name + ':' + d.ok).join(' '));

// 7. style switch mid-fight keeps state exactly
const sw = await page.evaluate(() => {
  const g = WT.game;
  g.restart();
  g.manual = true;
  const P = g.player;
  P.body.x = -18; P.body.z = 11.8; P.body.y = 0; P.yaw = Math.PI / 2; // in the canteen aisle
  P.health = 1e6; // stay alive for the duration of the fight
  for (const e of g.enemies.list) if (e.spawn.area === 'canteen') g.enemies.alert(e, P.x, P.y, P.z);
  // fight for a while: fire at whatever is in front
  for (let i = 0; i < 240; i++) { g.input.left = i % 40 < 20; g.step(1 / 60); }
  g.input.left = false;
  const before = JSON.stringify(g.snapshot());
  g.setStyle(g.style === 'neo' ? 'classic' : 'neo');
  const mid = JSON.stringify(g.snapshot());
  g.setStyle(g.style === 'neo' ? 'classic' : 'neo');
  const after = JSON.stringify(g.snapshot());
  const strip = (s) => JSON.parse(s, (k, v) => (k === 'style' ? undefined : v));
  const eq = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  const snap = g.snapshot();
  return { equalAfterSwitch: eq(before, mid), equalAfterSwitchBack: eq(before, after), decals: snap.fx.decals, pools: snap.fx.pools.length, dead: snap.enemies.filter((e) => e.alive === false).length, playerHp: snap.player.health, state: snap.state };
});
console.log('styleSwitch', JSON.stringify(sw));

// 8. damage -> hit direction, death -> card, restart
const dr = await page.evaluate(() => {
  const g = WT.game;
  g.restart();
  g.manual = true;
  const P = g.player;
  const res = {};
  for (const e of g.enemies.list) { e.alive = false; }
  P.yaw = 0; // facing north
  P.damage(10, P.x - 5, P.z); // from the west = left
  res.hitText = document.querySelector('#hitdir span').textContent;
  P.damage(10, P.x, P.z + 5); // from behind
  res.hitText2 = document.querySelector('#hitdir span').textContent;
  res.hpAfter = P.health;
  for (let i = 0; i < 60 * 6; i++) g.step(1 / 60);
  res.hpRegen = Math.round(P.health);
  P.damage(500, P.x + 3, P.z);
  for (let i = 0; i < 60 * 3; i++) g.step(1 / 60);
  res.state = g.state;
  res.cardVisible = !document.getElementById('death').classList.contains('hidden');
  res.cardText = document.querySelector('#death-title svg').getAttribute('aria-label');
  document.getElementById('btn-try').click();
  res.afterRestart = { state: g.state, hp: P.health, x: P.x, y: P.y, z: P.z, alive: g.enemies.alive };
  return res;
});
console.log('death', JSON.stringify(dr));
await browser.close();
const fails = [];
for (const [k, v] of Object.entries(rest)) if (v && typeof v === 'object' && v.ok === false) fails.push(k);
for (const d of doors) if (!d.ok) fails.push('door ' + d.name);
if (!sw.equalAfterSwitch || !sw.equalAfterSwitchBack) fails.push('style switch changed state');
if (dr.hitText !== 'HIT - LEFT' || dr.hitText2 !== 'HIT - BEHIND') fails.push('hit direction text');
if (dr.hpRegen !== 100) fails.push('health regen');
if (!dr.cardVisible || dr.cardText !== 'No way through.') fails.push('death card');
if (dr.afterRestart.state !== 'playing' || dr.afterRestart.hp !== 100) fails.push('restart');
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'mechanics: all checks passed');
process.exit(fails.length ? 1 : 0);
