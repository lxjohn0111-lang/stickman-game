import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
for (const style of ['classic', 'neo']) {
  const info = await page.evaluate((style) => {
    const g = WT.game;
    g.restart();
    g.manual = true;
    g.setStyle(style, false);
    const P = g.player;
    P.health = 1e6;
    // stand in the canteen aisle facing the rifleman
    P.body.x = -26; P.body.z = 7.25; P.body.y = 0; P.yaw = -Math.PI / 2; P.pitch = 0.02;
    for (const e of g.enemies.list) if (e.spawn.area !== 'canteen') e.alive = false;
    const e = g.enemies.list[4];
    e.body.x = -19.5; e.body.z = 7.4;
    g.enemies._enterCombat(e);
    e.reactT = 0; e.burstCd = 0;
    let n = 0;
    g.noRender = true;
    // wait until enemy bullets are in the air
    for (let i = 0; i < 400; i++) { g.step(1 / 60); P.yaw = -Math.PI / 2; P.pitch = 0.02; if (g.bullets.enemy.length >= 3) { n = i; break; } }
    for (let i = 0; i < 4; i++) g.step(1 / 60);
    g.noRender = false;
    // fire the SMG so a tracer is in flight
    g.input.left = true; g.input.leftPressed = true; g.step(1 / 60); g.input.left = false;
    P.damage(1, P.x, P.z - 5); // show the HIT text (from ahead)
    return { frames: n, enemyBullets: g.bullets.enemy.length, playerBullets: g.bullets.player.length, draws: g.drawCalls };
  }, style);
  console.log(style, JSON.stringify(info));
  await page.screenshot({ path: `${out}/combat-${style}.png`, timeout: 90000 });
  // close-up of an enemy for the rim / eye
  const d = await page.evaluate(() => {
    const g = WT.game; const P = g.player; const e = g.enemies.list[4];
    P.body.x = e.body.x - 2.2; P.body.z = e.body.z + 0.3; P.yaw = -Math.PI / 2 + 0.1; P.pitch = 0.05;
    e.state = 'idle'; e.yaw = Math.PI / 2 - 0.5;
    for (let i = 0; i < 3; i++) g.step(1 / 60);
    return g.drawCalls;
  });
  console.log(style, 'closeup draws', d);
  await page.screenshot({ path: `${out}/closeup-${style}.png`, timeout: 90000 });
}
await browser.close();
