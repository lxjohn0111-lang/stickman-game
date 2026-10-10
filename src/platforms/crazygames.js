// CrazyGames HTML5 SDK v3 adapter. Self-contained: nothing else in the game
// knows about CrazyGames, and changing this file cannot affect the Poki build
// (src/platforms/poki.js) — only the CrazyGames one.
//
// Its script tag is added to the CrazyGames build alone, so `detect()` is what
// tells src/platform.js that this is a CrazyGames page.
//
//  * init: SDK.init(), then the environment ('crazygames' on the portal,
//    'local' while developing, 'disabled' when the SDK is switched off).
//  * store: the data module, which keeps progress in the player's CrazyGames
//    account (synced across their devices) or, for guests, in the portal's own
//    local storage. Without it the game falls back to localStorage.
//  * loading / gameplay: loadingStart/Stop and gameplayStart/Stop.
//  * happytime: celebratory moments.
//  * muted: the portal's "mute audio" setting, which overrides the in-game
//    volume; onSettings() fires when the player changes it.
//  * ads: a midgame ad is offered before a level starts, while the loading
//    card is up, which is the between-levels moment CrazyGames wants them in.
//    The SDK caps them (roughly one every three minutes) and silently ignores
//    a request made too soon, so adBreak() treats a request that does not
//    start playing as "no ad this time" instead of waiting on a callback that
//    will never come. src/platform.js freezes and silences the game while one
//    plays. To turn ads off entirely, set `ads: false` below.
//    Death-card restarts deliberately get no ad: the player's click there has
//    to go straight back to capturing the mouse.

export const SDK_SCRIPT = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export const crazygames = {
  id: 'crazygames',
  sdk: null,
  env: 'none',
  portal: false,
  muted: false,
  ads: true,
  onSettings: null,

  detect() {
    return !!(window.CrazyGames && window.CrazyGames.SDK);
  },

  async init(timeoutMs = 5000) {
    const cg = window.CrazyGames && window.CrazyGames.SDK;
    if (!cg) return false;
    try {
      const done = await Promise.race([
        Promise.resolve(cg.init()).then(() => true),
        new Promise((r) => setTimeout(() => r(false), timeoutMs)),
      ]);
      this.env = cg.environment || (done ? 'crazygames' : 'disabled');
      if (!done || (this.env !== 'crazygames' && this.env !== 'local')) return false;
      this.sdk = cg;
      this.portal = this.env === 'crazygames';
      this._readSettings();
      try {
        cg.game.addSettingsChangeListener(() => { this._readSettings(); if (this.onSettings) this.onSettings(); });
      } catch (e) { /* older SDK */ }
      return true;
    } catch (e) {
      console.warn('CrazyGames SDK unavailable:', e);
      this.env = 'disabled';
      this.sdk = null;
      return false;
    }
  },

  _readSettings() {
    try { this.muted = !!(this.sdk.game.settings && this.sdk.game.settings.muteAudio); } catch (e) { this.muted = false; }
  },

  _call(fn) {
    if (!this.sdk) return;
    try { fn(this.sdk); } catch (e) { /* never let the SDK break the game */ }
  },

  // `boot` is the first load of the game itself; CrazyGames wants the same
  // pair around every load, so both are reported.
  loading(on) {
    this._call((s) => (on ? s.game.loadingStart() : s.game.loadingStop()));
  },

  gameplay(on) {
    this._call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
  },

  happytime() {
    this._call((s) => s.game.happytime());
  },

  // An ad opportunity. Resolves when CrazyGames is done, or right away when it
  // decides not to show one, or when anything goes wrong — the game must never
  // be left frozen behind an ad that is not coming.
  adBreak() {
    const sdk = this.sdk;
    if (!sdk || !sdk.ad || typeof sdk.ad.requestAd !== 'function') return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      let started = false;
      let wait = null;
      let guard = null;
      const done = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(wait);
        clearTimeout(guard);
        resolve(v);
      };
      // Nothing is owed to us: a request made inside the SDK's own cooldown is
      // dropped without a callback. If nothing has started playing by now,
      // there is no ad, so carry on.
      wait = setTimeout(() => { if (!started) done(false); }, 2500);
      try {
        sdk.ad.requestAd('midgame', {
          adStarted: () => {
            started = true;
            clearTimeout(wait);
            // a broken ad must not strand the player on a frozen screen
            guard = setTimeout(() => done(true), 90000);
          },
          adFinished: () => done(true),
          adError: () => done(false),
        });
      } catch (e) {
        done(false);
      }
    });
  },

  // Progress and settings live in the player's account.
  store: {
    available: () => !!crazygames.sdk,
    get(key) {
      try {
        const v = crazygames.sdk.data.getItem(key);
        return v === undefined ? null : v;
      } catch (e) { return null; }
    },
    set(key, value) {
      try { crazygames.sdk.data.setItem(key, value); return true; } catch (e) { console.warn('save failed', e); return false; }
    },
    remove(key) {
      try { crazygames.sdk.data.removeItem(key); } catch (e) { /* ignore */ }
    },
  },
};
