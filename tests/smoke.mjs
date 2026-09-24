// Quick smoke test: boot, start level 1, step a few seconds, screenshot.
import { launch, root } from './harness.mjs';
const { browser, page, logs } = await launch();
const shot = (n) => page.screenshot({ path: `${root}/test-output/${n}.png`, timeout: 180000 });
await page.evaluate(() => { WT.game.manual = true; });
await shot('smoke-menu');
await page.evaluate(() => WT.game.startLevel(1));
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 120000 });
await shot('smoke-loadcard');
await page.evaluate(() => WT.game.beginLevel());
const r = await page.evaluate(() => {
  const g = WT.game;
  for (let i = 0; i < 120; i++) g.step(1 / 60);
  return g.snapshot();
});
console.log(JSON.stringify({ state: r.state, level: r.level, mission: r.mission, player: { x: r.player.x, y: r.player.y, z: r.player.z, health: r.player.health, loadout: r.player.loadout }, enemies: r.enemies.length, items: r.items.length, draws: r.drawCalls }));
await shot('smoke-play');
await page.evaluate(() => { WT.game.setStyle('neo'); WT.game.step(1 / 60); });
await shot('smoke-play-neo');
console.log(logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error')).slice(0, 10).join('\n'));
await browser.close();
