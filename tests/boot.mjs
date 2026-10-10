// The page's boot watchdog, against the real portal build. A game file that
// never arrives has to say so; a game file that is merely slow must not,
// because the game does start. Run from the CrazyGames build, whose wording
// is the portal one; the Poki build is generated the same way.
//
// The last check is the one-file build, which has no game.js beside it: it has
// to reach the menu without requesting a second file, so an upload that loses
// game.js cannot break it.
import fs from 'node:fs';
import { createRequire } from 'module';
import { root } from './harness.mjs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }

const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

const dir = `${root}/test-output/boot-build`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(`${dir}/missing`, { recursive: true });
fs.mkdirSync(`${dir}/slow`, { recursive: true });
const src = `${root}/crazygames upload/game`;
fs.copyFileSync(`${src}/index.html`, `${dir}/missing/index.html`);
fs.copyFileSync(`${src}/index.html`, `${dir}/slow/index.html`);
fs.copyFileSync(`${src}/game.js`, `${dir}/slow/game.js`);

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const look = async (mode, delayMs) => {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/crazygames-sdk-v3.js', (r) => r.abort()); // not reachable from here
  if (delayMs) await page.route('**/game.js', async (r) => { await new Promise((x) => setTimeout(x, delayMs)); r.continue(); });
  await page.goto(`file://${dir}/${mode}/index.html`);
  await page.waitForTimeout(delayMs ? delayMs + 6000 : 10000);
  const v = await page.evaluate(() => {
    const m = document.getElementById('boot-msg');
    return { msg: m.classList.contains('hidden') ? '' : m.textContent, state: window.WT && WT.game ? WT.game.state : null, errs: 0 };
  });
  v.errs = errs.length;
  await page.close();
  return v;
};

const onefile = async (portal) => {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
  const errs = [];
  const asked = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('request', (r) => { if (r.url() !== page.url() && !/^data:/.test(r.url())) asked.push(r.url()); });
  await page.route('**/*sdk*.js', (r) => r.abort()); // not reachable from here
  await page.goto(`file://${encodeURI(`${root}/${portal} upload/game-onefile/index.html`)}?nolock`);
  await page.waitForFunction(() => window.WT && WT.game && WT.game.state === 'menu', null, { timeout: 120000 });
  const v = await page.evaluate(() => {
    const m = document.getElementById('boot-msg');
    return { msg: m.classList.contains('hidden') ? '' : m.textContent, state: WT.game.state };
  });
  await page.close();
  return { ...v, errs: errs.length, extra: asked.filter((u) => /game\.js$/.test(u)) };
};

const gone = await look('missing', 0);
check('a game file that never arrives says so and names it', /game\.js/.test(gone.msg) && /could not be downloaded/i.test(gone.msg) && gone.state === null, gone);

const slow = await look('slow', 12000);
check('a slow game file shows no error and the game still starts', slow.msg === '' && slow.state === 'menu', slow);

const fast = await look('slow', 0);
check('a normal load shows no error', fast.msg === '' && fast.state === 'menu' && fast.errs === 0, fast);

for (const portal of ['crazygames', 'poki']) {
  const one = await onefile(portal);
  check(`the ${portal} one-file build starts with no game.js beside it`, one.state === 'menu' && one.msg === '' && one.errs === 0 && one.extra.length === 0, one);
}

await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all boot checks passed');
process.exit(fails.length ? 1 : 0);
