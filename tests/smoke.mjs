import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const { browser, page } = await launch();
await page.screenshot({ path: `${out}/menu.png` });
const info = await page.evaluate(() => ({ calls: WT.game.drawCalls, state: WT.game.state, previews: Object.keys(WT.game.previews).map(k => WT.game.previews[k].length) }));
console.log('menu', JSON.stringify(info));
await page.click('nav.menu-nav button[data-go=play]');
await page.waitForTimeout(500);
// step a few frames manually for determinism
await page.evaluate(() => { for (let i = 0; i < 30; i++) WT.game.step(1/60); });
await page.screenshot({ path: `${out}/play-start.png` });
console.log('play', JSON.stringify(await page.evaluate(() => ({ calls: WT.game.drawCalls, state: WT.game.state, p: WT.game.player.snapshot() }))));
await browser.close();
