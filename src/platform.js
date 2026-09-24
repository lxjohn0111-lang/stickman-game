// Platform layer. On CrazyGames the page carries the CrazyGames HTML5 SDK v3
// (its script tag is only added to the CrazyGames build); everywhere else the
// SDK is absent and the game uses plain localStorage.
//
//  * store.get/set/remove: progress and settings. With the SDK they go through
//    its data module, which keeps them in the player's CrazyGames account
//    (synced across devices) or, for guests, in the portal's local storage.
//  * loading(on) / gameplay(on): the SDK's loadingStart/Stop and
//    gameplayStart/Stop, edge-triggered so they can be called every frame.
//  * happytime(): celebratory moments (level and campaign complete).
//  * muted: the portal's "mute audio" setting, which overrides the game's own
//    volume settings; onSettings is called when it changes.
//
// Every SDK call is guarded: a broken or blocked SDK must never stop the game.

// Keys from before the game was renamed; read once if the new key is empty.
const LEGACY = {
  'onewayout.save.v1': 'waythrough.save.v2',
  'onewayout.settings.v1': 'waythrough.settings.v1',
  'onewayout.style': 'waythrough.style',
};

function local() {
  try { return window.localStorage; } catch (e) { return null; }
}

export const platform = {
  sdk: null,
  env: 'none', // 'none' (no SDK script) | 'crazygames' | 'local' | 'disabled'
  portal: false, // running on crazygames.com
  muted: false,
  onSettings: null,
  _loading: false,
  _playing: false,

  async init(timeoutMs = 5000) {
    const cg = window.CrazyGames && window.CrazyGames.SDK;
    if (!cg) return this;
    try {
      const done = await Promise.race([
        Promise.resolve(cg.init()).then(() => true),
        new Promise((r) => setTimeout(() => r(false), timeoutMs)),
      ]);
      this.env = cg.environment || (done ? 'crazygames' : 'disabled');
      if (done && (this.env === 'crazygames' || this.env === 'local')) {
        this.sdk = cg;
        this.portal = this.env === 'crazygames';
        this._readSettings();
        try {
          cg.game.addSettingsChangeListener(() => { this._readSettings(); if (this.onSettings) this.onSettings(); });
        } catch (e) { /* older SDK */ }
      }
    } catch (e) {
      console.warn('CrazyGames SDK unavailable:', e);
      this.env = 'disabled';
      this.sdk = null;
    }
    return this;
  },

  _readSettings() {
    try { this.muted = !!(this.sdk.game.settings && this.sdk.game.settings.muteAudio); } catch (e) { this.muted = false; }
  },

  _call(fn) {
    if (!this.sdk) return;
    try { fn(this.sdk); } catch (e) { /* never let the SDK break the game */ }
  },

  loading(on) {
    if (on === this._loading) return;
    this._loading = on;
    this._call((s) => (on ? s.game.loadingStart() : s.game.loadingStop()));
  },

  gameplay(on) {
    if (on === this._playing) return;
    this._playing = on;
    this._call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
  },

  happytime() {
    this._call((s) => s.game.happytime());
  },
};

export const store = {
  get(key) {
    if (platform.sdk) {
      try {
        const v = platform.sdk.data.getItem(key);
        if (v !== null && v !== undefined) return v;
      } catch (e) { /* fall through */ }
      return null;
    }
    const ls = local();
    if (!ls) return null;
    try {
      let v = ls.getItem(key);
      if (v === null && LEGACY[key]) {
        v = ls.getItem(LEGACY[key]);
        if (v !== null) { ls.setItem(key, v); ls.removeItem(LEGACY[key]); }
      }
      return v;
    } catch (e) { return null; }
  },

  set(key, value) {
    if (platform.sdk) {
      try { platform.sdk.data.setItem(key, value); return true; } catch (e) { console.warn('save failed', e); return false; }
    }
    const ls = local();
    try { if (ls) { ls.setItem(key, value); return true; } } catch (e) { /* full or blocked */ }
    return false;
  },

  remove(key) {
    if (platform.sdk) { try { platform.sdk.data.removeItem(key); } catch (e) { /* ignore */ } return; }
    const ls = local();
    try { if (ls) ls.removeItem(key); } catch (e) { /* ignore */ }
  },
};

// Level previews are a regenerable image cache: always plain localStorage,
// never the (size-limited) data module. Old-name entries are dropped.
export const cache = {
  get(key) { const ls = local(); try { return ls ? ls.getItem(key) : null; } catch (e) { return null; } },
  set(key, value) { const ls = local(); try { if (ls) ls.setItem(key, value); } catch (e) { /* full */ } },
  dropLegacy(prefix) {
    const ls = local();
    if (!ls) return;
    try {
      const old = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix)) old.push(k); }
      for (const k of old) ls.removeItem(k);
    } catch (e) { /* ignore */ }
  },
};
