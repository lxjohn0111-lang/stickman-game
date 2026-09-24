// Shared Playwright helpers for driving the game in Chromium.
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function launch({ width = 1280, height = 720, query = 'nolock', profile = null } = {}) {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
  let browser, page;
  if (profile) {
    // persistent profile: localStorage survives closing and relaunching
    browser = await pw.chromium.launchPersistentContext(profile, { args, viewport: { width, height } });
    page = browser.pages()[0] || await browser.newPage();
  } else {
    browser = await pw.chromium.launch({ args });
    page = await browser.newPage({ viewport: { width, height } });
  }
  const logs = [];
  page.on('console', (m) => { logs.push(`${m.type()}: ${m.text()}`); if (m.type() === 'error') console.log('console.error:', m.text()); });
  page.on('pageerror', (e) => { logs.push('pageerror: ' + e.message); console.log('pageerror:', e.message); });
  await page.goto(`file://${root}/index.html?${query}`);
  await page.waitForFunction(() => window.WT && window.WT.game && window.WT.game.state === 'menu', null, { timeout: 120000 });
  return { browser, page, logs };
}
