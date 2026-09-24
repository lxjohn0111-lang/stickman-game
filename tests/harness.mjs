// Shared Playwright helpers for driving the game in Chromium.
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A phone in landscape: touch screen, coarse pointer, mobile viewport.
export const PHONE = { width: 844, height: 390, mobile: true };

export async function launch({ width = 1280, height = 720, query = 'nolock', profile = null, mobile = false, page: html = 'index.html', init = null } = {}) {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
  const ctx = { viewport: { width, height } };
  if (mobile) Object.assign(ctx, { isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' });
  let browser, page;
  if (profile) {
    // persistent profile: localStorage survives closing and relaunching
    browser = await pw.chromium.launchPersistentContext(profile, { args, ...ctx });
    page = browser.pages()[0] || await browser.newPage();
  } else {
    browser = await pw.chromium.launch({ args });
    page = await (await browser.newContext(ctx)).newPage();
  }
  if (init) await page.addInitScript(init);
  const logs = [];
  page.on('console', (m) => { logs.push(`${m.type()}: ${m.text()}`); if (m.type() === 'error') console.log('console.error:', m.text()); });
  page.on('pageerror', (e) => { logs.push('pageerror: ' + e.message); console.log('pageerror:', e.message); });
  await page.goto(`file://${encodeURI(`${root}/${html}`)}?${query}`);
  await page.waitForFunction(() => window.WT && window.WT.game && window.WT.game.state === 'menu', null, { timeout: 120000 });
  return { browser, page, logs };
}

// Multi-touch through the DevTools protocol. `points` is the full list of
// fingers currently down: [{id, x, y}].
export async function touchScreen(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
  return {
    start: (points) => send('touchStart', points),
    move: (points) => send('touchMove', points),
    end: (points = []) => send('touchEnd', points),
    // one finger dragged from a to b in n steps
    async drag(id, a, b, n = 8, others = []) {
      await send('touchStart', [...others, { id, ...a }]);
      for (let i = 1; i <= n; i++) await send('touchMove', [...others, { id, x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }]);
    },
  };
}
