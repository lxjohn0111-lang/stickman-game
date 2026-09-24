// Loads every level at every quality preset, plays a few seconds of combat
// with the bot, renders frames and checks for errors. The level itself must
// be identical at each preset (same colliders, nav graph, enemies, pickups);
// only rendering detail may change. One screenshot per level and preset.
import fs from 'node:fs';
import { launch, root } from './harness.mjs';

const { browser, page, logs } = await launch();
const botSrc = fs.readFileSync(`${root}/tests/bot2.js`, 'utf8');
const fails = [];
await page.evaluate(() => { WT.game.manual = true; });
for (let n = 1; n <= 8; n++) {
  const sig = {};
  for (const q of ['low', 'medium', 'high']) {
    await page.evaluate((q) => { const g = WT.game; g.settings.quality = q; g.applySettings(false); }, q);
    await page.evaluate((n) => WT.game.startLevel(n), n);
    await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
    if (n === 1 && q === 'low') await page.addScriptTag({ content: botSrc });
    const r = await page.evaluate(() => {
      const g = WT.game;
      g.godMode = true;
      g.beginLevel();
      if (g.state === 'lockwait') g._enterPlaying();
      BOT2.st.path = null; BOT2.st.lastIndex = -1;
      g.noRender = true;
      for (let i = 0; i < 60 * 12; i++) { BOT2.step(); g.step(1 / 60); }
      g.noRender = false;
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) g.step(1 / 60);
      const ms = (performance.now() - t0) / 3;
      const L = g.level;
      return {
        layout: `${g.world.cols.length}/${g.nav.nodes.length}/${L.data.spawns.length}/${L.data.items.length}`,
        state: g.state, draws: g.drawCalls, ms: Math.round(ms), pr: +g.renderer.getPixelRatio().toFixed(2), shadow: g.sun ? g.sun.shadow.mapSize.x : null,
      };
    });
    sig[q] = r.layout;
    await page.screenshot({ path: `${root}/test-output/q-L${n}-${q}.png`, timeout: 180000 });
    console.log(`L${n} ${q.padEnd(6)} ${JSON.stringify(r)}`);
    if (r.state !== 'playing' && r.state !== 'results') fails.push(`L${n} ${q} state ${r.state}`);
    await page.evaluate(() => WT.game.toMainMenu());
  }
  if (new Set(Object.values(sig)).size !== 1) fails.push(`L${n} layout differs between presets ${JSON.stringify(sig)}`);
}
const errs = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
if (errs.length) fails.push(...errs.slice(0, 5));
await browser.close();
console.log(fails.length ? `FAILED:\n${fails.join('\n')}` : 'all levels load and play at low, medium and high');
process.exit(fails.length ? 1 : 0);
