// Phones and tablets: an emulated Android phone in landscape (touch screen,
// coarse pointer). Checks touch detection and mobile defaults, that menus and
// cards fit the small screen, the whole two-tap start, the joystick, look
// drag, multi-touch, every button, the tappable interaction prompt, aim
// assist, pause/resume, the portrait "turn your device" notice and a smaller
// phone size. Screenshots go to test-output/mobile-*.png.
import { launch, touchScreen, root, PHONE } from './harness.mjs';

const { browser, page, logs } = await launch({ ...PHONE, query: '' });
const shot = (n) => page.screenshot({ path: `${root}/test-output/mobile-${n}.png`, timeout: 180000 });
const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };
const ts = await touchScreen(page);
const step = (n) => page.evaluate((n) => { const g = WT.game; for (let i = 0; i < n; i++) g.step(1 / 60); }, n);
const center = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
// every visible element of `sel` lies inside the viewport (nothing cut off)
const fits = (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }))
  .then((rs) => ({ ok: rs.length > 0 && rs.every(([l, t, r, b]) => l >= -1 && t >= -1 && r <= innerW + 1 && b <= innerH + 1), rs }));
let innerW = PHONE.width, innerH = PHONE.height;

// ---- detection and defaults
const det = await page.evaluate(() => ({ touch: document.body.classList.contains('touch'), active: WT.game.touch.active, fallback: WT.game.input.fallback, quality: WT.game.settings.quality, variant: WT.t('tip.reload') }));
check('touch screen detected, no pointer lock, Low quality by default', det.touch && det.active && det.fallback && det.quality === 'low', det);
check('touch wording in hints', det.variant.startsWith('Tap'), det.variant);

// ---- menus fit the phone screen, in both styles
for (const style of ['classic', 'neo']) {
  await page.evaluate((s) => WT.game.setStyle(s, false), style);
  await page.$eval('nav.menu-nav button[data-sec=levels]', (el) => el.click());
  await page.waitForFunction(() => document.querySelectorAll('.lcard .pv:not(.pending)').length >= 8, null, { timeout: 600000 });
  await page.waitForTimeout(300);
  await shot(`menu-levels-${style}`);
  const m = await fits('#menu .menu-left, #menu-panel');
  check(`${style}: menu and Level Select panel fit the screen`, m.ok, m.rs);
  for (const sec of ['settings', 'controls']) {
    await page.$eval(`nav.menu-nav button[data-sec=${sec}]`, (el) => el.click());
    await page.waitForTimeout(250);
    await shot(`menu-${sec}-${style}`);
  }
}
const ctl = await page.textContent('#menu-panel');
check('controls section lists the touch controls', /Drag on the left half/.test(ctl) && /Aim assist|aim/i.test(ctl), ctl.slice(0, 120));
const set = await page.textContent('#menu-panel');
await page.$eval('nav.menu-nav button[data-sec=settings]', (el) => el.click());
const setText = await page.textContent('#menu-panel');
check('settings offer aim assist and button size on touch', setText.includes('Aim assist') && setText.includes('Touch button size'), '');
void set;

// ---- two taps to play: Play, then Start
await page.evaluate(() => { WT.game.manual = true; WT.game.setStyle('classic', false); });
await page.tap('#btn-play');
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await shot('loading-card');
const lc = await fits('#loadcard .card');
check('loading card fits', lc.ok, lc.rs);
await page.tap('#lc-start');
await page.waitForTimeout(100);
const st = await page.evaluate(() => WT.game.state);
check('Start goes straight to playing (no pointer lock needed)', st === 'playing', st);
await step(2);
await shot('hud');
const hud = await page.evaluate(() => ({ touch: getComputedStyle(document.getElementById('touch')).display, overlay: document.getElementById('overlay').textContent }));
check('touch controls shown in play, touch tutorial overlay', hud.touch === 'block' && /Drag on the left half/.test(hud.overlay), hud);
const hb = await fits('#touch .tbtn, #status, #objective, #scorebox');
check('HUD and buttons inside the screen', hb.ok, hb.rs);
// the thumbs' areas are clear of the health/ammo panel
const overlap = await page.evaluate(() => {
  const r = document.getElementById('status').getBoundingClientRect();
  return [...document.querySelectorAll('#touch .tbtn')].some((b) => { const q = b.getBoundingClientRect(); return q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; });
});
check('buttons do not cover the health and ammo panel', !overlap, '');

// ---- joystick: push up = walk forward
await page.evaluate(() => { WT.game.godMode = true; });
const p0 = await page.evaluate(() => { const P = WT.game.player; return { x: P.x, z: P.z, yaw: P.yaw }; });
await ts.drag(1, { x: 150, y: 280 }, { x: 150, y: 240 }, 6);
await step(40);
const s1 = await page.evaluate(() => ({ stick: WT.game.input.stick, x: WT.game.player.x, z: WT.game.player.z, sprint: WT.game.player.sprinting }));
const fwd = ((s1.x - p0.x) * -Math.sin(p0.yaw) + (s1.z - p0.z) * -Math.cos(p0.yaw));
check('joystick walks forward', s1.stick && s1.stick.f > 0.5 && fwd > 1, { fwd: +fwd.toFixed(2), stick: s1.stick, sprint: s1.sprint });
await shot('joystick');
// to the rim: sprint
await ts.move([{ id: 1, x: 150, y: 190 }]);
await step(20);
const sp = await page.evaluate(() => ({ sprint: WT.game.player.sprinting, shift: !!WT.game.input.keys.ShiftLeft }));
check('pushing to the rim sprints', sp.sprint && sp.shift, sp);
// joystick + look at the same time (two fingers)
const yaw0 = await page.evaluate(() => WT.game.player.yaw);
await ts.start([{ id: 1, x: 150, y: 190 }, { id: 2, x: 520, y: 170 }]);
for (let i = 1; i <= 6; i++) await ts.move([{ id: 1, x: 150, y: 190 }, { id: 2, x: 520 + i * 15, y: 170 }]);
await step(3);
const two = await page.evaluate(() => ({ yaw: WT.game.player.yaw, stick: WT.game.input.stick }));
check('two fingers: walking while dragging right turns right', two.yaw < yaw0 - 0.1 && two.stick && two.stick.f > 0.5, { dyaw: +(two.yaw - yaw0).toFixed(3) });
await ts.end([]);
await step(2);
const rel = await page.evaluate(() => ({ stick: WT.game.input.stick, shift: !!WT.game.input.keys.ShiftLeft }));
check('lifting the fingers stops', rel.stick === null && !rel.shift, rel);

// ---- look drag: vertical
const pitch0 = await page.evaluate(() => WT.game.player.pitch);
await ts.drag(3, { x: 560, y: 150 }, { x: 560, y: 200 }, 5);
await ts.end([]);
await step(2);
const pitch1 = await page.evaluate(() => WT.game.player.pitch);
check('dragging down looks down', pitch1 < pitch0 - 0.1, { d: +(pitch1 - pitch0).toFixed(3) });
await page.evaluate(() => { WT.game.player.pitch = 0; });

// ---- buttons
const tapBtn = async (name, hold = 0) => {
  const c = await center(`#touch .t-${name}`);
  await ts.start([{ id: 9, ...c }]);
  if (hold) await step(hold);
  await ts.end([]);
};
const w0 = await page.evaluate(() => ({ shots: WT.game.player.stats.shots, mag: WT.game.player.weapon.mag }));
{
  const c = await center('#touch .t-fire');
  await ts.start([{ id: 9, ...c }]);
  await step(30);
  await shot('firing');
  await ts.end([]);
}
const w1 = await page.evaluate(() => ({ shots: WT.game.player.stats.shots, mag: WT.game.player.weapon.mag, left: WT.game.input.left }));
check('holding fire shoots', w1.shots > w0.shots + 3 && w1.mag < w0.mag && !w1.left, { w0, w1 });
await tapBtn('reload');
await step(2);
check('reload button reloads', await page.evaluate(() => WT.game.player.reloading), '');
await step(200);
const y0 = await page.evaluate(() => WT.game.player.y);
await tapBtn('jump');
await step(12);
const y1 = await page.evaluate(() => WT.game.player.y);
check('jump button jumps', y1 > y0 + 0.3, { dy: +(y1 - y0).toFixed(2) });
await step(60);
await tapBtn('crouch');
await step(30);
const cr = await page.evaluate(() => ({ c: WT.game.player.crouch, on: document.querySelector('#touch .t-crouch').classList.contains('on') }));
await tapBtn('crouch');
await step(30);
const cr2 = await page.evaluate(() => WT.game.player.crouch);
check('crouch button toggles crouching', cr.c > 0.9 && cr.on && cr2 < 0.1, { cr, cr2 });
await tapBtn('aim');
await step(3);
const aim1 = await page.evaluate(() => WT.game.player.aiming);
await tapBtn('aim');
await step(3);
const aim2 = await page.evaluate(() => WT.game.player.aiming);
check('aim button toggles steady aim', aim1 && !aim2, { aim1, aim2 });
const sl0 = await page.evaluate(() => WT.game.player.active);
await tapBtn('swap');
await step(40);
const sl1 = await page.evaluate(() => WT.game.player.active);
check('swap button switches weapon', sl0 !== sl1, { sl0, sl1 });

// ---- the interaction prompt is a button: open a door with it
const door = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  const d = g.doors.find((d) => !d.locked && !d.isOpen);
  const nx = -Math.sin(d.closed), nz = Math.cos(d.closed);
  const px = d.cx + nx * 1.25, pz = d.cz + nz * 1.25;
  P.body.x = px; P.body.z = pz; P.body.y = d.y0; P.body.vx = P.body.vz = P.body.vy = 0;
  P.yaw = Math.atan2(-(d.cx - px), -(d.cz - pz)); P.pitch = -0.1;
  for (let i = 0; i < 4; i++) g.step(1 / 60);
  return { idx: g.doors.indexOf(d), target: P.lookTarget && P.lookTarget.kind, prompt: !document.getElementById('prompt').classList.contains('hidden') };
});
await shot('prompt');
if (door.target === 'door' && door.prompt) {
  const c = await center('#prompt');
  await ts.start([{ id: 7, ...c }]);
  await ts.end([]);
  await step(40);
}
const opened = await page.evaluate((i) => WT.game.doors[i].isOpen, door.idx);
check('tapping the prompt opens the door', door.target === 'door' && door.prompt && opened, { ...door, opened });

// ---- aim assist pulls toward an enemy near the crosshair while firing
const aa = await page.evaluate(() => {
  const g = WT.game, P = g.player;
  // stand 7 m from an enemy with a clear view of it, 4 degrees off target
  let found = null;
  for (const e of g.enemies.list) {
    if (!e.alive || e.civilian) continue;
    for (const a of [0, 1.57, 3.14, 4.71, 0.78, 2.35, 3.92, 5.5]) {
      const x = e.body.x + Math.sin(a) * 7, z = e.body.z + Math.cos(a) * 7;
      if (g.world.overlaps(x, z, 0.35, e.body.y + 0.05, e.body.y + 1.7)) continue;
      const j = e.joints;
      if (!g.world.clear(x, e.body.y + 1.6, z, (j[1].x + j[2].x) / 2, (j[1].y + j[2].y) / 2, (j[1].z + j[2].z) / 2, 2)) continue;
      found = { e, x, z };
      break;
    }
    if (found) break;
  }
  const { e } = found;
  P.body.x = found.x; P.body.z = found.z; P.body.y = e.body.y; P.body.vx = P.body.vy = P.body.vz = 0;
  const j = e.joints;
  const tx = (j[1].x + j[2].x) / 2, tz = (j[1].z + j[2].z) / 2;
  P.yaw = Math.atan2(-(tx - P.body.x), -(tz - P.body.z)) + 0.07; P.pitch = 0;
  g.step(1 / 60);
  return { id: e.id, err0: 0.07 };
});
{
  const c = await center('#touch .t-fire');
  await ts.start([{ id: 9, ...c }]);
  // enemies and the player's position are frozen so only the view can move
  aa.log = await page.evaluate(() => {
    const g = WT.game, P = g.player, out = [];
    const eu = g.enemies.update; g.enemies.update = () => {};
    const bx = P.body.x, by = P.body.y, bz = P.body.z;
    for (let i = 0; i < 20; i++) {
      g.step(1 / 60);
      P.body.x = bx; P.body.y = by; P.body.z = bz; P.body.vx = P.body.vy = P.body.vz = 0;
      out.push(g.touch.assist ? +g.touch.assist.dyaw.toFixed(3) : null);
    }
    g.enemies.update = eu;
    return out;
  });
  await ts.end([]);
}
const aaErr = await page.evaluate((id) => {
  const g = WT.game, P = g.player;
  const e = g.enemies.list.find((q) => q.id === id);
  const j = e.joints;
  const tx = (j[1].x + j[2].x) / 2, tz = (j[1].z + j[2].z) / 2;
  const yaw = Math.atan2(-(tx - P.body.x), -(tz - P.body.z));
  return Math.abs(Math.atan2(Math.sin(yaw - P.yaw), Math.cos(yaw - P.yaw)));
}, aa.id);
check('aim assist pulls the view onto a nearby target while firing', aaErr < 0.045, { before: aa.err0, after: +aaErr.toFixed(3), log: aa.log });

// ---- pause button, pause menu fits, resume by tap
await tapBtn('pause');
await page.waitForTimeout(100);
check('pause button pauses', (await page.evaluate(() => WT.game.state)) === 'paused', '');
await shot('pause');
const pm = await fits('#pause .menu-left, #pause-panel');
check('pause menu fits', pm.ok, pm.rs);
await page.tap('#pause nav button[data-go=resume]');
await page.waitForTimeout(100);
check('tapping Resume resumes', (await page.evaluate(() => WT.game.state)) === 'playing', '');

// ---- death card and results card fit
await page.evaluate(() => { const g = WT.game; g.godMode = false; g.player.damage(999, g.player.x, g.player.z - 5, 'test'); for (let i = 0; i < 180; i++) g.step(1 / 60); });
await shot('death');
const dc = await fits('#death .card');
check('death card fits', dc.ok, dc.rs);
await page.tap('#death-btns .btn-try');
await page.waitForTimeout(100);
check('Restart Checkpoint by tap', (await page.evaluate(() => WT.game.state)) === 'playing', '');
await page.evaluate(() => { const m = WT.game.mission; m.index = m.objectives.length - 1; m.obj = m.objectives[m.index]; m._complete(); });
await page.waitForTimeout(400);
await shot('results');
const rc = await fits('#results .card');
check('results card fits', rc.ok, rc.rs);

// ---- portrait: the "turn your device" notice, and play pauses
await page.tap('#res-btns button:nth-child(2)');
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await page.tap('#lc-start');
await page.waitForTimeout(100);
await page.setViewportSize({ width: 390, height: 844 });
innerW = 390; innerH = 844;
await page.waitForTimeout(400);
const por = await page.evaluate(() => ({ rotate: getComputedStyle(document.getElementById('rotate')).display, state: WT.game.state }));
await shot('portrait');
check('portrait shows "turn your device" and pauses', por.rotate === 'flex' && por.state === 'paused', por);
await page.setViewportSize({ width: 740, height: 360 });
innerW = 740; innerH = 360;
await page.waitForTimeout(400);
await page.tap('#pause nav button[data-go=resume]');
await step(3);
await shot('small-phone-hud');
const sm = await fits('#touch .tbtn, #status, #objective, #scorebox');
check('small phone (740x360): HUD and buttons inside the screen', sm.ok, sm.rs);
await page.evaluate(() => WT.game.toMainMenu());
await page.waitForTimeout(300);
await shot('small-phone-menu');
const smm = await fits('#menu .menu-left, #menu-panel');
check('small phone: menu fits', smm.ok, smm.rs);

const errs = logs.filter((l) => l.startsWith('pageerror'));
check('no page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all mobile checks passed');
process.exit(fails.length ? 1 : 0);
