// Plays one level with the objective bot. usage: node tests/level.mjs <n> [--god] [--secs 600] [--style neo] [--shots]
import fs from 'node:fs';
import { launch, root } from './harness.mjs';
const args = process.argv.slice(2);
const n = Number(args[0] || 1);
const god = args.includes('--god');
const secs = Number(args[args.indexOf('--secs') + 1]) || 600;
const style = args.includes('--style') ? args[args.indexOf('--style') + 1] : 'classic';
const shots = args.includes('--shots');
const diff = args.includes('--diff') ? args[args.indexOf('--diff') + 1] : 'normal';
const { browser, page, logs } = await launch();
const shot = (name) => page.screenshot({ path: `${root}/test-output/L${n}-${name}.png`, timeout: 180000 });
await page.evaluate(({ style, diff }) => { const g = WT.game; g.manual = true; g.settings.difficulty = diff; g.applySettings(false); g.setStyle(style, false); }, { style, diff });
await page.evaluate((n) => WT.game.startLevel(n), n);
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await page.addScriptTag({ content: fs.readFileSync(`${root}/tests/bot2.js`, 'utf8') });
await page.evaluate((god) => { const g = WT.game; g.godMode = god; g.beginLevel(); g.step(1 / 60); }, god);
if (shots) await shot('start');
const t0 = Date.now();
let res, deaths = 0, lastIdx = -1, shotAt = 0;
for (let chunk = 0; chunk < secs / 10; chunk++) {
  res = await page.evaluate(() => {
    const g = WT.game;
    g.noRender = true;
    for (let i = 0; i < 600; i++) {
      BOT2.step();
      g.step(1 / 60);
      if (g.state === 'dead' && g.deathClock > 0.5) return { dead: true };
      if (g.state === 'results' || g.mission.done) break;
    }
    g.noRender = false;
    const P = g.player;
    const m = g.mission;
    return { state: g.state, t: +g.time.toFixed(1), idx: m.index, label: m.label, cp: m.cpIndex, x: +P.x.toFixed(1), y: +P.y.toFixed(1), z: +P.z.toFixed(1), hp: Math.round(P.health), kills: m.run.kills, alive: g.enemies.alive, done: m.done, w: P.weapon.id + ' ' + P.weapon.mag + '/' + P.weapon.reserve };
  });
  if (res.dead) {
    deaths++;
    console.log('DIED — restarting checkpoint');
    await page.evaluate(() => { const g = WT.game; g.restartCheckpoint(); g._enterPlaying(); });
    continue;
  }
  if (res.idx !== lastIdx || chunk % 3 === 0) console.log(JSON.stringify(res));
  if (shots && (res.idx !== lastIdx)) { await shot(`obj${res.idx}`); }
  lastIdx = res.idx;
  if (res.state === 'results' || res.done) break;
}
const final = await page.evaluate(() => { const g = WT.game; return { state: g.state, results: g.state === 'results' ? g.mission.results() : null, bot: BOT2.st.log, draws: g.drawCalls }; });
console.log('FINAL', JSON.stringify(final), 'deaths', deaths, 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's');
if (shots) await shot('end');
const errs = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
if (errs.length) console.log('ERRORS', errs.slice(0, 10).join('\n'));
await browser.close();
process.exit(final.state === 'results' ? 0 : 1);
