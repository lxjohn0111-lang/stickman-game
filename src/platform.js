// Platform layer: the one place the game talks to a portal's SDK.
//
// Two portals are supported, each in its own self-contained adapter:
//   src/platforms/crazygames.js  (CrazyGames HTML5 SDK v3)
//   src/platforms/poki.js        (Poki SDK)
// A build carries the script tag of at most one of them, so whichever SDK is
// on the page wins. `?platform=crazygames|poki|none` forces one for testing.
// Changing one adapter cannot affect the other build.
//
// What the game uses, whichever portal it is on:
//  * store.get/set/remove: progress and settings. CrazyGames keeps them in the
//    player's account through its data module; Poki has no cloud save, so
//    there (and offline) they go to localStorage.
//  * loading(on, boot) / gameplay(on): edge-triggered, so the game can call
//    them every frame. `boot` marks the game's own first load.
//  * happytime(): celebratory moments.
//  * ads / adBreak(): an ad opportunity before the player heads into play.
//    Only Poki asks for one today. The game pauses and is silenced while it
//    runs (the caller checks `adPlaying`).
//  * muted: the portal silences the game (CrazyGames' mute setting, or an ad
//    playing); onSettings() fires when it changes.
//
// Every SDK call is guarded inside the adapters: a broken, blocked or changed
// SDK must never stop the game.
import { crazygames } from './platforms/crazygames.js';
import { poki } from './platforms/poki.js';

const ADAPTERS = { crazygames, poki };

// Keys from before the game was renamed; read once if the new key is empty.
const LEGACY = {
  'onewayout.save.v1': 'waythrough.save.v2',
  'onewayout.settings.v1': 'waythrough.settings.v1',
  'onewayout.style': 'waythrough.style',
};

function local() {
  try { return window.localStorage; } catch (e) { return null; }
}

function param(name) {
  try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
}

export const platform = {
  name: 'none', // 'none' | 'crazygames' | 'poki'
  adapter: null,
  env: 'none', // adapter's own environment ('crazygames', 'local', 'poki', 'disabled')
  portal: false, // running on the portal itself
  muted: false, // portal mute, or an ad is playing
  ads: false,
  adPlaying: false,
  onSettings: null,
  _loading: false,
  _playing: false,
  _portalMuted: false,

  async init(timeoutMs = 5000) {
    const forced = param('platform');
    if (forced === 'none') return this;
    const list = forced && ADAPTERS[forced] ? [ADAPTERS[forced]] : Object.values(ADAPTERS);
    const found = list.find((a) => a.detect());
    if (!found) return this;
    found.onSettings = () => {
      this._portalMuted = !!found.muted;
      if (!this.adPlaying) this.muted = this._portalMuted;
      if (this.onSettings) this.onSettings();
    };
    let ok = false;
    try { ok = await found.init(timeoutMs); } catch (e) { ok = false; }
    this.env = found.env;
    if (!ok) return this;
    this.adapter = found;
    this.name = found.id;
    this.portal = !!found.portal;
    this.ads = !!found.ads;
    this._portalMuted = !!found.muted;
    this.muted = this._portalMuted;
    return this;
  },

  loading(on, boot = false) {
    if (on === this._loading) return;
    this._loading = on;
    if (this.adapter) this.adapter.loading(on, boot);
  },

  gameplay(on) {
    if (on === this._playing) return;
    this._playing = on;
    if (this.adapter) this.adapter.gameplay(on);
  },

  happytime() {
    if (this.adapter) this.adapter.happytime();
  },

  // Offer an ad moment. Silences the game while it runs and resolves when the
  // portal is done; resolves right away when there are no ads here.
  async adBreak() {
    if (!this.adapter || !this.ads || this.adPlaying) return false;
    this.adPlaying = true;
    this.muted = true;
    if (this.onSettings) this.onSettings();
    let shown = false;
    try { shown = await this.adapter.adBreak(); } catch (e) { shown = false; }
    this.adPlaying = false;
    this.muted = this._portalMuted;
    if (this.onSettings) this.onSettings();
    return shown;
  },

  // Report a crash to the portal, where it wants to hear about them.
  error(err) {
    if (this.adapter && this.adapter.error) this.adapter.error(err);
  },
};

// Progress and settings: the portal's own storage when it has one (only
// CrazyGames does), else localStorage.
export const store = {
  _sdk() {
    const a = platform.adapter;
    return a && a.store && a.store.available() ? a.store : null;
  },

  get(key) {
    const s = this._sdk();
    if (s) return s.get(key);
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
    const s = this._sdk();
    if (s) return s.set(key, value);
    const ls = local();
    try { if (ls) { ls.setItem(key, value); return true; } } catch (e) { /* full or blocked */ }
    return false;
  },

  remove(key) {
    const s = this._sdk();
    if (s) { s.remove(key); return; }
    const ls = local();
    try { if (ls) ls.removeItem(key); } catch (e) { /* ignore */ }
  },
};

// Level previews are a regenerable image cache: always plain localStorage,
// never a portal's (size-limited) save. Old-name entries are dropped.
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
