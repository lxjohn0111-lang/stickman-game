// Player settings, persisted in localStorage. Every access is wrapped because
// storage can be missing or throw (private windows, file:// quirks).

const KEY = 'waythrough.settings.v1';
const STYLE_KEY = 'waythrough.style';
const BEST_KEY = 'waythrough.best';

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
};

function read(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

export const settings = { ...DEFAULTS };

export function loadSettings() {
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

export function loadBest() {
  const v = Number(read(BEST_KEY));
  return Number.isFinite(v) ? v : 0;
}

export function saveBest(v) {
  write(BEST_KEY, String(v));
}
