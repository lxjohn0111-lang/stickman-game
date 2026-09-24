// Tunables shared across the game. Distances are metres, times seconds,
// angles radians. North is -Z.

export const GRAVITY = 20;

export const PLAYER = {
  radius: 0.3,
  height: 1.75,
  crouchHeight: 1.15,
  eye: 1.6,
  crouchEye: 1.0,
  walk: 4.3,
  sprint: 6.6,
  crouchSpeed: 2.2,
  aimSpeed: 2.9,
  climbSpeed: 3.0,
  // Jump apex = v^2 / 2g = 0.84 m, so the 1.05 m parapet cannot be cleared.
  jumpVelocity: 5.8,
  stepHeight: 0.36,
  groundAccel: 48,
  airAccel: 9,
  friction: 11,
  maxHealth: 100,
  // Regeneration starts after 5 s without damage, 8 hp/s, up to the
  // difficulty's regeneration limit.
  regenDelay: 5,
  regenRate: 8,
  healthKit: 35,
};

export const ENEMY = {
  health: 80,
  radius: 0.3,
  height: 1.78,
  eye: 1.62,
  walk: 1.45,
  run: 3.7,
  strafe: 2.0,
  viewRange: 46,
  sniperRange: 95,
  fovCos: Math.cos((62 * Math.PI) / 180),
  combatFovCos: Math.cos((110 * Math.PI) / 180),
  hearRange: 34,
  hearRangeWalled: 11,
  alertRange: 17,
  alertRangeWalled: 9,
  loseSightTime: 1.3,
  searchTime: 8,
};

export const HEADSHOT_MULT = 2.5;

// Footstep sound per collider surface (roof, indoor, metal, snow, outdoor).
export const STEP_SOUNDS = { roof: 'step_roof', indoor: 'step_indoor', metal: 'step_metal', snow: 'step_snow', ice: 'step_snow', ground: 'step_ground' };
export function stepSound(surf) { return STEP_SOUNDS[surf] || 'step_ground'; }

// Weapons. slot: 'main' or 'side' (the player carries one of each).
// interval is seconds per shot; the SMG (0.09 s) and rifle (0.125 s) cadences
// come from the original brief's audio-peak measurements.
export const WEAPONS = {
  smg: {
    id: 'smg', name: 'SMG', slot: 'main', auto: true, interval: 0.09, damage: 20, pellets: 1,
    spread: 0.011, moveSpread: 0.022, mag: 32, reserve: 160, reload: 1.65,
    kickPitch: 0.0085, kickYaw: 0.0035, vmKick: 1.0, speed: 210, sound: 'smg', range: 120,
    enemy: { interval: 0.11, burst: [4, 7], damage: 8, spread: 0.04, speed: 33, pause: [0.7, 1.3] },
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', slot: 'main', auto: false, interval: 0.78, damage: 14, pellets: 8,
    spread: 0.062, moveSpread: 0.02, mag: 6, reserve: 30, reload: 0.5, shellReload: true,
    kickPitch: 0.055, kickYaw: 0.008, vmKick: 1.6, speed: 175, sound: 'shotgun', range: 60,
    enemy: { interval: 1.15, burst: [1, 1], pellets: 6, damage: 6, spread: 0.075, speed: 29, pause: [0.9, 1.6] },
  },
  rifle: {
    id: 'rifle', name: 'Rifle', slot: 'main', auto: true, interval: 0.125, damage: 34, pellets: 1,
    spread: 0.007, moveSpread: 0.02, mag: 30, reserve: 120, reload: 2.2,
    kickPitch: 0.0135, kickYaw: 0.004, vmKick: 1.2, speed: 240, sound: 'rifle', range: 160,
    enemy: { interval: 0.15, burst: [3, 5], damage: 12, spread: 0.03, speed: 37, pause: [0.8, 1.4] },
  },
  burst: {
    id: 'burst', name: 'Burst Rifle', slot: 'main', auto: false, burst: 3, burstGap: 0.065, interval: 0.34, damage: 29, pellets: 1,
    spread: 0.005, moveSpread: 0.018, mag: 30, reserve: 120, reload: 1.95,
    kickPitch: 0.011, kickYaw: 0.003, vmKick: 0.9, speed: 250, sound: 'burst', range: 160,
    enemy: { interval: 0.075, burst: [3, 3], damage: 11, spread: 0.026, speed: 38, pause: [0.7, 1.2] },
  },
  pistol: {
    id: 'pistol', name: 'Pistol', slot: 'side', auto: false, interval: 0.11, damage: 30, pellets: 1,
    spread: 0.006, moveSpread: 0.016, mag: 12, reserve: 60, reload: 1.35,
    kickPitch: 0.021, kickYaw: 0.004, vmKick: 1.1, speed: 220, sound: 'pistol', range: 100,
    enemy: { interval: 0.42, burst: [1, 3], damage: 10, spread: 0.022, speed: 32, pause: [0.5, 1.0] },
  },
  mpistol: {
    id: 'mpistol', name: 'Auto Pistol', slot: 'side', auto: true, interval: 0.062, damage: 13, pellets: 1,
    spread: 0.02, moveSpread: 0.02, mag: 20, reserve: 100, reload: 1.3,
    kickPitch: 0.0075, kickYaw: 0.006, vmKick: 0.8, speed: 200, sound: 'mpistol', range: 80,
    enemy: { interval: 0.075, burst: [4, 8], damage: 6, spread: 0.05, speed: 32, pause: [0.7, 1.3] },
  },
  revolver: {
    id: 'revolver', name: 'Revolver', slot: 'side', auto: false, interval: 0.42, damage: 72, pellets: 1,
    spread: 0.004, moveSpread: 0.018, mag: 6, reserve: 30, reload: 2.4,
    kickPitch: 0.05, kickYaw: 0.01, vmKick: 1.7, speed: 260, sound: 'revolver', range: 140,
    enemy: { interval: 0.9, burst: [1, 2], damage: 22, spread: 0.016, speed: 36, pause: [0.9, 1.5] },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const DEFAULT_LOADOUT = { main: 'smg', side: 'pistol' };

// The sniper uses a rifle with its own cadence and a ~1 s laser warning.
export const SNIPER = { aim: 1.05, lock: 0.25, cooldown: 1.6, damage: 28, spread: 0.004, speed: 62 };

// Enemy roles. Every role keeps the stickman silhouette; heavies are bigger
// and wear a vest. pref = preferred combat distance [min, max].
export const ROLES = {
  pistol: { hp: 55, weapons: ['pistol', 'revolver'], walk: 1.8, run: 4.5, strafe: 2.6, pref: [5, 14], accuracy: 0.75 },
  smg: { hp: 80, weapons: ['smg', 'mpistol'], walk: 1.5, run: 4.1, strafe: 2.2, pref: [3, 9], accuracy: 1.0, aggressive: true },
  rifle: { hp: 85, weapons: ['rifle', 'burst'], walk: 1.4, run: 3.4, strafe: 1.8, pref: [9, 26], accuracy: 0.9, coverHop: true },
  shotgun: { hp: 95, weapons: ['shotgun'], walk: 1.5, run: 3.9, strafe: 1.8, pref: [2, 6], accuracy: 1.0, approach: true },
  heavy: { hp: 280, weapons: ['smg', 'shotgun'], walk: 1.05, run: 2.3, strafe: 1.1, pref: [4, 12], accuracy: 1.0, scale: 1.2, vest: true, stagger: true },
  sniper: { hp: 70, weapons: ['rifle'], walk: 1.3, run: 3.0, strafe: 0, pref: [15, 90], accuracy: 1.0, sniper: true },
  commander: { hp: 950, weapons: ['rifle'], walk: 1.4, run: 3.6, strafe: 2.0, pref: [4, 20], accuracy: 0.85, scale: 1.12, vest: true, cap: true, boss: true, stagger: true },
};

// Difficulty changes enemy health, accuracy, reaction time, damage and how
// many optional pickups appear, never the map layout. regenCap is how far
// health regenerates on its own.
export const DIFFICULTY = {
  easy: { label: 'Easy', enemyHealth: 0.75, damage: 0.6, spread: 1.5, react: 1.4, awareness: 0.75, bulletSpeed: 0.85, regenCap: 100, pickupTier: 3, score: 0.8 },
  normal: { label: 'Normal', enemyHealth: 1.0, damage: 1.0, spread: 1.0, react: 1.0, awareness: 1.0, bulletSpeed: 1.0, regenCap: 75, pickupTier: 2, score: 1.0 },
  hard: { label: 'Hard', enemyHealth: 1.3, damage: 1.4, spread: 0.72, react: 0.72, awareness: 1.35, bulletSpeed: 1.15, regenCap: 50, pickupTier: 1, score: 1.3 },
};

export const SCORE = {
  kill: 100,
  headshot: 50,
  comboStep: 0.1, // +10% per consecutive kill without taking damage
  comboMax: 2.0,
  accuracy: 1000, // x accuracy (0..1)
  timeBonus: 4, // per second under par
  health: 5, // per remaining health point
  secret: 250,
};

// Star thresholds on the pre-difficulty score (n = enemies in the level).
export function starThresholds(n) {
  return { two: n * 80 + 700, three: n * 130 + 1400 };
}
