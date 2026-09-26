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
//  * ads: none are requested. To add them, use SDK.ad.requestAd here and set
//    `ads: true` so the game asks for a break before each level.

export const SDK_SCRIPT = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export const crazygames = {
  id: 'crazygames',
  sdk: null,
  env: 'none',
  portal: false,
  muted: false,
  ads: false,
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

  // No ads on CrazyGames (see the note above).
  adBreak() { return Promise.resolve(false); },

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
