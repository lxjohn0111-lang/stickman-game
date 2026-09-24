// Screenshots of a level from given camera spots in both styles.
// usage: node tests/views.mjs <n> "x,y,z,yaw,pitch" ...
import { launch, root } from './harness.mjs';
const n = Number(process.argv[2]);
const spots = process.argv.slice(3).map((s) => s.split(',').map(Number));
const { browser, page, logs } = await launch();
await page.evaluate(() => { WT.game.manual = true; });
await page.evaluate((n) => WT.game.startLevel(n), n);
await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
await page.evaluate(() => { const g = WT.game; g.beginLevel(); g.ui.hideOverlay(); g.state = 'paused'; document.getElementById('pause').classList.add('hidden'); });
let i = 0;
for (const [x, y, z, yaw, pitch] of spots) {
  for (const st of ['classic', 'neo']) {
    const draws = await page.evaluate(({ x, y, z, yaw, pitch, st }) => {
      const g = WT.game; g.setStyle(st, false);
      g.player.body.x = x; g.player.body.y = y; g.player.body.z = z; g.player.yaw = yaw; g.player.pitch = pitch;
      g.state = 'ready'; g.step(1 / 60); g.step(1 / 60); return g.drawCalls;
    }, { x, y, z, yaw, pitch, st });
    await page.screenshot({ path: `${root}/test-output/L${n}-view${i}-${st}.png`, timeout: 180000 });
    console.log(`view${i} ${st} draws=${draws}`);
  }
  i++;
}
const errs = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
await browser.close();
