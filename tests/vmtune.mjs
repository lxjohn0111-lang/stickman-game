import { launch, root } from './harness.mjs';
const out = `${root}/test-output`;
const { browser, page } = await launch();
await page.click('nav.menu-nav button[data-go=play]');
const configs = JSON.parse(process.argv[2]);
const style = process.argv[3] || 'classic';
let i = 0;
for (const c of configs) {
  await page.evaluate(([c, style]) => {
    const g = WT.game;
    g.manual = true;
    g.setStyle(style, false);
    const h = WT.HOLD[c.w];
    h.pos.set(...c.pos); h.rot.set(...c.rot);
    if (c.scale) g.vm.guns[c.w].group.scale.setScalar(c.scale);
    if (c.fov) { g.vm.camera.fov = c.fov; g.vm.camera.updateProjectionMatrix(); }
    const p = g.player;
    p.body.x = -29; p.body.z = 3; p.body.y = 5; p.yaw = -Math.PI / 2 + 0.2; p.pitch = -0.05;
    p.setWeapon(c.w, 30, 90, true);
    for (let i = 0; i < 20; i++) g.step(1 / 60);
    if (c.fire) { g.input.left = true; g.input.leftPressed = true; g.step(1 / 60); g.input.left = false; for (let k = 1; k < c.fire; k++) g.step(1/60); }
  }, [c, style]);
  await page.screenshot({ path: `${out}/tune-${i++}.png` });
}
await browser.close();
