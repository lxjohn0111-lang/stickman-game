import fs from 'node:fs';
import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const difficulty = process.argv[2] || 'normal';
const style = process.argv[3] || 'classic';
const { browser, page, logs } = await launch();
await page.evaluate(([d, s]) => { WT.game.settings.difficulty = d; WT.game.applySettings(false); WT.game.setStyle(s, false); }, [difficulty, style]);
await page.click('nav.menu-nav button[data-go=play]');
await page.addScriptTag({ content: fs.readFileSync(`${root}/tests/bot.js`, 'utf8') });
await page.evaluate(() => { WT.game.manual = true; WT.game.noRender = true; });
let lastGoal = -1, deaths = 0, frames = 0;
const t0 = Date.now();
while (frames < 60 * 60 * 8) {
  const r = await page.evaluate(() => {
    for (let i = 0; i < 120; i++) { BOT.step(); WT.game.step(1 / 60); if (WT.game.state !== 'playing') break; }
    const g = WT.game, p = g.player;
    return { state: g.state, goal: BOT.st.goal, t: g.time, x: p.x, y: p.y, z: p.z, hp: p.health, w: p.weapon.id, mag: p.weapon.mag, res: p.weapon.reserve, alive: g.enemies.alive, target: BOT.st.target, stats: p.stats };
  });
  frames += 120;
  if (r.goal !== lastGoal) {
    lastGoal = r.goal;
    console.log(`t=${r.t.toFixed(1)} goal=${r.goal} ${BOTNAME(r.goal)} pos=(${r.x.toFixed(1)},${r.y.toFixed(1)},${r.z.toFixed(1)}) hp=${r.hp.toFixed(0)} ${r.w} ${r.mag}/${r.res} enemiesAlive=${r.alive}`);
    await page.evaluate(() => { WT.game.noRender = false; WT.game.step(1 / 60); WT.game.noRender = true; });
    await page.screenshot({ path: `${out}/run-${style}-${String(r.goal).padStart(2, '0')}.png` });
  }
  if (r.state === 'dead') {
    deaths++;
    console.log(`DIED at t=${r.t.toFixed(1)} pos=(${r.x.toFixed(1)},${r.y.toFixed(1)},${r.z.toFixed(1)}) goal=${r.goal}`);
    await page.evaluate(() => { WT.game.noRender = false; for (let i = 0; i < 200; i++) WT.game.step(1 / 60); });
    await page.screenshot({ path: `${out}/run-${style}-death.png` });
    if (deaths >= 3) break;
    await page.evaluate(() => { WT.game.restart(); WT.game.noRender = true; BOT.st.goal = 0; BOT.st.path = null; });
    lastGoal = -1;
  }
  if (r.state !== 'playing' && r.state !== 'dead' && r.state !== 'won') { console.log('unexpected state', r.state, 't', r.t); break; }
  if (r.state === 'won') {
    console.log('WON', JSON.stringify(r.stats), 'time', r.t.toFixed(1));
    await page.evaluate(() => { WT.game.noRender = false; WT.game.step(1 / 60); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/run-${style}-win.png` });
    break;
  }
}
function BOTNAME(i) { return ['hut-door','hut-in','stair-foot','kitchen-door','kitchen','kitchen-south','canteen-door','canteen','exit','yard','mid-yard','tower-approach','past-tower','gate','through-gate','done'][i]; }
console.log('frames', frames, 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'deaths', deaths);
const errs = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
if (errs.length) console.log('ERRORS:\n' + errs.slice(0, 10).join('\n'));
await browser.close();
