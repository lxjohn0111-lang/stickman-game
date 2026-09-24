// Real input events through Playwright: keyboard, mouse look, clicks, pointer lock.
import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const mode = process.argv[2] || 'nolock';
const { browser, page } = await launch({ query: mode === 'lock' ? 'x=1' : 'nolock' });
const state = () => page.evaluate(() => { const g = WT.game, p = g.player; return { state: g.state, locked: g.input.locked, fallback: g.input.fallback, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), mag: p.weapon.mag, style: g.style, audio: Object.keys(g.audio.buffers).length, ctx: g.audio.ctx && g.audio.ctx.state }; });
await page.click('nav.menu-nav button[data-go=play]');
await page.waitForTimeout(400);
console.log('after play', JSON.stringify(await state()));
await page.evaluate(() => { for (const e of WT.game.enemies.list) e.alive = false; });
const s0 = await state();
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
const s1 = await state();
console.log('W moved', (s1.x - s0.x).toFixed(2), (s1.z - s0.z).toFixed(2));
await page.mouse.move(640, 360);
await page.mouse.move(740, 330, { steps: 10 });
await page.waitForTimeout(200);
const s2 = await state();
console.log('mouse look dyaw', (s2.yaw - s1.yaw).toFixed(3), 'dpitch', (s2.pitch - s1.pitch).toFixed(3));
await page.mouse.down();
await page.waitForTimeout(500);
await page.mouse.up();
const s3 = await state();
console.log('fired', s2.mag - s3.mag, 'rounds in 0.5s (SMG 0.09s cadence)');
await page.keyboard.press('KeyV');
await page.waitForTimeout(300);
console.log('V style', s3.style, '->', (await state()).style);
await page.screenshot({ path: `${out}/input-after-v.png`, timeout: 90000 });
await page.keyboard.press('KeyV');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('after Esc', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/pause.png`, timeout: 90000 });
// immediate resume click (a real browser may refuse the re-lock here)
await page.click('#pause nav button[data-go=resume]');
await page.waitForTimeout(600);
console.log('after resume', JSON.stringify(await state()));
const clicklock = await page.evaluate(() => !document.getElementById('clicklock').classList.contains('hidden'));
console.log('click-to-resume overlay visible:', clicklock);
if (clicklock) {
  await page.waitForTimeout(1500);
  await page.click('#clicklock');
  await page.waitForTimeout(600);
  console.log('after clicking overlay', JSON.stringify(await state()));
}
await browser.close();
