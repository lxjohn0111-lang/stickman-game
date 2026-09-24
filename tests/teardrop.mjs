import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
for (const style of ['classic', 'neo']) {
  const info = await page.evaluate((style) => {
    const g = WT.game;
    g.restart(); g.manual = true; g.noRender = true; g.setStyle(style, false);
    const P = g.player;
    P.health = 1e6;
    P.body.x = -14; P.body.y = 0; P.body.z = -20; P.yaw = 0; P.pitch = 0;
    for (const e of g.enemies.list) e.alive = false;
    const e = g.enemies.list[8];
    e.alive = true; e.health = 80; e.body.x = -14.5; e.body.y = 0; e.body.z = -34; e.weapon = 'smg';
    g.enemies._enterCombat(e); e.reactT = 0; e.burstCd = 0; e.aimTime = 0;
    for (let i = 0; i < 600; i++) {
      g.step(1 / 60); P.yaw = 0; P.pitch = 0;
      const near = g.bullets.enemy.filter((b) => Math.hypot(b.x - P.cam.x, b.z - P.cam.z) < 6 && Math.hypot(b.x - P.cam.x, b.z - P.cam.z) > 2.5);
      if (near.length) break;
    }
    g.noRender = false; g.step(1 / 60);
    return g.bullets.enemy.map((b) => +Math.hypot(b.x - P.cam.x, b.z - P.cam.z).toFixed(1));
  }, style);
  console.log(style, 'enemy bullet distances', JSON.stringify(info));
  await page.screenshot({ path: `${out}/teardrop-${style}.png`, timeout: 90000 });
}
await browser.close();
