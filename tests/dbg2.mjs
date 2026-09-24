import fs from 'node:fs';
import { launch, root } from './harness.mjs';
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
await page.addScriptTag({ content: fs.readFileSync(`${root}/tests/bot.js`, 'utf8') });
await page.evaluate(() => { WT.game.manual = true; WT.game.noRender = true; });
const race = (p, ms = 20000) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT'), ms))]);
for (let k = 0; k < 20; k++) {
  const r = await race(page.evaluate(() => { for (let i = 0; i < 120; i++) { BOT.step(); WT.game.step(1 / 60); if (WT.game.state !== 'playing') break; } return WT.game.state + ' ' + WT.game.time.toFixed(1); }));
  if (!r.startsWith('playing')) { console.log('r', r); break; }
}
console.log(await page.evaluate(() => { const g = WT.game; if (g.state === 'playing') g.player.damage(999, g.player.x + 3, g.player.z); return g.state + ' t=' + g.time.toFixed(1) + ' goal=' + BOT.st.goal; }));
for (let k = 0; k < 12; k++) {
  const t0 = Date.now();
  const r = await race(page.evaluate(() => { WT.game.noRender = false; for (let i = 0; i < 20; i++) WT.game.step(1 / 60); const p = WT.game.player; return [WT.game.state, (WT.game.deathClock || 0).toFixed(2), p.cam.x.toFixed(2), p.cam.y.toFixed(2), p.cam.z.toFixed(2), p.pitch.toFixed(2), p.roll.toFixed(2), WT.game.drawCalls].join(' '); }));
  console.log('step', r, Date.now() - t0, 'ms');
  const t1 = Date.now();
  const s = await race(page.screenshot({ path: `${root}/test-output/death-${k}.png`, timeout: 15000 }).then(() => 'ok').catch((e) => 'ERR ' + e.message.split('\n')[0]));
  console.log('shot', s, Date.now() - t1, 'ms');
  if (s !== 'ok') break;
}
await browser.close();
process.exit(0);
