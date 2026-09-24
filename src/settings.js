// Player settings, persisted through the platform layer (the CrazyGames data
// module on CrazyGames, localStorage elsewhere).
import { store } from './platform.js';

const KEY = 'onewayout.settings.v1';
const STYLE_KEY = 'onewayout.style';
const BEST_KEY = 'onewayout.best';

export const DEFAULTS = {
  sensitivity: 1.0,
  invertY: false,
  fov: 75,
  master: 0.8,
  music: 0.35,
  sfx: 1.0,
  ambience: 0.5,
  difficulty: 'normal',
  shake: 1.0,
  viewBob: true,
  quality: 'high',
  ammo: true,
  fps: false,
  aimAssist: true,
  touchSize: 1.0,
};

const read = (key) => store.get(key);
const write = (key, value) => store.set(key, value);

export const settings = { ...DEFAULTS };

// `overrides` are first-run defaults for this device (e.g. Low quality on
// phones); anything the player saved wins.
export function loadSettings(overrides = {}) {
  Object.assign(settings, overrides);
  const raw = read(KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) {
        if (data[k] !== undefined && typeof data[k] === typeof DEFAULTS[k]) settings[k] = data[k];
      }
    } catch (e) { /* corrupted: keep defaults */ }
  }
  return settings;
}

export function saveSettings() {
  write(KEY, JSON.stringify(settings));
}

export function loadStyle() {
  const s = read(STYLE_KEY);
  return s === 'neo' ? 'neo' : 'classic';
}

export function saveStyle(style) {
  write(STYLE_KEY, style);
}
