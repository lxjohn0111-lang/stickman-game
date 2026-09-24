import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const { browser, page } = await launch();
await page.waitForTimeout(1500);
for (const style of ['classic', 'neo']) {
  await page.evaluate((s) => WT.game.setStyle(s, false), style);
  for (const sec of ['settings', 'controls']) {
    await page.click(`#menu nav button[data-sec=${sec}]`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/ui-${style}-menu-${sec}.png`, timeout: 90000 });
  }
}
await page.evaluate(() => WT.game.setStyle('classic', false));
await page.click('nav.menu-nav button[data-go=play]');
await page.evaluate(() => { const g = WT.game; g.manual = true; g.player.body.x = -14; g.player.body.z = -20; g.player.body.y = 0; g.player.yaw = 0.4; for (let i = 0; i < 5; i++) g.step(1 / 60); g.ui.area('yard'); g.ui.visited.add('roof'); g.ui.visited.add('stairs'); g.ui.visited.add('kitchen'); g.ui.visited.add('canteen'); g.pause(); for (let i = 0; i < 3; i++) g.step(1 / 60); });
await page.click('#pause nav button[data-sec=mission]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-classic-pause-mission.png`, timeout: 90000 });
await page.evaluate(() => { WT.game.setStyle('neo', false); WT.game.step(1 / 60); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-neo-pause-mission.png`, timeout: 90000 });
await page.click('#pause nav button[data-sec=style]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-neo-pause-style.png`, timeout: 90000 });
await browser.close();
