import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
const styles = (process.argv[2] || 'classic').split(',');
const weapons = (process.argv[3] || 'smg,shotgun,rifle,pistol').split(',');
for (const style of styles) {
  for (const w of weapons) {
    await page.evaluate(([w, style]) => {
      const g = WT.game;
      g.setStyle(style, false);
      const p = g.player;
      p.body.x = -29; p.body.z = 3; p.body.y = 5; p.yaw = -Math.PI / 2 + 0.2; p.pitch = -0.05;
      p.setWeapon(w, 30, 90, true);
      for (let i = 0; i < 20; i++) g.step(1 / 60);
    }, [w, style]);
    await page.screenshot({ path: `${out}/vm-${style}-${w}.png` });
    await page.evaluate(() => { const g = WT.game; g.input.left = true; g.input.leftPressed = true; g.step(1 / 60); g.input.left = false; });
    await page.screenshot({ path: `${out}/vm-${style}-${w}-fire.png` });
    await page.evaluate(() => { for (let i = 0; i < 3; i++) WT.game.step(1 / 60); });
    await page.screenshot({ path: `${out}/vm-${style}-${w}-fire3.png` });
  }
}
await browser.close();
