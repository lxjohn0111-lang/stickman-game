// Pointer-lock edge cases: lock on Play, unlock (Esc) -> pause, refused
// re-lock -> "click to resume", and no pointer lock at all (sandboxed iframe)
// -> plain mouse-move look.
import fs from 'node:fs';
import { launch, root } from './harness.mjs';
const { browser, page } = await launch({ query: 'x=1' });
const seen = [];
const st0 = () => page.evaluate(() => { const g = WT.game; return { state: g.state, locked: g.input.locked, fallback: g.input.fallback, clicklock: !document.getElementById('clicklock').classList.contains('hidden'), pause: !document.getElementById('pause').classList.contains('hidden'), yaw: +g.player.yaw.toFixed(3) }; });
const st = async () => { const v = await st0(); seen.push(v); return v; };
await page.click('nav.menu-nav button[data-go=play]');
await page.waitForTimeout(300);
console.log('1 play      ', JSON.stringify(await st()));
await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: -30 })));
await page.waitForFunction(() => Math.abs(WT.game.player.yaw + Math.PI / 2) > 0.01, null, { timeout: 10000 }).catch(() => {});
console.log('2 locked look', JSON.stringify(await st()));
await page.evaluate(() => document.exitPointerLock()); // what Esc does
await page.waitForTimeout(300);
console.log('3 unlocked  ', JSON.stringify(await st()));
// browser refuses the re-lock (as Chrome does right after Esc)
await page.evaluate(() => {
  const c = document.getElementById('game');
  c._orig = c.requestPointerLock;
  c.requestPointerLock = () => Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError'));
});
await page.click('#pause nav button[data-go=resume]');
await page.waitForTimeout(300);
console.log('4 refused   ', JSON.stringify(await st()));
await page.evaluate(() => { const c = document.getElementById('game'); c.requestPointerLock = c._orig; });
await page.click('#clicklock');
await page.waitForTimeout(400);
console.log('5 re-locked ', JSON.stringify(await st()));
await browser.close();

// sandboxed iframe without allow-pointer-lock
fs.writeFileSync(`${root}/test-output/iframe.html`, `<!doctype html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-same-origin" src="../index.html" style="width:1280px;height:720px;border:0"></iframe></body>`);
const { chromium } = (await import('module')).createRequire('/opt/node22/lib/node_modules/')('playwright');
const b2 = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p2 = await b2.newPage({ viewport: { width: 1280, height: 720 } });
await p2.goto(`file://${root}/test-output/iframe.html`);
const fr = await (await p2.waitForSelector('#f')).contentFrame();
await fr.waitForFunction(() => window.WT && WT.game && WT.game.state === 'menu', null, { timeout: 120000 });
await fr.click('nav.menu-nav button[data-go=play]');
await p2.waitForTimeout(800);
const before = await fr.evaluate(() => WT.game.player.yaw);
await p2.mouse.move(600, 360); await p2.mouse.move(700, 360, { steps: 8 });
await p2.waitForTimeout(400);
const ifr = await fr.evaluate((b) => ({ state: WT.game.state, locked: WT.game.input.locked, fallback: WT.game.input.fallback, lookedAround: Math.abs(WT.game.player.yaw - b) > 0.01, bodyClass: document.body.className }), before);
console.log('6 iframe    ', JSON.stringify(ifr));
await b2.close();
const [s1, s2, s3, s4, s5] = seen;
const ok = s1.state === 'playing' && s1.locked && s2.yaw !== s1.yaw && s3.state === 'paused' && s3.pause && s4.state === 'lockwait' && s4.clicklock && s5.state === 'playing' && s5.locked && ifr.fallback && ifr.lookedAround && ifr.state === 'playing';
console.log(ok ? 'pointer lock: all checks passed' : 'FAIL: pointer lock flow ' + JSON.stringify(seen));
process.exit(ok ? 0 : 1);
