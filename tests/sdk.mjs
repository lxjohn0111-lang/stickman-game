// CrazyGames SDK v3 integration, against a stand-in SDK that records every
// call (the real SDK only runs on crazygames.com / localhost with network).
// Checks: init before the save is read, progress read from and written to
// the data module (not localStorage), loadingStart/Stop around boot and level
// loads, gameplayStart/Stop following play/pause/death, happytime on level
// complete, the muteAudio setting and its change listener, no custom
// fullscreen button on the portal, and that a missing, disabled or hanging
// SDK still lets the game run on localStorage.
import { launch } from './harness.mjs';

const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); if (!ok) fails.push(name); };

// The stand-in: same surface as window.CrazyGames.SDK (v3).
const mockSdk = ({ env = 'crazygames', hang = false, muted = false, data = {} } = {}) => `
(() => {
  const calls = [];
  const store = new Map(Object.entries(${JSON.stringify(data)}));
  const listeners = [];
  const settings = { muteAudio: ${muted}, disableChat: false };
  window.__cg = { calls, store, listeners, settings, initAt: 0 };
  window.CrazyGames = { SDK: {
    environment: ${JSON.stringify(env)},
    init: () => { calls.push('init'); window.__cg.initAt = performance.now(); return ${hang} ? new Promise(() => {}) : new Promise((r) => setTimeout(r, 50)); },
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
      settings,
      addSettingsChangeListener: (f) => listeners.push(f),
      removeSettingsChangeListener: () => {},
    },
    data: {
      getItem: (k) => { calls.push('getItem:' + k); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { calls.push('setItem:' + k); store.set(k, String(v)); },
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    ad: { requestAd: () => {} },
    user: {},
  } };
})();`;

// ---- 1. on CrazyGames with a saved profile in the player's account
{
  const saved = { 'onewayout.save.v1': JSON.stringify({ v: 2, unlocked: 3, last: 3, levels: { 1: { completed: true, bestScore: 4000, bestTime: 300, stars: 3, secrets: [true, false, false], noDamage: false }, 2: { completed: true, bestScore: 3000, bestTime: 400, stars: 2, secrets: [false, false, false], noDamage: false } } }),
    'onewayout.settings.v1': JSON.stringify({ quality: 'medium', master: 0.6 }) };
  const { browser, page, logs } = await launch({ query: 'nolock', init: mockSdk({ data: saved }) });
  const boot = await page.evaluate(() => ({ calls: [...window.__cg.calls], unlocked: WT.progress.unlocked, quality: WT.game.settings.quality, env: WT.platform.env, portal: WT.platform.portal, play: document.getElementById('btn-play').textContent, ls: localStorage.getItem('onewayout.save.v1') }));
  const iInit = boot.calls.indexOf('init'), iRead = boot.calls.indexOf('getItem:onewayout.save.v1');
  check('SDK initialised before the save is read', iInit === 0 && iRead > iInit, boot.calls.slice(0, 6));
  check('progress and settings come from the data module', boot.unlocked === 3 && boot.quality === 'medium' && /Level 3/.test(boot.play) && boot.ls === null, { unlocked: boot.unlocked, quality: boot.quality, play: boot.play });
  check('environment detected as CrazyGames', boot.env === 'crazygames' && boot.portal, { env: boot.env });
  check('loadingStart at boot, loadingStop when the menu is ready', boot.calls.includes('loadingStart') && boot.calls.indexOf('loadingStop') > boot.calls.indexOf('loadingStart'), '');
  // settings: no custom fullscreen on the portal
  await page.$eval('nav.menu-nav button[data-sec=settings]', (el) => el.click());
  const setText = await page.textContent('#menu-panel');
  check('no custom fullscreen button on the portal', !/Fullscreen/.test(setText), '');
  // start a level through the menu: loading events, then gameplay when playing
  await page.evaluate(() => { window.__cg.calls.length = 0; });
  await page.$eval('#btn-play', (el) => el.click());
  await page.waitForFunction(() => WT.game.state === 'ready', null, { timeout: 300000 });
  await page.$eval('#lc-start', (el) => el.click());
  await page.waitForFunction(() => window.__cg.calls.includes('gameplayStart'), null, { timeout: 60000 });
  let c = await page.evaluate(() => [...window.__cg.calls]);
  check('level load: loadingStart, loadingStop, then gameplayStart', c.indexOf('loadingStart') >= 0 && c.indexOf('loadingStop') > c.indexOf('loadingStart') && c.indexOf('gameplayStart') > c.indexOf('loadingStop'), c.filter((x) => !x.startsWith('getItem')));
  check('choosing the level saves "last level" through the data module', c.includes('setItem:onewayout.save.v1'), '');
  // pause -> gameplayStop; resume -> gameplayStart
  await page.evaluate(() => { window.__cg.calls.length = 0; WT.game.pause(); });
  await page.waitForFunction(() => window.__cg.calls.includes('gameplayStop'), null, { timeout: 30000 });
  await page.evaluate(() => WT.game.resume());
  await page.waitForFunction(() => window.__cg.calls.includes('gameplayStart'), null, { timeout: 30000 });
  check('pause stops gameplay, resume starts it again', true, await page.evaluate(() => [...window.__cg.calls]));
  // focus loss (tab hidden / window blur) -> gameplayStop
  await page.evaluate(() => { window.__cg.calls.length = 0; window.dispatchEvent(new Event('blur')); });
  await page.waitForFunction(() => window.__cg.calls.includes('gameplayStop'), null, { timeout: 30000 });
  check('losing focus stops gameplay', (await page.evaluate(() => WT.game.state)) === 'paused', '');
  await page.evaluate(() => WT.game.resume());
  // death -> gameplayStop
  await page.waitForFunction(() => WT.platform._playing, null, { timeout: 30000 });
  await page.evaluate(() => { window.__cg.calls.length = 0; const g = WT.game; g.player.damage(999, g.player.x, g.player.z, 'test'); });
  await page.waitForFunction(() => window.__cg.calls.includes('gameplayStop'), null, { timeout: 30000 });
  check('death stops gameplay', true, '');
  await page.waitForFunction(() => document.querySelector('#death-btns .btn-try'), null, { timeout: 30000 });
  await page.$eval('#death-btns .btn-try', (el) => el.click());
  await page.waitForFunction(() => WT.platform._playing, null, { timeout: 30000 });
  // complete the level -> happytime + the record saved to the account
  await page.evaluate(() => { window.__cg.calls.length = 0; const m = WT.game.mission; m.index = m.objectives.length - 1; m.obj = m.objectives[m.index]; m._complete(); });
  await page.waitForTimeout(300);
  c = await page.evaluate(() => [...window.__cg.calls]);
  const rec = await page.evaluate(() => JSON.parse(window.__cg.store.get('onewayout.save.v1')));
  check('level complete: happytime and gameplayStop', c.includes('happytime') && c.includes('gameplayStop'), c);
  check('level record and unlock written to the data module', rec.unlocked === 4 && rec.levels[3] && rec.levels[3].completed, { unlocked: rec.unlocked, l3: rec.levels[3] });
  check('nothing written to localStorage for progress', (await page.evaluate(() => localStorage.getItem('onewayout.save.v1'))) === null, '');
  // settings changes go to the data module too
  await page.evaluate(() => { WT.game.settings.fov = 88; WT.game.applySettings(); });
  const st = await page.evaluate(() => JSON.parse(window.__cg.store.get('onewayout.settings.v1')));
  check('settings saved through the data module', st.fov === 88, st.fov);
  // the portal's mute setting, changed while running
  const vol0 = await page.evaluate(() => WT.game.audio.volumes.master);
  await page.evaluate(() => { window.__cg.settings.muteAudio = true; for (const f of window.__cg.listeners) f({ muteAudio: true }); });
  const vol1 = await page.evaluate(() => WT.game.audio.volumes.master);
  await page.evaluate(() => { window.__cg.settings.muteAudio = false; for (const f of window.__cg.listeners) f({ muteAudio: false }); });
  const vol2 = await page.evaluate(() => WT.game.audio.volumes.master);
  check('muteAudio silences the game and un-muting restores it', vol0 > 0 && vol1 === 0 && vol2 === vol0, { vol0, vol1, vol2 });
  const errs = logs.filter((l) => l.startsWith('pageerror'));
  check('no page errors (CrazyGames)', errs.length === 0, errs.slice(0, 3));
  await browser.close();
}

// ---- 2. muted from the start
{
  const { browser, page } = await launch({ query: 'nolock', init: mockSdk({ muted: true }) });
  const v = await page.evaluate(() => ({ master: WT.game.audio.volumes.master, muted: WT.platform.muted }));
  check('muteAudio already on at start: silent', v.muted && v.master === 0, v);
  await browser.close();
}

// ---- 3. the SDK hangs on init: the game still starts, on localStorage
{
  const t0 = Date.now();
  const { browser, page } = await launch({ query: 'nolock', init: mockSdk({ hang: true }) });
  const v = await page.evaluate(() => ({ env: WT.platform.env, sdk: !!WT.platform.sdk, state: WT.game.state }));
  check('hanging SDK: game starts without it after the timeout', v.state === 'menu' && !v.sdk, { ...v, secs: Math.round((Date.now() - t0) / 1000) });
  await page.evaluate(() => { WT.progress.unlocked = 2; WT.game.startLevel(1); });
  await page.waitForTimeout(200);
  check('hanging SDK: progress saved to localStorage', (await page.evaluate(() => JSON.parse(localStorage.getItem('onewayout.save.v1') || '{}').last)) === 1, '');
  await browser.close();
}

// ---- 4. SDK disabled (another site) and 5. no SDK at all (offline build)
for (const [name, init] of [['disabled SDK', mockSdk({ env: 'disabled' })], ['no SDK', null]]) {
  const { browser, page, logs } = await launch({ query: 'nolock', init });
  const v = await page.evaluate(() => ({ sdk: !!WT.platform.sdk, portal: WT.platform.portal, state: WT.game.state, calls: window.__cg ? window.__cg.calls.filter((c) => c !== 'init') : [] }));
  await page.$eval('nav.menu-nav button[data-sec=settings]', (el) => el.click());
  const fs = /Fullscreen/.test(await page.textContent('#menu-panel'));
  check(`${name}: runs on localStorage, no SDK calls, fullscreen offered`, !v.sdk && !v.portal && v.state === 'menu' && v.calls.length === 0 && fs, v);
  const errs = logs.filter((l) => l.startsWith('pageerror'));
  check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 3));
  await browser.close();
}

// ---- 6. old "Way Through" saves are carried over once (localStorage builds)
{
  const init = `localStorage.setItem('waythrough.save.v2', JSON.stringify({ v: 2, unlocked: 5, last: 5, levels: {} })); localStorage.setItem('waythrough.style', 'neo');`;
  const { browser, page } = await launch({ query: 'nolock', init: `if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); ${init} }` });
  const v = await page.evaluate(() => ({ unlocked: WT.progress.unlocked, style: WT.game.style, old: localStorage.getItem('waythrough.save.v2'), neu: !!localStorage.getItem('onewayout.save.v1') }));
  check('old Way Through progress and style migrate to the new keys', v.unlocked === 5 && v.style === 'neo' && v.old === null && v.neu, v);
  await browser.close();
}

// ---- 7. the actual upload build: SDK tag in <head>, game.js next to index.html
{
  const { browser, page, logs } = await launch({ page: 'crazygames upload/game/index.html', query: 'nolock', init: mockSdk({}) });
  const v = await page.evaluate(() => ({ env: WT.platform.env, state: WT.game.state, sdkTag: !!document.querySelector('head script[src*="sdk.crazygames.com/crazygames-sdk-v3.js"]'), calls: window.__cg.calls.slice(0, 3) }));
  check('upload build: loads game.js, SDK tag in head, uses the SDK', v.state === 'menu' && v.env === 'crazygames' && v.sdkTag && v.calls[0] === 'init', v);
  const errs = logs.filter((l) => l.startsWith('pageerror'));
  check('upload build: no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
}

console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'all SDK checks passed');
process.exit(fails.length ? 1 : 0);
