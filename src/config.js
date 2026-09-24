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
  // Jump apex = v^2 / 2g = 0.84 m, so the 1.05 m parapet cannot be cleared.
  jumpVelocity: 5.8,
  stepHeight: 0.36,
  groundAccel: 48,
  airAccel: 9,
  friction: 11,
  maxHealth: 100,
  regenRate: 22,
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
  hearRange: 42,
  hearRangeWalled: 11,
  alertRange: 17,
  alertRangeWalled: 9,
  loseSightTime: 1.3,
  searchTime: 8,
};

export const HEADSHOT_MULT = 2.5;

// Player weapon stats. interval is seconds per shot; the SMG (0.09 s) and
// rifle (0.125 s) cadences come from the brief's audio-peak measurements.
export const WEAPONS = {
  smg: {
    id: 'smg', name: 'SMG', auto: true, interval: 0.09, damage: 20, pellets: 1,
    spread: 0.011, moveSpread: 0.022, mag: 32, reserve: 160, reload: 1.65,
    kickPitch: 0.0085, kickYaw: 0.0035, vmKick: 1.0, speed: 210, sound: 'smg', range: 120,
    enemy: { interval: 0.11, burst: [4, 7], damage: 8, spread: 0.04, speed: 33, pause: [0.7, 1.3] },
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', auto: false, interval: 0.78, damage: 14, pellets: 8,
    spread: 0.062, moveSpread: 0.02, mag: 6, reserve: 30, reload: 0.5, shellReload: true,
    kickPitch: 0.055, kickYaw: 0.008, vmKick: 1.6, speed: 175, sound: 'shotgun', range: 60,
    enemy: { interval: 1.15, burst: [1, 1], pellets: 6, damage: 6, spread: 0.075, speed: 29, pause: [0.9, 1.6] },
  },
  rifle: {
    id: 'rifle', name: 'Rifle', auto: true, interval: 0.125, damage: 34, pellets: 1,
    spread: 0.007, moveSpread: 0.02, mag: 30, reserve: 120, reload: 2.2,
    kickPitch: 0.0135, kickYaw: 0.004, vmKick: 1.2, speed: 240, sound: 'rifle', range: 160,
    enemy: { interval: 0.15, burst: [3, 5], damage: 12, spread: 0.03, speed: 37, pause: [0.8, 1.4] },
  },
  pistol: {
    id: 'pistol', name: 'Pistol', auto: false, interval: 0.11, damage: 30, pellets: 1,
    spread: 0.006, moveSpread: 0.016, mag: 12, reserve: 60, reload: 1.35,
    kickPitch: 0.021, kickYaw: 0.004, vmKick: 1.1, speed: 220, sound: 'pistol', range: 100,
    enemy: { interval: 0.42, burst: [1, 3], damage: 10, spread: 0.03, speed: 31, pause: [0.6, 1.2] },
  },
};

// The sniper in the guard tower uses a rifle with its own cadence.
export const SNIPER = { interval: 2.4, damage: 28, spread: 0.005, speed: 62 };

export const DIFFICULTY = {
  easy: { label: 'Easy', damage: 0.55, spread: 1.55, react: 1.45, awareness: 0.7, bulletSpeed: 0.85, regenDelay: 3.0 },
  normal: { label: 'Normal', damage: 1.0, spread: 1.0, react: 1.0, awareness: 1.0, bulletSpeed: 1.0, regenDelay: 4.0 },
  hard: { label: 'Hard', damage: 1.45, spread: 0.72, react: 0.72, awareness: 1.4, bulletSpeed: 1.15, regenDelay: 5.0 },
};

export const PLAYER_START = { x: -30.5, y: 5.0, z: 9.0, yaw: -Math.PI / 2 };

// Walking past this line (the North Gate) wins.
export const WIN_Z = -83.2;
