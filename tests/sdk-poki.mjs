// Poki SDK integration, against a stand-in SDK that records every call (the
// real SDK only runs inside Poki's frame). Checks: init before the save is
// read, gameLoadingStart/Finished for the game's own load only, gameplayStart/
// Stop following play, pause, focus loss and death, happyTime on a level win,
// commercialBreak before a level starts with the game frozen and silent for
// its duration, progress in localStorage (Poki has no cloud save), and that a
// missing, disabled, hanging or broken SDK still lets the game run.
// The CrazyGames side has its own suite, tests/sdk-crazygames.mjs; neither
// portal's adapter may affect the other, which check 7 below pins down.
import { launch } from './harness.mjs';

const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

// The stand-in: the surface of window.PokiSDK. `adMs` is how long a
// commercial break takes; `adFail` rejects it; `hang` never resolves init.
const mockSdk = ({ hang = false, adMs = 120, adFail = false, noAds = false } = {}) => `
(() => {
  const calls = [];
  window.__poki = { calls, ads: 0, debug: false };
  const sdk = {
    init: () => { calls.push('init'); return ${hang} ? new Promise(() => {}) : new Promise((r) => setTimeout(r, 40)); },
    setDebug: (v) => { window.__poki.debug = v; calls.push('setDebug'); },
    gameLoadingStart: () => calls.push('gameLoadingStart'),
    gameLoadingFinished: () => calls.push('gameLoadingFinished'),
    gameplayStart: () => calls.push('gameplayStart'),
    gameplayStop: () => calls.push('gameplayStop'),
    happyTime: (v) => calls.push('happyTime:' + v),
    captureError: () => calls.push('captureError'),
    getDeviceInfo: () => ({ type: 'desktop' }),
    rewardedBreak: () => Promise.resolve(true),
  };
  ${noAds ? '' : `sdk.commercialBreak = () => {
    calls.push('commercialBreak');
    window.__poki.ads++;
    window.__poki.adRunning = true;
    return new Promise((res, rej) => setTimeout(() => { window.__poki.adRunning = false; ${adFail ? 'rej(new Error("ad failed"))' : 'res()'}; }, ${adMs}));
  };`}
  window.PokiSDK = sdk;
})();`;

// ---- 1. on Poki: boot, storage, loading and gameplay events
{
  const saved = `localStorage.setItem('onewayout.save.v1', JSON.stringify({ v: 2, unlocked: 3, last: 3, levels: { 1: { completed: true, bestScore: 4000, bestTime: 300, stars: 3, secrets: [true, false, false], noDamage: false }, 2: { completed: true, bestScore: 3000, bestTime: 400, stars: 2, secrets: [false, false, false], noDamage: false } } }));`;
  const { browser, page, logs } = await launch({ query: 'nolock', init: mockSdk({}) + saved });
  const boot = await page.evaluate(() => ({ calls: [...window.__poki.calls], name: WT.platform.name, env: WT.platform.env, ads: WT.platform.ads, unlocked: WT.progress.unlocked, play: document.getElementById('btn-play').textContent, debug: window.__poki.debug }));
  check('Poki SDK detected and initialised first', boot.name === 'poki' && boot.calls.indexOf('init') >= 0 && boot.calls.indexOf('gameLoadingStart') > boot.calls.indexOf('init'), boot.calls.slice(0, 5));
  check('gameLoadingStart at boot, gameLoadingFinished when the menu is ready', boot.calls.includes('gameLoadingStart') && boot.calls.indexOf('gameLoadingFinished') > boot.calls.indexOf('gameLoadingStart'), boot.calls);
  check('progress comes from localStorage (Poki has no cloud save)', boot.unlocked === 3 && /Level 3/.test(boot.play), { unlocked: boot.unlocked, play: boot.play });
  check('ads are on for Poki', boot.ads === true, boot.ads);
  check('debug mode on outside Poki frame', boot.debug === true, boot.debug);

  // a level start: one commercial break, the game frozen and silent while it runs
  await page.evaluate(() => { WT.game.manual = true; window.__poki.calls.length = 0; });
  const started = page.evaluate(() => WT.game.startLevel(1));
  await page.waitForFunction(() => WT.game.adPause === true, null, { timeout: 300000 });
  const during = await page.evaluate(() => ({ muted: WT.platform.muted, master: WT.game.audio.volumes.master, state: WT.game.state, running: window.__poki.adRunning, calls: [...window.__poki.calls] }));
  check('a commercial break runs before the level, game frozen and silent', during.running === true && during.muted === true && during.master === 0 && during.calls.includes('commercialBreak'), during);
  check('the level load is not reported as a game load', !during.calls.includes('gameLoadingStart'), during.calls);
  await started;
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  const after = await page.evaluate(() => ({ adPause: WT.game.adPause, muted: WT.platform.muted, master: WT.game.audio.volumes.master, ads: window.__poki.ads, startEnabled: !document.getElementById('lc-start').disabled }));
  check('after the ad: sound back, game runs, Start ready', after.adPause === false && after.muted === false && after.master > 0 && after.ads === 1 && after.startEnabled, after);

  // playing -> gameplayStart; pause, focus loss and death -> gameplayStop
  await page.evaluate(() => { WT.game.manual = false; window.__poki.calls.length = 0; });
  await page.$eval('#lc-start', (el) => el.click());
  await page.waitForFunction(() => window.__poki.calls.includes('gameplayStart'), null, { timeout: 60000 });
  check('gameplayStart when play begins', true, '');
  await page.evaluate(() => { window.__poki.calls.length = 0; WT.game.pause(); });
  await page.waitForFunction(() => window.__poki.calls.includes('gameplayStop'), null, { timeout: 30000 });
  check('gameplayStop on pause', true, '');
  await page.evaluate(() => WT.game.resume());
  await page.waitForFunction(() => window.__poki.calls.includes('gameplayStart'), null, { timeout: 30000 });
  await page.evaluate(() => { window.__poki.calls.length = 0; window.dispatchEvent(new Event('blur')); });
  await page.waitForFunction(() => window.__poki.calls.includes('gameplayStop'), null, { timeout: 30000 });
  check('gameplayStop on focus loss', true, '');
  await page.evaluate(() => WT.game.resume());
  await page.waitForFunction(() => WT.platform._playing, null, { timeout: 30000 });
  await page.evaluate(() => { window.__poki.calls.length = 0; const g = WT.game; g.player.damage(999, g.player.x, g.player.z, 'test'); });
  await page.waitForFunction(() => window.__poki.calls.includes('gameplayStop'), null, { timeout: 30000 });
  check('gameplayStop on death', true, '');
  await page.waitForFunction(() => document.querySelector('#death-btns .btn-try'), null, { timeout: 30000 });
  await page.$eval('#death-btns .btn-try', (el) => el.click());
  await page.waitForFunction(() => WT.platform._playing, null, { timeout: 30000 });
  check('Restart Checkpoint keeps playing without an ad (controls stay captured)', (await page.evaluate(() => window.__poki.ads)) === 1, '');

  // level complete -> happyTime, and the record saved to localStorage
  await page.evaluate(() => { window.__poki.calls.length = 0; const m = WT.game.mission; m.index = m.objectives.length - 1; m.obj = m.objectives[m.index]; m._complete(); });
  let doneCalls = null;
  try {
    await page.waitForFunction(() => window.__poki.calls.some((c) => c.startsWith('happyTime')) && window.__poki.calls.includes('gameplayStop'), null, { timeout: 30000 });
  } catch (e) { doneCalls = await page.evaluate(() => ({ calls: [...window.__poki.calls], state: WT.game.state, playing: WT.platform._playing })); }
  const done = await page.evaluate(() => ({ calls: [...window.__poki.calls], save: JSON.parse(localStorage.getItem('onewayout.save.v1')) }));
  check('level complete: happyTime and gameplayStop', done.calls.some((c) => c.startsWith('happyTime')) && done.calls.includes('gameplayStop'), doneCalls || done.calls);
  check('the record is saved to localStorage', done.save.levels[1] && done.save.levels[1].completed, { l1: done.save.levels[1] });
  const errs = logs.filter((l) => l.startsWith('pageerror'));
  check('no page errors (Poki)', errs.length === 0, errs.slice(0, 3));
  await browser.close();
}

// ---- 2. a failing ad must not strand the player
{
  const { browser, page, logs } = await launch({ query: 'nolock', init: mockSdk({ adFail: true }) });
  await page.evaluate(() => { WT.game.manual = true; });
  await page.evaluate(() => WT.game.startLevel(1));
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  const v = await page.evaluate(() => ({ adPause: WT.game.adPause, muted: WT.platform.muted, master: WT.game.audio.volumes.master }));
  check('a rejected commercial break: game continues, sound back', v.adPause === false && v.muted === false && v.master > 0, v);
  check('no page errors (failing ad)', logs.filter((l) => l.startsWith('pageerror')).length === 0, '');
  await browser.close();
}

// ---- 3. an SDK without commercialBreak (older or trimmed) still plays
{
  const { browser, page } = await launch({ query: 'nolock', init: mockSdk({ noAds: true }) });
  await page.evaluate(() => { WT.game.manual = true; });
  await page.evaluate(() => WT.game.startLevel(1));
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  const v = await page.evaluate(() => ({ name: WT.platform.name, adPause: WT.game.adPause, state: WT.game.state }));
  check('SDK without commercialBreak: level still starts', v.name === 'poki' && v.adPause === false && v.state === 'ready', v);
  await browser.close();
}

// ---- 4. the SDK hangs on init: the game starts without it
{
  const { browser, page } = await launch({ query: 'nolock', init: mockSdk({ hang: true }) });
  const v = await page.evaluate(() => ({ name: WT.platform.name, env: WT.platform.env, ads: WT.platform.ads, state: WT.game.state }));
  check('hanging SDK: game starts without it, no ads', v.state === 'menu' && v.name === 'none' && v.ads === false, v);
  await page.evaluate(() => { WT.progress.unlocked = 2; WT.game.startLevel(1); });
  await page.waitForTimeout(200);
  check('hanging SDK: progress saved to localStorage', (await page.evaluate(() => JSON.parse(localStorage.getItem('onewayout.save.v1') || '{}').last)) === 1, '');
  await browser.close();
}

// ---- 5. no SDK at all (the offline build)
{
  const { browser, page, logs } = await launch({ query: 'nolock' });
  const v = await page.evaluate(() => ({ name: WT.platform.name, ads: WT.platform.ads, state: WT.game.state }));
  await page.$eval('nav.menu-nav button[data-sec=settings]', (el) => el.click());
  const fs = /Fullscreen/.test(await page.textContent('#menu-panel'));
  check('no SDK: runs on localStorage, no ads, fullscreen offered', v.name === 'none' && !v.ads && v.state === 'menu' && fs, v);
  check('no SDK: no page errors', logs.filter((l) => l.startsWith('pageerror')).length === 0, '');
  await browser.close();
}

// ---- 6. the actual upload build: SDK tag in <head>, game.js beside it
{
  const { browser, page, logs } = await launch({ page: 'poki upload/game/index.html', query: 'nolock', init: mockSdk({}) });
  const v = await page.evaluate(() => ({ name: WT.platform.name, state: WT.game.state, tag: !!document.querySelector('head script[src*="game-cdn.poki.com/scripts/v2/poki-sdk.js"]'), cg: !!document.querySelector('script[src*="crazygames"]'), calls: window.__poki.calls.slice(0, 2) }));
  check('upload build: loads game.js, Poki tag in head, no CrazyGames tag', v.state === 'menu' && v.name === 'poki' && v.tag && !v.cg && v.calls.includes('init'), v);
  check('upload build: no page errors', logs.filter((l) => l.startsWith('pageerror')).length === 0, '');
  await browser.close();
}

// ---- 7. both SDKs on one page: the forced choice decides, the other is untouched
{
  const cg = `(() => { window.__cg = []; const rec = (n) => () => { window.__cg.push(n); return Promise.resolve(); };
    window.CrazyGames = { SDK: { environment: 'crazygames', init: rec('init'),
      game: { loadingStart: rec('loadingStart'), loadingStop: rec('loadingStop'), gameplayStart: rec('gameplayStart'), gameplayStop: rec('gameplayStop'), happytime: rec('happytime'), settings: { muteAudio: false }, addSettingsChangeListener: () => {} },
      data: { getItem: () => null, setItem: () => {}, removeItem: () => {} } } }; })();`;
  const { browser, page } = await launch({ query: 'nolock&platform=poki', init: mockSdk({}) + cg });
  const v = await page.evaluate(() => ({ name: WT.platform.name, poki: window.__poki.calls.includes('init'), cg: window.__cg }));
  check('?platform=poki: Poki used, CrazyGames SDK never called', v.name === 'poki' && v.poki && v.cg.length === 0, v);
  await browser.close();
  const r2 = await launch({ query: 'nolock&platform=crazygames', init: mockSdk({}) + cg });
  const v2 = await r2.page.evaluate(() => ({ name: WT.platform.name, ads: WT.platform.ads, cg: window.__cg.includes('init'), poki: window.__poki.calls.includes('init') }));
  check('?platform=crazygames: CrazyGames used, Poki SDK never called', v2.name === 'crazygames' && v2.cg && !v2.poki && v2.ads === false, v2);
  await r2.browser.close();
}

console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all Poki checks passed');
process.exit(fails.length ? 1 : 0);
