// Campaign progress: unlocked levels, best scores/times, stars, collected
// secrets, achievements and Endless records. Stored through the platform
// layer: the CrazyGames data module on CrazyGames, localStorage elsewhere.
import { store } from './platform.js';

const KEY = 'onewayout.save.v1';

function blank() {
  return {
    v: 2,
    unlocked: 1, // levels 1..unlocked are playable
    last: 1,
    levels: {},
    campaignWon: false,
    hardWon: false,
    achievements: {},
    endless: { bestWave: 0, bestScore: 0 },
    tutorialSeen: false,
    campaign: { time: 0, kills: 0, score: 0 },
  };
}

export const progress = blank();

export function loadProgress() {
  const raw = store.get(KEY);
  if (!raw) return progress;
  try {
    const d = JSON.parse(raw);
    Object.assign(progress, blank(), d);
    progress.levels = d.levels || {};
    progress.achievements = d.achievements || {};
    progress.endless = { bestWave: 0, bestScore: 0, ...(d.endless || {}) };
    progress.campaign = { time: 0, kills: 0, score: 0, ...(d.campaign || {}) };
  } catch (e) { /* corrupted: start fresh */ }
  return progress;
}

export function saveProgress() {
  store.set(KEY, JSON.stringify(progress));
}

export function levelRecord(n) {
  if (!progress.levels[n]) progress.levels[n] = { completed: false, bestScore: 0, bestTime: 0, stars: 0, secrets: [false, false, false], noDamage: false };
  return progress.levels[n];
}

export function resetProgressForTests() {
  Object.assign(progress, blank());
  saveProgress();
}
