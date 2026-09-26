// Poki SDK (HTML5 v2) adapter. Self-contained: nothing else in the game knows
// about Poki, and changing this file cannot affect the CrazyGames build
// (src/platforms/crazygames.js) — only the Poki one.
//
// Its script tag is added to the Poki build alone, so `detect()` is what tells
// src/platform.js that this is a Poki page.
//
//  * init: PokiSDK.init(). Debug mode is switched on when the page is not
//    framed (i.e. opened directly while developing), so ads show placeholders.
//  * loading: gameLoadingStart / gameLoadingFinished mark the first load only.
//    Poki uses that pair for its loading and conversion metrics, so per-level
//    loads must not repeat it.
//  * gameplay: gameplayStart / gameplayStop.
//  * adBreak: commercialBreak(), which Poki expects before the player heads
//    back into play. Poki decides whether an ad actually runs, so the game
//    offers the moment and carries on when the promise settles. The game is
//    paused and silenced for the duration (see src/platform.js).
//  * happytime: happyTime(1) on a level win.
//  * store: Poki has no cloud save, so progress stays in localStorage.
//
// Every call is feature-checked and wrapped: a missing or changed SDK method,
// a blocked script or a rejected promise must never stop the game.

export const SDK_SCRIPT = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

export const poki = {
  id: 'poki',
  sdk: null,
  env: 'none',
  portal: false, // running inside Poki's frame
  muted: false, // set while an ad plays
  ads: true,
  onSettings: null,
  device: null, // {type: 'desktop' | 'mobile' | 'tablet'} when the SDK says

  detect() {
    return !!window.PokiSDK;
  },

  async init(timeoutMs = 5000) {
    const p = window.PokiSDK;
    if (!p) return false;
    const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    // developing outside Poki's frame: placeholder ads instead of real ones
    if (!framed) this._call((s) => s.setDebug(true));
    try {
      const done = await Promise.race([
        Promise.resolve(p.init()).then(() => true),
        new Promise((r) => setTimeout(() => r(false), timeoutMs)),
      ]);
      if (!done) { this.env = 'disabled'; return false; }
      this.sdk = p;
      this.env = framed ? 'poki' : 'local';
      this.portal = framed;
      try { this.device = p.getDeviceInfo ? p.getDeviceInfo() : null; } catch (e) { this.device = null; }
      return true;
    } catch (e) {
      console.warn('Poki SDK unavailable:', e);
      this.env = 'disabled';
      this.sdk = null;
      return false;
    }
  },

  _call(fn) {
    const s = this.sdk || window.PokiSDK;
    if (!s) return undefined;
    try { return fn(s); } catch (e) { return undefined; }
  },

  // Only the game's own first load is reported (see the note above).
  loading(on, boot) {
    if (!boot) return;
    this._call((s) => (on ? s.gameLoadingStart && s.gameLoadingStart() : s.gameLoadingFinished && s.gameLoadingFinished()));
  },

  gameplay(on) {
    this._call((s) => (on ? s.gameplayStart() : s.gameplayStop()));
  },

  happytime() {
    this._call((s) => s.happyTime && s.happyTime(1));
  },

  // An ad opportunity. Resolves when Poki is done (or right away when it
  // decides not to show one, or when anything goes wrong).
  adBreak() {
    if (!this.sdk || typeof this.sdk.commercialBreak !== 'function') return Promise.resolve(false);
    let settled = false;
    return new Promise((resolve) => {
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      // a broken ad must not strand the player on a frozen screen
      const guard = setTimeout(() => done(false), 90000);
      try {
        Promise.resolve(this.sdk.commercialBreak())
          .then(() => { clearTimeout(guard); done(true); })
          .catch(() => { clearTimeout(guard); done(false); });
      } catch (e) {
        clearTimeout(guard);
        done(false);
      }
    });
  },

  // Poki likes to hear about crashes.
  error(err) {
    this._call((s) => s.captureError && s.captureError(err));
  },

  // No cloud save on Poki: src/platform.js falls back to localStorage.
  store: { available: () => false },
};
