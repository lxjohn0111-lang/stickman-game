// The upload zips, in the condition a portal actually serves them: extracted,
// served over HTTP from one origin, embedded in an iframe on another origin.
// That is how CrazyGames and Poki run a game, and it is the setup in which the
// portal was showing "The game could not be loaded": a game that only works
// from file:// or same-origin would pass every other suite and still fail here.
//
// Each zip is checked twice, because both happen on a portal: with the SDK
// script reachable (a stand-in is served in its place) and with it blocked.
// A blocked SDK must not stop the game — the player still gets to play.
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'module';
import { root } from './harness.mjs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }

const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

// Stand-ins with each portal's interface, recording what the game calls.
const SDK_STUB = {
  crazygames: `window.__calls=[];const r=(n)=>(...a)=>{window.__calls.push(n);return Promise.resolve();};
    window.CrazyGames={SDK:{environment:'crazygames',init:r('init'),
      game:{loadingStart:r('loadingStart'),loadingStop:r('loadingStop'),gameplayStart:r('gameplayStart'),gameplayStop:r('gameplayStop'),happytime:r('happytime'),settings:{muteAudio:false},addSettingsChangeListener(){}},
      data:{_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=v;},removeItem(k){delete this._d[k];}},
      ad:{requestAd(){}}}};`,
  poki: `window.__calls=[];const r=(n)=>(...a)=>{window.__calls.push(n);return Promise.resolve();};
    window.PokiSDK={init:r('init'),gameLoadingStart:r('gameLoadingStart'),gameLoadingFinished:r('gameLoadingFinished'),
      gameplayStart:r('gameplayStart'),gameplayStop:r('gameplayStop'),happyTime:r('happyTime'),captureError:r('captureError'),
      commercialBreak:r('commercialBreak'),rewardedBreak:r('rewardedBreak'),getDeviceInfo:()=>({type:'desktop'})};`,
};
const SDK_HOST = { crazygames: '**/crazygames-sdk-v3.js', poki: '**/poki-sdk.js' };

const types = { '.html': 'text/html', '.js': 'text/javascript' };
// A file server for the extracted game, and a second origin that frames it.
// Two ports, so the iframe is cross-origin exactly as on a portal.
function serve(dir) {
  const game = http.createServer((req, res) => {
    const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    try {
      const buf = fs.readFileSync(dir + p);
      res.writeHead(200, { 'content-type': types[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' });
      res.end(buf);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  }).listen(0);
  const port = game.address().port;
  const portal = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>portal</title><style>html,body{margin:0;height:100%;background:#222}iframe{border:0;width:100%;height:100%}</style>`
      + `<iframe src="http://127.0.0.1:${port}/?nolock" allow="autoplay; fullscreen; pointer-lock"></iframe>`);
  }).listen(0);
  return { game, portal, url: `http://127.0.0.1:${portal.address().port}/` };
}

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

// Returns what the game in the iframe reached, and anything that went wrong.
async function runFramed(dir, portal, sdk) {
  const srv = serve(dir);
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  if (sdk) await page.route(SDK_HOST[portal], (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB[portal] }));
  else await page.route(SDK_HOST[portal], (r) => r.abort());
  await page.goto(srv.url);
  const frame = page.frames().find((f) => f.url().includes('nolock'));
  let reached = 'never started';
  try {
    await frame.waitForFunction(() => window.WT && WT.game && WT.game.state === 'menu', null, { timeout: 180000 });
    reached = 'menu';
  } catch (e) { /* reported below */ }
  const v = reached === 'menu' ? await frame.evaluate(() => ({
    plat: WT.platform.name,
    boot: (() => { const m = document.getElementById('boot-msg'); return m && !m.classList.contains('hidden') ? m.textContent : ''; })(),
  })) : {};
  // and it has to be playable, not just reach the menu
  let played = null;
  if (reached === 'menu') {
    await frame.evaluate(() => WT.game.startLevel(1));
    await frame.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 180000 }).catch(() => {});
    await frame.$eval('#lc-start', (el) => el.click()).catch(() => {});
    await frame.waitForFunction(() => WT.game.state === 'playing', null, { timeout: 60000 }).catch(() => {});
    played = await frame.evaluate(() => ({ state: WT.game.state, enemies: WT.game.enemies.list.filter((e) => e.alive).length }));
  }
  await page.close();
  srv.game.close(); srv.portal.close();
  return { reached, ...v, played, errs };
}

for (const portal of ['crazygames', 'poki']) {
  for (const kind of ['', '-onefile']) {
    const zip = `${root}/one-way-out-${portal}${kind}.zip`;
    const dir = `${root}/test-output/portal-${portal}${kind}`;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
    check(`${portal}${kind}: the zip has index.html at its root, no wrapping folder`,
      names.includes('index.html') && !names.some((n) => n.includes('/')), names);
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);

    const on = await runFramed(dir, portal, true);
    check(`${portal}${kind}: served over http in a cross-origin iframe, the game starts and plays`,
      on.reached === 'menu' && on.boot === '' && on.plat === portal && on.played && on.played.state === 'playing' && on.played.enemies > 0 && on.errs.length === 0,
      { reached: on.reached, plat: on.plat, boot: on.boot, played: on.played, errs: on.errs.slice(0, 3) });

    const off = await runFramed(dir, portal, false);
    check(`${portal}${kind}: with the SDK script blocked, the game still starts and plays`,
      off.reached === 'menu' && off.boot === '' && off.played && off.played.state === 'playing' && off.errs.length === 0,
      { reached: off.reached, plat: off.plat, boot: off.boot, played: off.played, errs: off.errs.slice(0, 3) });
  }
}

await browser.close();
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all portal checks passed');
process.exit(fails.length ? 1 : 0);
