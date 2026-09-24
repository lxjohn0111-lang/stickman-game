import fs from 'node:fs';
import { launch, root } from './harness.mjs';
const { browser, page } = await launch();
console.log('launched');
await page.click('nav.menu-nav button[data-go=play]');
await page.addScriptTag({ content: fs.readFileSync(`${root}/tests/bot.js`, 'utf8') });
await page.evaluate(() => { WT.game.manual = true; WT.game.noRender = true; });
const chunk = Number(process.argv[2] || 10);
for (let k = 0; k < Number(process.argv[3] || 40); k++) {
  const r = await Promise.race([page.evaluate((chunk) => {
    const out = [];
    for (let i = 0; i < chunk; i++) { BOT.step(); WT.game.step(1 / 60); if (WT.game.state !== 'playing') { out.push('state ' + WT.game.state + ' at ' + i); break; } }
    const g = WT.game, p = g.player;
    out.push(JSON.stringify({ t: g.time.toFixed(2), x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2), yaw: p.yaw.toFixed(2), hp: p.health, alive: g.enemies.list.map((e) => (e.alive ? e.state[0] : 'x')).join(''), target: BOT.st.target, goal: BOT.st.goal }));
    return out.join(' | ');
  }, chunk), new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
  console.log(r);
  if (r === 'TIMEOUT') break;
}
await browser.close();
process.exit(0);
