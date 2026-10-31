// The feel-and-retention features: hit juice, the runt and the brute, weapon
// skins and the Armory, the results card's reasons to keep going, and the
// one-time onboarding lines. Stepped by hand where it can be, for exact
// numbers.
import { launch } from './harness.mjs';

const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

const { browser, page, logs } = await launch({ query: 'nolock' });
await page.evaluate(() => { WT.game.manual = true; WT.game.startLevel(2); });
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await page.evaluate(() => {
  const g = WT.game;
  // Normal: the numbers below are the roles' own, not Super Easy's halved ones
  g.settings.difficulty = 'normal'; g.applySettings(false);
  g.beginLevel(); if (g.state === 'lockwait') g._enterPlaying();
  window.H = {
    run(n) { for (let i = 0; i < n; i++) g.step(1 / 60); },
    clear() { for (const e of g.enemies.list) { e.alive = false; e.ragdoll = null; } g.enemies.list.length = 0; g.bullets.reset(); },
    put(role, dz = -6, dx = 0) { const P = g.player; const e = g.enemies.add({ role, x: P.x + dx, y: P.y, z: P.z + dz, yaw: 0 }, { hunt: false }); e.state = 'idle'; return e; },
  };
});

// ---- the new enemy types
let r = await page.evaluate(() => {
  const g = WT.game; H.clear();
  const runt = H.put('runt', -6, -1), brute = H.put('brute', -6, 1), smg = H.put('smg', -6, 3);
  H.run(2);
  const top = (e) => +Math.max(...e.joints.map((j) => j.y - e.body.y)).toFixed(2);
  return {
    runt: { hp: runt.health, k: runt.k, top: top(runt), hs: runt.hs, crest: !!runt.R.crest, speed: runt.R.run },
    brute: { hp: brute.health, k: brute.k, top: top(brute), helmet: !!brute.R.helmet, bodyH: +brute.body.h.toFixed(2) },
    smg: { hp: smg.health, top: top(smg) },
    drawn: { helmets: g.enemies.helmets.count, armors: g.enemies.armors.count, spikes: g.enemies.spikes.count },
  };
});
check('runt: small, quick, fragile, big-headed with a crest', r.runt.top < r.smg.top * 0.85 && r.runt.hs > 1.2 && r.runt.crest && r.runt.hp < r.smg.hp && r.runt.speed > 5, r.runt);
check('brute: a head taller than a regular, much tougher, helmeted', r.brute.top > r.smg.top * 1.3 && r.brute.hp > 3 * r.smg.hp && r.brute.helmet, r.brute);
check('brute: collision height stays door-sized', r.brute.bodyH <= 2.05, r.brute);
check('their gear is drawn (helmet, shoulder plates, crest)', r.drawn.helmets === 1 && r.drawn.armors === 1 && r.drawn.spikes === 1, r.drawn);

// the brute charges, and contact hurts and shoves
r = await page.evaluate(() => {
  const g = WT.game, P = g.player; H.clear();
  P.health = 100; P.lastDamage = -99;
  const b = H.put('brute', -9);
  b.state = 'combat'; b.awareness = 1; b.chargeCd = 0; b.reactT = 0;
  let charged = false;
  for (let i = 0; i < 60 * 4; i++) { b.sees = true; b.perceiveT = 1; b.lastSeen = g.time; b.lastKnown.set(P.x, P.y, P.z); g.step(1 / 60); if (b.chargeT > 0) charged = true; if (P.health < 100) break; }
  return { charged, health: Math.round(P.health), hit: b.chargeHit };
});
check('brute: charges at the player, and contact hurts', r.charged && r.hit && r.health < 100, r);

// they are in the campaign: the runt from Level 1, the brute from Level 2
r = await page.evaluate(() => ({ l2: WT.game.level.data.spawns.map((s) => s.role).filter((x) => x === 'brute' || x === 'runt') }));
check('Level 2 has runts and a brute', r.l2.includes('brute') && r.l2.filter((x) => x === 'runt').length >= 2, r);

// ---- hit juice
r = await page.evaluate(() => {
  const g = WT.game, P = g.player; H.clear();
  const e = H.put('smg', -6);
  e.health = 500;
  const dir = new WT.THREE.Vector3(0, 0, -1);
  const pt = e.joints[15].clone();
  g.enemies.damage(e, 20, 'body', pt, dir);
  const hit = { flash: e.flashT > 0, knock: +e.knock.length().toFixed(3) };
  H.run(1);
  const leaned = +(e.joints[0].z - e.body.z).toFixed(3);
  e.health = 10;
  const parts0 = g.fx.p.length;
  g.enemies.damage(e, 50, 'head', e.joints[0].clone(), dir);
  return { hit, leaned, killed: !e.alive, hitstop: g.hitstop, slowBeat: g.slowBeat, fovPunch: g.fovPunch, burst: g.fx.p.length - parts0, flashes: g.fx.flashes.length };
});
check('a hit flashes the body and jolts it along the shot', r.hit.flash && r.hit.knock > 0.05, r);
check('a kill: hitstop, a slow beat for a headshot, a view punch, an ink burst', r.killed && r.hitstop > 0.05 && r.slowBeat > 0 && r.fovPunch > 0.05 && r.burst >= 15 && r.flashes > 0, r);

// ---- weapon skins: earned with stars, worn on the first-person guns
r = await page.evaluate(() => {
  const g = WT.game;
  const gunMat = () => { let m = null; g.vm.guns.smg.group.traverse((o) => { if (o.name === 'role:gun') m = o.material; }); return m; };
  const base = gunMat();
  for (const k of Object.keys(WT.progress.levels)) delete WT.progress.levels[k];
  const before = { tiger: WT.wearSkin('tiger') };
  WT.progress.levels[1] = { completed: true, stars: 3, bestScore: 1, bestTime: 1, secrets: [false, false, false] };
  WT.progress.levels[2] = { completed: true, stars: 2, bestScore: 1, bestTime: 1, secrets: [false, false, false] };
  const tiger = WT.wearSkin('tiger');
  const worn = gunMat();
  const plasma = WT.wearSkin('plasma');
  g.setStyle('classic', false);
  const classic = gunMat();
  g.setStyle('neo', false);
  WT.wearSkin('standard');
  return { lockedRefused: before.tiger === false, tiger, plasmaLocked: plasma === false, changed: worn !== base, classicDiffers: classic !== worn, back: gunMat() === base, wornId: g.skin.id };
});
check('a skin needs its stars', r.lockedRefused && r.plasmaLocked, r);
check('wearing a skin dresses the first-person gun, with a look per style', r.tiger && r.changed && r.classicDiffers, r);
check('Standard puts the original look back', r.back && r.wornId === 'standard', r);

// ---- results: a reason to keep going
r = await page.evaluate(() => {
  const g = WT.game; H.clear();
  for (const k of Object.keys(WT.progress.levels)) delete WT.progress.levels[k];
  WT.progress.skinsSeen = ['standard'];
  const m = g.mission; m.run.killScore = 400; m.index = m.objectives.length - 1; m.obj = m.objectives[m.index]; m._complete();
  return { next: document.getElementById('res-next').innerText, state: g.state };
});
check('results: what the next level brings', /up next/i.test(r.next), r);
check('results: progress toward the next skin, or the skin just earned', /unlocks|new skin/i.test(r.next), r);

// ---- onboarding lines: once each, never repeated
r = await page.evaluate(() => {
  const g = WT.game, h = g.hints;
  WT.progress.hints = {};
  h.cool = 0; const first = h.show('reload');
  h.cool = 0; const again = h.show('reload');
  return { first, again, text: document.getElementById('tip').innerText, saved: !!WT.progress.hints.reload };
});
check('an onboarding line shows once and is remembered', r.first && !r.again && r.saved && /reload/i.test(r.text), r);

const errs = logs.filter((l) => l.startsWith('pageerror'));
check('no page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all feature checks passed');
process.exit(fails.length ? 1 : 0);
