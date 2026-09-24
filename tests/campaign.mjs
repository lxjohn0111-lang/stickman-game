// Plays the whole campaign in sequence through the real menus on Normal
// (no god mode): dies and restarts from checkpoints when needed, switches
// visual style in the middle of fights, reloads the page part-way to check
// that progress survives, and finishes with the campaign-complete card.
// usage: node tests/campaign.mjs [--from 1] [--to 8] [--quality high]
import fs from 'node:fs';
import { launch, root } from './harness.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const from = Number(opt('--from', 1)), to = Number(opt('--to', 8));
const quality = opt('--quality', 'high');
const botSrc = fs.readFileSync(`${root}/tests/bot2.js`, 'utf8');
const profile = `${root}/test-output/profile-campaign`;
fs.rmSync(profile, { recursive: true, force: true });
let { browser, page, logs } = await launch({ profile });
const shot = (name) => page.screenshot({ path: `${root}/test-output/campaign-${name}.png`, timeout: 180000 });
const report = [];

await page.evaluate(({ quality, from }) => {
  const g = WT.game;
  WT.resetProgress();
  g.settings.difficulty = 'normal';
  g.settings.quality = quality;
  g.applySettings(false);
  g.manual = true;
  // unlock up to the starting level so --from works
  WT.progress.unlocked = from; WT.progress.last = from;
}, { quality, from });

for (let n = from; n <= to; n++) {
  if (n === from) {
    // two clicks from the menu: Play, then Start
    await page.$eval('#btn-play', (el) => el.click());
  }
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  const lvl = await page.evaluate(() => WT.game.level.def.id);
  if (!lvl.endsWith(String(n))) throw new Error(`expected level ${n}, got ${lvl}`);
  await page.addScriptTag({ content: botSrc });
  await page.evaluate(() => { const g = WT.game; g.beginLevel(); if (g.state === 'lockwait') g._enterPlaying(); });
  let deaths = 0, switched = 0, cps = new Set(), t0 = Date.now(), res;
  for (let chunk = 0; chunk < 140; chunk++) {
    res = await page.evaluate(() => {
      const g = WT.game;
      g.noRender = true;
      for (let i = 0; i < 600; i++) {
        BOT2.step();
        g.step(1 / 60);
        if (g.state === 'dead' || g.state === 'results') break;
      }
      g.noRender = false;
      return { state: g.state, t: g.time, idx: g.mission.index, cp: g.mission.cpIndex, combat: g.enemies.anyInCombat(), hp: g.player.health };
    });
    cps.add(res.cp);
    if (res.state === 'dead') {
      deaths++;
      // let the death card come up, then press Restart Checkpoint on it
      await page.evaluate(() => { const g = WT.game; for (let i = 0; i < 200 && !g.cardShown; i++) g.step(1 / 60); });
      await page.$eval('#death-btns .btn-try', (el) => el.click());
      await page.evaluate(() => { const g = WT.game; if (g.state === 'lockwait') g._enterPlaying(); });
      if (deaths > 25) break;
      continue;
    }
    if (res.state === 'results') break;
    // switch style in the middle of combat a couple of times per level
    if (res.combat && switched < 2 && chunk % 2 === 1) {
      await page.evaluate(() => { const g = WT.game; g.setStyle(g.style === 'neo' ? 'classic' : 'neo'); g.step(1 / 60); });
      switched++;
      if (switched === 1) await shot(`L${n}-combat-${await page.evaluate(() => WT.game.style)}`);
    }
  }
  const r = await page.evaluate(() => ({ state: WT.game.state, results: WT.game.state === 'results' ? WT.game.mission.results() : null, unlocked: WT.progress.unlocked }));
  const line = { level: n, ok: r.state === 'results', deaths, styleSwitches: switched, checkpoints: [...cps].filter((c) => c >= 0).length, gameTime: Math.round(res.t), wall: Math.round((Date.now() - t0) / 1000), stars: r.results && r.results.stars, score: r.results && r.results.score, kills: r.results && r.results.kills, unlocked: r.unlocked };
  report.push(line);
  console.log(JSON.stringify(line));
  if (r.state !== 'results') break;
  await shot(`L${n}-results`);
  // reload after level 3: progress must survive
  if (n === 3 && to > 3) {
    await browser.close();
    ({ browser, page, logs } = await launch({ profile }));
    const p = await page.evaluate(() => ({ unlocked: WT.progress.unlocked, last: WT.progress.last, l3: WT.progress.levels[3] }));
    console.log('after reload', JSON.stringify(p));
    if (p.unlocked < 4 || !p.l3 || !p.l3.completed) throw new Error('progress lost on reload');
    await page.evaluate(({ quality }) => { const g = WT.game; g.settings.quality = quality; g.applySettings(false); g.manual = true; }, { quality });
    await page.$eval('#btn-play', (el) => el.click());
    continue;
  }
  if (n < to) await page.$eval('#res-btns .btn-try', (el) => el.click());
}
const fin = await page.evaluate(() => ({ campaignWon: WT.progress.campaignWon, ach: WT.progress.achievements, endless: WT.progress.campaignWon }));
console.log('FINAL', JSON.stringify(fin));
if (to === 8) await shot('campaign-complete');
const errs = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
if (errs.length) console.log('ERRORS', errs.slice(0, 10).join('\n'));
await browser.close();
process.exit(report.every((r) => r.ok) ? 0 : 1);
