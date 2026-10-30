// The way a player meets the game: straight into play, no menu, no Play
// button, and on the very first run the first-kill tutorial on North Gate's
// roof (see src/tutorial.js). Runs on real frames, since the tutorial's slow
// motion only exists there.
import { launch, PHONE } from './harness.mjs';

const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

const state = (page) => page.evaluate(() => {
  const g = WT.game, tu = g.tutorial, P = g.player, e = tu.target;
  let off = null;
  if (e) {
    // angle between the view and the target's chest
    const dx = e.body.x - P.x, dz = e.body.z - P.z, dy = e.body.y + 1.25 * e.k - (P.y + 1.6);
    const fx = -Math.sin(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch);
    const l = Math.hypot(dx, dy, dz);
    off = +(Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / l))) * 180 / Math.PI).toFixed(2);
  }
  const vis = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && getComputedStyle(el).visibility !== 'hidden'; };
  return {
    state: g.state, level: g.level && g.level.n, phase: tu.phase, scale: +g.timeScale.toFixed(3), offDeg: off,
    targetAlive: e ? e.alive : null, arrow: vis('tut-arrow'), text: document.getElementById('tut-text').textContent,
    vignette: +document.getElementById('slowmo').style.opacity, menu: vis('menu'), loadcard: vis('loadcard'), clicklock: vis('clicklock'),
    objectiveShown: getComputedStyle(document.getElementById('objective')).visibility !== 'hidden' && !document.getElementById('objective').classList.contains('gone'),
    ammoPulse: document.getElementById('ammo').classList.contains('tut-pulse'),
    seen: WT.progress.tutorialSeen, health: P.health, anySees: g.enemies.list.some((x) => x.alive && x.sees),
  };
});

// ---- 1. first run on a desktop: straight into the tutorial
{
  const { browser, page, logs } = await launch({ autostart: true, query: 'nolock' });
  await page.waitForTimeout(1200);
  const a = await state(page);
  check('no menu, no loading card, no Play button: straight into play', a.state === 'playing' && !a.menu && !a.loadcard && !a.clicklock, a);
  check('first run lands in Level 1 in the tutorial', a.level === 1 && a.phase === 'shoot', a);
  check('time slows, the screen edges fade, a big red arrow and one short line', a.scale < 0.2 && a.vignette === 1 && a.arrow && /Click/.test(a.text) && a.text.length < 30, a);
  check('the view starts on the target, so the first click is the shot', a.offDeg !== null && a.offDeg < 3, a);
  check('nothing else competes for attention (objective hidden)', !a.objectiveShown, a);
  // the player can't be hurt and nobody notices them while they line it up
  await page.evaluate(() => { const g = WT.game; g.player.damage(40, g.player.x + 3, g.player.z, 'test'); });
  await page.waitForTimeout(1500);
  const b = await state(page);
  check('the player cannot be hurt during the tutorial', b.health === 100, b);
  check('no enemy notices the player while they line up the shot', !b.anySees, b);
  // the first click: the shot
  await page.mouse.move(640, 360);
  await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
  await page.waitForFunction(() => WT.game.tutorial.phase !== 'shoot', null, { timeout: 120000 }).catch(() => {});
  const c = await state(page);
  check('one click takes the target down', c.targetAlive === false && (c.phase === 'ammo' || c.phase === 'out'), c);
  check('then: watch your ammo, how to reload, with the counter pulsing', /ammo/i.test(c.text) && /reload/i.test(c.text) && c.ammoPulse && c.seen, c);
  await page.waitForFunction(() => !WT.game.tutorial.phase, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(300);
  const d = await state(page);
  check('time comes back to normal and the player is on their own', d.phase === null && d.scale > 0.95 && d.vignette === 0 && !d.arrow, d);
  check('the first objective shows briefly afterwards', d.objectiveShown, d);
  check('no page errors', logs.filter((l) => l.startsWith('pageerror')).length === 0, logs.filter((l) => l.startsWith('pageerror')).slice(0, 3));
  await browser.close();
}

// ---- 2. a returning player: no tutorial, their own level, one small "Click to play"
{
  const init = `localStorage.setItem('onewayout.save.v1', JSON.stringify({ v: 2, unlocked: 3, last: 3, levels: { 1: { completed: true, bestScore: 1, bestTime: 1, stars: 1, secrets: [false, false, false] }, 2: { completed: true, bestScore: 1, bestTime: 1, stars: 1, secrets: [false, false, false] } }, tutorialSeen: true }));`;
  const { browser, page } = await launch({ autostart: true, query: '', init });
  const a = await state(page);
  const pill = await page.evaluate(() => document.getElementById('clicklock').innerText.trim());
  check('a returning player goes back to their level, no tutorial', a.level === 3 && a.phase === null, a);
  check('desktop: one small "Click to play" over the live level (the mouse needs a click to be captured)', a.state === 'lockwait' && a.clicklock && /^click to play$/i.test(pill), { ...a, pill });
  await browser.close();
}

// ---- 3. a veteran from before the tutorial existed never gets it
{
  const init = `localStorage.setItem('onewayout.save.v1', JSON.stringify({ v: 2, unlocked: 2, last: 1, levels: { 1: { completed: true, bestScore: 1, bestTime: 1, stars: 2, secrets: [false, false, false] } } }));`;
  const { browser, page } = await launch({ autostart: true, query: 'nolock', init });
  const a = await state(page);
  check('a player who already won a level gets no tutorial', a.level === 1 && a.phase === null && a.state === 'playing', a);
  await browser.close();
}

// ---- 4. first run on a phone: the tutorial with touch wording, the FIRE button
{
  const { browser, page, logs } = await launch({ ...PHONE, autostart: true, query: '' });
  await page.waitForTimeout(1200);
  const a = await state(page);
  check('phone: straight into the tutorial with touch wording', a.state === 'playing' && a.phase === 'shoot' && /Tap/.test(a.text), a);
  const fire = await page.evaluate(() => { const r = document.querySelector('#touch .t-fire').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(fire.x, fire.y);
  await page.waitForFunction(() => WT.game.tutorial.phase !== 'shoot', null, { timeout: 120000 }).catch(() => {});
  const b = await state(page);
  check('phone: one tap on FIRE takes the target down; the reload line follows', b.targetAlive === false && /reload/i.test(b.text), b);
  check('phone: no page errors', logs.filter((l) => l.startsWith('pageerror')).length === 0, '');
  await browser.close();
}

// ---- 5. a phone held upright waits for it to turn, then starts the tutorial
{
  const { browser, page } = await launch({ width: 390, height: 844, mobile: true, autostart: true, query: '' });
  const a = await state(page);
  const rotate = await page.evaluate(() => document.body.classList.contains('need-landscape'));
  check('phone upright: waits with the "turn your device" card', a.state === 'lockwait' && rotate && a.phase === null, { ...a, rotate });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => WT.game.state === 'playing', null, { timeout: 30000 }).catch(() => {});
  const b = await state(page);
  check('turned to landscape: the tutorial starts', b.state === 'playing' && b.phase === 'shoot', b);
  await browser.close();
}

console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all tutorial checks passed');
process.exit(fails.length ? 1 : 0);
