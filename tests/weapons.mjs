// Fire-rate, pellet count, semi-auto, pump, flash/sound same-frame checks.
import { launch } from './harness.mjs';
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
const r = await page.evaluate(() => {
  const g = WT.game;
  g.manual = true;
  for (const e of g.enemies.list) e.alive = false;
  const P = g.player;
  let frame = 0;
  const log = [];
  const origPlay = g.audio.play.bind(g.audio);
  g.audio.play = (name, o) => { log.push(['sound', name, frame]); return origPlay(name, o); };
  const origKick = g.vm.kick.bind(g.vm);
  g.vm.kick = (s) => { log.push(['flash', frame]); return origKick(s); };
  const out = {};
  for (const w of ['smg', 'rifle', 'shotgun', 'pistol']) {
    P.setWeapon(w, 200, 0, true);
    P.fireCd = 0;
    for (let i = 0; i < 30; i++) { g.step(1 / 60); frame++; }
    log.length = 0;
    const b0 = g.bullets.player.length;
    let pellets = 0;
    const firstBullets = [];
    const origFire = g.bullets.firePlayer.bind(g.bullets);
    g.bullets.firePlayer = (...a) => { pellets++; return origFire(...a); };
    // hold the trigger for exactly 2 seconds of game time
    for (let i = 0; i < 120; i++) { g.input.left = true; if (i === 0) g.input.leftPressed = true; g.step(1 / 60); frame++; }
    g.input.left = false;
    g.bullets.firePlayer = origFire;
    const flashes = log.filter((l) => l[0] === 'flash');
    const sounds = log.filter((l) => l[0] === 'sound' && l[1] === w);
    const sameFrame = flashes.every((f) => sounds.some((s) => s[2] === f[1]));
    const frames = flashes.map((f) => f[1]);
    const gaps = frames.slice(1).map((f, i) => (f - frames[i]) / 60);
    out[w] = { shotsIn2s: flashes.length, pellets, pelletsPerShot: pellets / Math.max(1, flashes.length), meanInterval: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(4) : null, soundSameFrameAsFlash: sameFrame, pumpSounds: log.filter((l) => l[1] === 'pump').length };
    for (let i = 0; i < 60; i++) { g.step(1 / 60); frame++; }
  }
  // semi-auto: tap 5 times
  P.setWeapon('pistol', 50, 0, true);
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  const m0 = P.weapon.mag;
  for (let t = 0; t < 5; t++) { g.input.left = true; g.input.leftPressed = true; g.step(1 / 60); for (let i = 0; i < 14; i++) g.step(1 / 60); g.input.left = false; g.step(1 / 60); }
  out.pistolTaps = m0 - P.weapon.mag;
  // pump animates after the shotgun shot
  P.setWeapon('shotgun', 6, 0, true);
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  g.input.left = true; g.input.leftPressed = true; g.step(1 / 60); g.input.left = false;
  let maxPump = 0;
  for (let i = 0; i < 40; i++) { g.step(1 / 60); maxPump = Math.max(maxPump, g.vm.current.movers.pump.position.z); }
  out.pumpTravel = +maxPump.toFixed(3);
  // recoil spring returns in ~5 frames; camera pitch kick partly recovers
  P.setWeapon('rifle', 30, 0, true);
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  const pitch0 = P.pitch + P.recoilPitch;
  g.input.left = true; g.input.leftPressed = true; g.step(1 / 60); g.input.left = false;
  const kick = [g.vm.kx];
  const pitchPeak = P.pitch + P.recoilPitch - pitch0;
  for (let i = 0; i < 8; i++) { g.step(1 / 60); kick.push(+g.vm.kx.toFixed(3)); }
  for (let i = 0; i < 40; i++) g.step(1 / 60);
  out.recoil = { springAfterFrames: kick, pitchKick: +pitchPeak.toFixed(4), pitchKept: +(P.pitch + P.recoilPitch - pitch0).toFixed(4) };
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
const fails = [];
if (!(r.smg.meanInterval > 0.085 && r.smg.meanInterval < 0.095)) fails.push('smg cadence');
if (!(r.rifle.meanInterval > 0.12 && r.rifle.meanInterval < 0.13)) fails.push('rifle cadence');
if (r.shotgun.pelletsPerShot !== 8) fails.push('shotgun pellets');
if (r.shotgun.pumpSounds < 1 || r.pumpTravel < 0.05) fails.push('shotgun pump');
if (r.pistol.shotsIn2s !== 1 || r.pistolTaps !== 5) fails.push('pistol semi-auto');
for (const w of ['smg', 'rifle', 'shotgun', 'pistol']) if (!r[w].soundSameFrameAsFlash) fails.push(w + ' sound/flash frame');
if (Math.abs(r.recoil.springAfterFrames[5]) > 0.1) fails.push('recoil spring');
if (!(r.recoil.pitchKept > 0 && r.recoil.pitchKept < r.recoil.pitchKick)) fails.push('camera kick recovery');
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'weapons: all checks passed');
process.exit(fails.length ? 1 : 0);
