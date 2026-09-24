// Stickman enemies: roles, AI, procedural pose, Verlet ragdolls.
// All characters share a handful of InstancedMeshes (limbs, torso, joints,
// head, eye, pupil, vest, cap, laser) and push their guns into the shared
// gun meshes owned by Items, so a full level of them costs ~16 draw calls.
//
// AI: idle/patrol -> awareness builds while they can see you -> combat (face
// you, aim, fire, strafe or change cover) -> chase your last known position
// with waypoint A* (opening doors themselves) -> search the area -> return.
//
// Roles keep the same stickman silhouette and read through their weapon,
// size and gear: pistol (fast, accurate singles), SMG (aggressive bursts),
// rifle (changes cover after firing), shotgun (closes in), heavy (bigger,
// armour vest, staggers after repeated hits but can't be stun-locked),
// sniper (a red laser for ~1 s before each shot), commander (boss stages).
// Civilians are grey/blue stickmen with their hands up.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { ENEMY, WEAPONS, SNIPER, ROLES, HEADSHOT_MULT, GRAVITY, stepSound } from './config.js';
import { SIGHT, MOVE, BULLET, surfaceOf } from './world.js';
import { GUN_INFO } from './guns.js';

const MAX_E = 48;
const MAX_LASERS = 8;
const LIMBS = 9;
const JOINTS = 14;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

const CIVILIAN = { hp: 100, weapons: [], walk: 1.5, run: 3.3, strafe: 0, pref: [0, 0], accuracy: 1, civilian: true };
const roleDef = (r) => (r === 'civilian' ? CIVILIAN : ROLES[r] || ROLES.smg);

const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

// joint indices (shared by pose + ragdoll)
const J = { head: 0, neck: 1, pelvis: 2, sl: 3, el: 4, hl: 5, sr: 6, er: 7, hr: 8, hipl: 9, kl: 10, fl: 11, hipr: 12, kr: 13, fr: 14, chest: 15 };
const STICKS = [
  [0, 1], [1, 2], [1, 3], [1, 6], [3, 6], [3, 4], [4, 5], [6, 7], [7, 8], [2, 9], [2, 12], [9, 12], [9, 10], [10, 11], [12, 13], [13, 14],
  [3, 2], [6, 2], [3, 9], [6, 12], [0, 3], [0, 6], [1, 9], [1, 12], [3, 12], [6, 9],
  [15, 1], [15, 2], [15, 3], [15, 6],
];
const LIMB_SEGS = [[3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14]];
const JOINT_LIST = [3, 6, 4, 7, 5, 8, 9, 12, 10, 13, 11, 14];
const P_RADIUS = [0.165, 0.08, 0.1, 0.07, 0.06, 0.06, 0.07, 0.06, 0.06, 0.08, 0.06, 0.06, 0.08, 0.06, 0.06, 0.1];

function segMatrix(a, b, out, thick = 1) {
  _v.subVectors(b, a);
  const len = _v.length();
  if (len < 1e-5) return out.copy(HIDE);
  _v.divideScalar(len);
  _q.setFromUnitVectors(UP, _v);
  return out.compose(_v2.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(thick, len, thick));
}

// Two-bone IK: elbow position given shoulder, hand, lengths and a pole hint.
function solveElbow(sh, hand, l1, l2, pole, out) {
  const d = _v.subVectors(hand, sh);
  let len = d.length();
  const maxLen = l1 + l2 - 1e-3;
  if (len > maxLen) { d.multiplyScalar(maxLen / len); hand.copy(sh).add(d); len = maxLen; }
  if (len < 1e-4) return out.copy(sh).addScaledVector(pole, l1);
  const dir = d.divideScalar(len);
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
  p.normalize();
  return out.copy(sh).addScaledVector(dir, a).addScaledVector(p, h);
}

function pushOut(base, amount) {
  base.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + normal * ${amount.toFixed(3)};`);
  };
  return base;
}

function vestGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.36, 0.44, 0.27),
    new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(-0.1, -0.08, 0.15),
    new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(0.02, -0.08, 0.15),
    new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(0.12, -0.08, 0.15),
    new THREE.BoxGeometry(0.08, 0.1, 0.28).translate(-0.12, 0.25, 0),
    new THREE.BoxGeometry(0.08, 0.1, 0.28).translate(0.12, 0.25, 0),
  ];
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

function capGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.176, 0.176, 0.07, 14).translate(0, 0.02, 0),
    new THREE.CylinderGeometry(0.2, 0.17, 0.07, 14).translate(0, 0.085, -0.01),
    new THREE.BoxGeometry(0.22, 0.02, 0.1).translate(0, -0.005, 0.2),
  ];
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

export class Enemies {
  constructor(game) {
    this.game = game;
    const mats = game.materials;
    const scene = game.scene;
    this.list = [];
    this.nextId = 0;
    const bodyMat = mats.get('enemy');
    const rimMat = pushOut(mats.get('rim'), 0.024);
    const hull = pushOut(mats.get('hull2'), 0.022);
    const mk = (geo, mat, n, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.count = 0;
      scene.add(m);
      return m;
    };
    const limbGeo = new THREE.CylinderGeometry(0.058, 0.058, 1, 8, 1, true);
    const torsoGeo = new THREE.CylinderGeometry(0.1, 0.112, 1, 12, 1, true);
    const jointGeo = new THREE.SphereGeometry(0.058, 10, 8);
    const headGeo = new THREE.SphereGeometry(0.165, 18, 14);
    const eyeGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.012, 18);
    eyeGeo.rotateX(Math.PI / 2);
    const pupilGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14);
    pupilGeo.rotateX(Math.PI / 2);
    this.limbs = mk(limbGeo, bodyMat, MAX_E * LIMBS);
    this.torso = mk(torsoGeo, bodyMat, MAX_E * 2);
    this.joints = mk(jointGeo, bodyMat, MAX_E * JOINTS);
    this.heads = mk(headGeo, bodyMat, MAX_E);
    this.eyes = mk(eyeGeo, mats.get('enemyEye'), MAX_E, false);
    this.pupils = mk(pupilGeo, mats.get('enemyPupil'), MAX_E, false);
    this.tinted = [this.limbs, this.torso, this.joints, this.heads];
    // per-instance colour: black fighters, grey (Classic) / blue (Neo) civilians
    for (const m of this.tinted) {
      for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, _c.setHex(0x0b0b0b));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    // white rim for the Neobrutalist style (hidden in Classic)
    this.rims = [];
    for (const src of this.tinted) {
      const r = mk(src.geometry, rimMat, src.instanceMatrix.count, false);
      r.instanceMatrix = src.instanceMatrix;
      r.renderOrder = -1;
      this.rims.push([r, src]);
    }
    // heavy armour vest and commander cap, both with an ink hull
    const vg = vestGeometry();
    this.vests = mk(vg, mats.get('vest'), MAX_E);
    this.vestHull = mk(vg, hull, MAX_E, false);
    this.vestHull.instanceMatrix = this.vests.instanceMatrix;
    const cg = capGeometry();
    this.caps = mk(cg, mats.get('cap'), 8);
    this.capHull = mk(cg, hull, 8, false);
    this.capHull.instanceMatrix = this.caps.instanceMatrix;
    // sniper aiming lasers (thin red line + dot where it lands)
    const lg = new THREE.CylinderGeometry(0.009, 0.009, 1, 5, 1, true);
    this.lasers = mk(lg, mats.get('laser'), MAX_LASERS, false);
    this.laserDots = mk(new THREE.SphereGeometry(0.045, 8, 6), mats.get('laser'), MAX_LASERS, false);
    this.tmp = Array.from({ length: 16 }, () => new THREE.Vector3());
    this.alertCooldown = 0;
    this.stepBudget = 0;
    this.boss = null;
  }

  // ------------------------------------------------------------------ spawning
  clear() {
    this.list.length = 0;
    this.boss = null;
  }

  // Spawn every enemy of a group ('main' at level start).
  spawnGroup(spawns, group = 'main') {
    const out = [];
    for (const sp of spawns) {
      if ((sp.group || 'main') !== group) continue;
      out.push(this._add(this._make(sp)));
    }
    return out;
  }

  // Runtime reinforcement: def = {role, x, y, z, yaw, weapon?}. They arrive
  // knowing roughly where the player is.
  add(def, { hunt = true } = {}) {
    const sp = { key: 'r' + this.nextId, group: 'wave', dynamic: true, ...def };
    const e = this._add(this._make(sp));
    if (hunt && !e.civilian) {
      const P = this.game.player;
      e.lastKnown.set(P.x + rand(-2, 2), P.y, P.z + rand(-2, 2));
      e.awareness = 1;
      e.state = e.perch ? 'combat' : 'chase';
      e.reactT = rand(0.5, 0.9) * this.game.diff.react;
      e.burstCd = e.reactT;
      e.repathT = 0;
    }
    return e;
  }

  _add(e) {
    if (this.list.length >= MAX_E) {
      // make room: drop the oldest settled body
      const i = this.list.findIndex((o) => !o.alive && (!o.ragdoll || o.ragdoll.sleep));
      const j = i >= 0 ? i : this.list.findIndex((o) => !o.alive);
      if (j >= 0) this.list.splice(j, 1);
      else return e;
    }
    this.list.push(e);
    if (e.R.boss) this.boss = e;
    return e;
  }

  _make(sp) {
    const g = this.game;
    const R = roleDef(sp.role);
    const k = R.scale || 1;
    const body = { x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, r: ENEMY.radius * k, h: ENEMY.height * k, grounded: true, stepH: 0.36, jumping: false, ex: 0, ez: 0 };
    const id = this.nextId++;
    const weapon = sp.weapon || (R.weapons.length ? R.weapons[id % R.weapons.length] : null);
    const hp = R.civilian ? 1e9 : Math.round(R.hp * g.diff.enemyHealth);
    const e = {
      id, key: sp.key, spawn: sp, role: sp.role, R, k, thick: k > 1.05 ? 1.35 : 1, civilian: !!R.civilian, sniper: !!R.sniper,
      perch: !!(sp.perch || R.sniper), hold: !!sp.hold, group: sp.group || 'main',
      post: new THREE.Vector3(sp.x, sp.y, sp.z), postYaw: sp.yaw,
      body, yaw: sp.yaw, pitch: 0, weapon,
      alive: true, health: hp, maxHealth: hp, state: R.civilian ? 'civilian' : sp.patrol ? 'patrol' : 'idle',
      awareness: 0, sees: false, lastKnown: new THREE.Vector3(), lastSeen: -99, perceiveT: (id % 6) * 0.017,
      reactT: 0, burstLeft: 0, burstCd: 0, shotCd: 0, aimTime: 0, aimBlend: 0, hitUp: 0, stagger: 0, kick: 0,
      staggerAcc: 0, staggerCd: 0, handsUp: R.civilian ? 1 : 0,
      strafeDir: 0, strafeT: 0, path: null, pathIdx: 0, repathT: 0, goal: null, hop: null, hopT: 0,
      searchT: 0, patrolIdx: 0, waitT: 0, walkPhase: Math.random() * 6, lastStep: 0, moveSpeed: 0, idleT: Math.random() * 10,
      joints: Array.from({ length: 16 }, () => new THREE.Vector3()), face: new THREE.Vector3(0, 0, -1),
      ragdoll: null, deathT: 0, pooled: false, suspicious: 0, stuckT: 0, doorWait: 0,
      snipe: { phase: 'ready', t: 0, aim: new THREE.Vector3(), end: new THREE.Vector3(), on: false },
      stage: 0, relocating: false, follow: false, dest: null,
    };
    this._pose(e, 0);
    return e;
  }

  get alive() { let n = 0; for (const e of this.list) if (e.alive && !e.civilian) n++; return n; }

  hostiles() { return this.list.filter((e) => e.alive && !e.civilian); }

  groupAlive(group) { let n = 0; for (const e of this.list) if (e.alive && !e.civilian && e.group === group) n++; return n; }

  byKey(key) { return this.list.find((e) => e.key === key); }

  // Any hostile fighting (or hunting) within r of a point?
  combatNear(x, y, z, r) {
    for (const e of this.list) {
      if (!e.alive || e.civilian) continue;
      if (e.state !== 'combat' && e.state !== 'chase') continue;
      if (Math.hypot(e.body.x - x, (e.body.y - y) * 1.5, e.body.z - z) < r) return true;
    }
    return false;
  }

  anyInCombat() {
    for (const e of this.list) if (e.alive && !e.civilian && (e.state === 'combat' || (e.state === 'chase' && !e.investigate))) return true;
    return false;
  }

  // ------------------------------------------------------------------ AI
  update(dt, active) {
    const g = this.game;
    const P = g.player;
    this.alertCooldown = Math.max(0, this.alertCooldown - dt);
    this.stepBudget = 2;
    for (const e of this.list) {
      if (!e.alive) { this._updateDead(e, dt); continue; }
      e.hitUp = Math.max(0, e.hitUp - dt * 2.6);
      e.stagger = Math.max(0, e.stagger - dt);
      e.staggerCd = Math.max(0, e.staggerCd - dt);
      e.staggerAcc = Math.max(0, e.staggerAcc - dt * 45);
      e.kick = Math.max(0, e.kick - dt * 12);
      let desiredX = 0, desiredZ = 0, speed = 0;
      if (e.civilian) {
        [desiredX, desiredZ, speed] = this._civilian(e, dt);
      } else {
        if (active && P.alive) {
          e.perceiveT -= dt;
          if (e.perceiveT <= 0) {
            e.perceiveT = 0.1;
            e.sees = this._canSee(e);
          }
        } else e.sees = false;
        const dxp = P.x - e.body.x, dzp = P.z - e.body.z;
        const distP = Math.hypot(dxp, dzp);
        const diff = g.diff;
        if (active) {
          if (e.sees) {
            e.lastKnown.set(P.x, P.y, P.z);
            e.lastSeen = g.time;
          }
          switch (e.state) {
            case 'idle':
            case 'patrol':
            case 'search':
            case 'return': {
              if (e.sees) {
                const range = e.sniper ? ENEMY.sniperRange : ENEMY.viewRange;
                let rate = (0.7 + 2.3 * Math.max(0, 1 - distP / range)) * diff.awareness;
                if (P.crouch > 0.5) rate *= 0.55;
                if (P.sprinting) rate *= 1.35;
                if (distP < 5) rate *= 3;
                if (e.state === 'search') rate *= 2;
                e.awareness += rate * dt;
                e.suspicious = 1;
                if (e.awareness >= 1) { this._enterCombat(e); break; }
              } else {
                e.awareness = Math.max(0, e.awareness - dt * 0.12);
                e.suspicious = Math.max(0, e.suspicious - dt * 0.5);
              }
              if (e.suspicious > 0 && e.awareness > 0.2 && e.state !== 'search') {
                this._turnTo(e, Math.atan2(-dxp, -dzp), 2.0, dt);
                break;
              }
              if (e.state === 'patrol' && !e.perch) {
                [desiredX, desiredZ, speed] = this._patrol(e, dt);
              } else if (e.state === 'search') {
                [desiredX, desiredZ, speed] = this._search(e, dt);
              } else if (e.state === 'return') {
                [desiredX, desiredZ, speed] = this._followPath(e, e.R.walk, dt);
                if (!e.path || e.pathIdx >= e.path.length) {
                  if (Math.hypot(e.body.x - e.post.x, e.body.z - e.post.z) < 1) {
                    e.state = e.spawn.patrol ? 'patrol' : 'idle';
                    e.path = null;
                  } else if (!e.goal) e.goal = e.post.clone();
                }
              } else {
                e.idleT += dt;
                const look = e.perch ? Math.sin(e.idleT * 0.35 + e.id) * 0.9 : Math.sin(e.idleT * 0.3 + e.id) * 0.45;
                this._turnTo(e, e.postYaw + look, 1.2, dt);
              }
              break;
            }
            case 'combat':
              [desiredX, desiredZ, speed] = this._combat(e, dt, distP, dxp, dzp);
              break;
            case 'chase': {
              if (e.sees) { this._enterCombat(e, true); break; }
              e.repathT -= dt;
              if (e.repathT <= 0 || !e.path) this._pathTo(e, e.lastKnown);
              [desiredX, desiredZ, speed] = this._followPath(e, e.investigate ? e.R.walk * 1.4 : e.R.run, dt);
              const dl = Math.hypot(e.body.x - e.lastKnown.x, e.body.z - e.lastKnown.z);
              if (dl < 1.3 || (!e.path && !e.goal)) this._startSearch(e);
              break;
            }
            default: break;
          }
        } else {
          e.idleT += dt;
          this._turnTo(e, e.postYaw + Math.sin(e.idleT * 0.3 + e.id) * 0.4, 1.0, dt);
        }
        if (e.state !== 'combat' || !e.sniper) e.snipe.on = false;
      }

      // steering + physics
      if (e.perch) { desiredX = desiredZ = 0; speed = 0; }
      if (e.stagger > 0) { const s = e.R.stagger ? 0 : 0.3; desiredX *= s; desiredZ *= s; }
      const b = e.body;
      const accel = 14 * dt;
      const ax = desiredX - b.vx, az = desiredZ - b.vz;
      const al = Math.hypot(ax, az);
      if (al <= accel) { b.vx = desiredX; b.vz = desiredZ; } else { b.vx += (ax / al) * accel; b.vz += (az / al) * accel; }
      this._separate(e);
      const x0 = b.x, z0 = b.z;
      if (!e.perch) {
        const c = b.groundCol;
        if (c && c.conv && c.conv.on) { b.ex = c.conv.vx; b.ez = c.conv.vz; } else { b.ex = 0; b.ez = 0; }
        g.world.moveBody(b, dt, GRAVITY);
      }
      const moved = Math.hypot(b.x - x0 - b.ex * dt, b.z - z0 - b.ez * dt);
      e.moveSpeed = moved / Math.max(dt, 1e-4);
      if (speed > 0.5 && e.moveSpeed < 0.25) {
        e.stuckT += dt;
        this._openBlockingDoor(e, desiredX, desiredZ);
        if (e.stuckT > 1.2) { e.stuckT = 0; e.repathT = 0; e.strafeDir = -e.strafeDir; e.path = null; e.hop = null; }
      } else e.stuckT = 0;
      e.walkPhase += dt * Math.min(e.moveSpeed, 4) * 3.1 / e.k;
      this._footstep(e);
      this._pose(e, dt);
    }
  }

  // Audible, surface-dependent steps (and prints in snow) for nearby walkers.
  _footstep(e) {
    const step = Math.floor(e.walkPhase / Math.PI);
    if (step === e.lastStep) return;
    e.lastStep = step;
    if (e.moveSpeed < 0.8) return;
    const g = this.game;
    const b = e.body;
    const surf = surfaceOf(g.world, b);
    if (surf === 'snow' && g.env) {
      const side = step % 2 ? 0.12 : -0.12;
      g.env.footprint(b.x + Math.cos(e.yaw) * side, b.y, b.z - Math.sin(e.yaw) * side, e.yaw);
    }
    const cam = g.camera.position;
    const d = Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z);
    if (d > 16 || this.stepBudget <= 0) return;
    this.stepBudget--;
    const sp = g.spatialAt(b.x, b.y + 0.2, b.z, (e.moveSpeed > 2.5 ? 0.3 : 0.18) * (e.R.scale ? 1.3 : 1));
    g.audio.play(stepSound(surf), { ...sp, rate: (e.R.scale ? 0.82 : 1) * rand(0.92, 1.08) });
  }

  _canSee(e) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    const ex = b.x, ey = b.y + ENEMY.eye * e.k, ez = b.z;
    const dx = P.cam.x - ex, dy = P.cam.y - ey, dz = P.cam.z - ez;
    const dist = Math.hypot(dx, dy, dz);
    const range = e.sniper ? ENEMY.sniperRange : ENEMY.viewRange * (g.level && g.level.def.env.viewScale || 1);
    if (dist > range) return false;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const hd = Math.hypot(dx, dz) || 1;
    const dot = (dx * fx + dz * fz) / hd;
    const fov = e.state === 'combat' || e.state === 'chase' ? ENEMY.combatFovCos : e.perch ? Math.cos(1.2) : ENEMY.fovCos;
    if (dot < fov && dist > 3.5) return false;
    const w = g.world;
    if (w.clear(ex, ey, ez, P.cam.x, P.cam.y - 0.05, P.cam.z, SIGHT)) return true;
    return w.clear(ex, ey, ez, P.cam.x, P.cam.y - 0.45, P.cam.z, SIGHT);
  }

  _enterCombat(e, fromChase = false) {
    const g = this.game;
    e.investigate = false;
    const wasCombat = e.state === 'combat';
    e.state = 'combat';
    e.awareness = 1;
    e.path = null;
    e.goal = null;
    if (!wasCombat) {
      const quick = e.R.aggressive || e.role === 'pistol' ? 0.8 : e.R.scale ? 1.1 : 1;
      e.reactT = (fromChase ? rand(0.2, 0.4) : rand(0.4, 0.8)) * g.diff.react * quick;
      e.burstCd = e.reactT;
      e.burstLeft = 0;
      e.aimTime = 0;
      e.lastSeen = g.time;
      e.snipe.phase = 'ready';
      if (!fromChase && this.alertCooldown <= 0) {
        g.audio.play('alert', this._spatial(e, 0.35));
        this.alertCooldown = 1.5;
      }
      this._alertOthers(e);
    }
  }

  _alertOthers(src) {
    const w = this.game.world;
    const P = this.game.player;
    for (const o of this.list) {
      if (o === src || !o.alive || o.civilian || o.state === 'combat') continue;
      const d = Math.hypot(o.body.x - src.body.x, o.body.y - src.body.y, o.body.z - src.body.z);
      if (d > ENEMY.alertRange) continue;
      const clear = w.clear(src.body.x, src.body.y + 1.5, src.body.z, o.body.x, o.body.y + 1.5, o.body.z, SIGHT);
      if (clear || d < ENEMY.alertRangeWalled) this.alert(o, P.x, P.y, P.z);
    }
  }

  // Something told this enemy where the player is (gunfire, a shout).
  alert(e, x, y, z, urgent = true) {
    if (!e.alive || e.civilian || e.state === 'combat') return;
    e.lastKnown.set(x, y, z);
    e.awareness = 1;
    e.investigate = !urgent;
    if (e.hold && Math.hypot(x - e.post.x, z - e.post.z) > 12) {
      // guards keep their post: get suspicious and look around it
      e.lastKnown.copy(e.post);
      this._startSearch(e);
      e.awareness = 0.8;
      return;
    }
    if (e.perch) { e.state = 'combat'; e.reactT = rand(0.6, 1.0) * this.game.diff.react; e.burstCd = e.reactT; e.snipe.phase = 'ready'; return; }
    e.state = 'chase';
    e.repathT = 0;
    e.path = null;
  }

  // Player gunfire: loud in the open, muffled through walls.
  hearShot(x, y, z) {
    const w = this.game.world;
    for (const e of this.list) {
      if (!e.alive || e.civilian || e.state === 'combat') continue;
      const d = Math.hypot(e.body.x - x, e.body.y - y, e.body.z - z);
      if (d > ENEMY.hearRange) continue;
      const clear = w.clear(e.body.x, e.body.y + 1.6, e.body.z, x, y, z, SIGHT);
      const walled = Math.abs(e.body.y + 1.6 - y) > 2.6 ? ENEMY.hearRangeWalled * 0.5 : ENEMY.hearRangeWalled;
      if (clear || d < walled) this.alert(e, this.game.player.x, this.game.player.y, this.game.player.z, d < 20);
    }
  }

  // Quieter noises (doors, glass): investigate.
  hearNoise(x, y, z, radius) {
    const w = this.game.world;
    for (const e of this.list) {
      if (!e.alive || e.civilian || e.state === 'combat' || e.state === 'chase' || e.perch) continue;
      const d = Math.hypot(e.body.x - x, e.body.y - y, e.body.z - z);
      const clear = w.clear(e.body.x, e.body.y + 1.6, e.body.z, x, y, z, SIGHT);
      if (d < (clear ? radius : radius * 0.5)) {
        e.lastKnown.set(x, y - 1, z);
        e.state = 'chase';
        e.investigate = true;
        e.awareness = Math.max(e.awareness, 0.6);
        e.repathT = 0;
      }
    }
  }

  _turnTo(e, target, rate, dt) {
    const d = angDiff(e.yaw, target);
    const step = Math.min(Math.abs(d), rate * dt);
    e.yaw += Math.sign(d) * step;
    return Math.abs(d);
  }

  _combat(e, dt, distP, dxp, dzp) {
    const g = this.game;
    const P = g.player;
    const R = e.R;
    const ew = WEAPONS[e.weapon].enemy;
    e.reactT -= dt;
    if (e.sees) e.aimTime += dt; else e.aimTime = Math.max(0, e.aimTime - dt * 2);
    const tx = e.sees ? P.x : e.lastKnown.x, tz = e.sees ? P.z : e.lastKnown.z;
    const yawTo = Math.atan2(-(tx - e.body.x), -(tz - e.body.z));
    const hopping = e.hop && e.hopT > 0;
    let off;
    if (hopping && !e.sees) {
      off = 1;
    } else off = this._turnTo(e, yawTo, e.stagger > 0 ? 1.5 : 7, dt);
    // aim pitch at the chest
    const ty = (e.sees ? P.cam.y - 0.4 : e.lastKnown.y + 1.2) - (e.body.y + 1.35 * e.k);
    const tp = Math.atan2(ty, Math.max(0.5, Math.hypot(tx - e.body.x, tz - e.body.z)));
    e.pitch += (tp - e.pitch) * Math.min(1, dt * 8);
    const canFire = e.sees && e.reactT <= 0 && off < 0.3 && P.alive && e.stagger <= 0 && !e.relocating;
    if (e.sniper) this._snipe(e, dt, canFire);
    else if (canFire && !hopping) {
      if (e.burstLeft > 0) {
        e.shotCd -= dt;
        if (e.shotCd <= 0) {
          this._shoot(e);
          e.burstLeft--;
          e.shotCd += ew.interval;
          if (e.burstLeft === 0) {
            e.burstCd = rand(ew.pause[0], ew.pause[1]);
            if (R.coverHop && !e.perch && Math.random() < 0.65) this._coverHop(e);
          }
        }
      } else {
        e.burstCd -= dt;
        if (e.burstCd <= 0) {
          e.burstLeft = Math.round(rand(ew.burst[0], ew.burst[1]));
          e.shotCd = 0;
        }
      }
    }
    // commander relocating between stages: run to the new post
    if (e.relocating) {
      e.repathT -= dt;
      if (!e.path && !e.goal) this._pathTo(e, e.post);
      const r = this._followPath(e, R.run * 1.1, dt);
      if (Math.hypot(e.body.x - e.post.x, e.body.z - e.post.z) < 1.2 || (!e.path && !e.goal)) { e.relocating = false; e.path = null; e.goal = null; }
      return r;
    }
    // lost sight -> chase last known position
    if (!e.sees && g.time - e.lastSeen > ENEMY.loseSightTime && !e.perch && !hopping) {
      if ((e.hold || R.boss) && Math.hypot(e.lastKnown.x - e.post.x, e.lastKnown.z - e.post.z) > (R.boss ? 16 : 12)) {
        e.lastKnown.copy(e.post);
        this._startSearch(e);
        return [0, 0, 0];
      }
      e.state = 'chase';
      e.repathT = 0;
      e.path = null;
      return [0, 0, 0];
    }
    if (e.perch) return [0, 0, 0];
    // changing cover (rifle): run to the chosen spot
    if (hopping) {
      e.hopT -= dt;
      const r = this._followPath(e, R.run, dt);
      if ((!e.path || e.pathIdx >= e.path.length) && !e.goal) { e.hop = null; e.hopT = 0; }
      if (e.hopT <= 0) e.hop = null;
      return r;
    }
    // strafe, keep a comfortable distance
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      const r = Math.random();
      e.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
      e.strafeT = rand(0.8, 2.0);
    }
    const inv = 1 / Math.max(distP, 0.01);
    const nx = dxp * inv, nz = dzp * inv;
    let vx = -nz * e.strafeDir * R.strafe, vz = nx * e.strafeDir * R.strafe;
    const pref = R.pref;
    const leash = R.boss ? 9 : 7;
    const leashed = (e.hold || R.boss) && Math.hypot(e.body.x - e.post.x, e.body.z - e.post.z) > leash;
    if ((!e.sees || distP > pref[1]) && !leashed) {
      // move up toward the player along the nav graph
      e.repathT -= dt;
      if (e.repathT <= 0 || !e.path) this._pathTo(e, e.lastKnown);
      const [px, pz] = this._followPath(e, R.run * (R.approach || R.aggressive ? 0.95 : 0.8), dt);
      vx = px + vx * 0.3; vz = pz + vz * 0.3;
    } else if (distP < pref[0]) {
      vx -= nx * R.strafe; vz -= nz * R.strafe;
    } else if (R.approach && e.sees && distP > pref[0] + 1) {
      vx += nx * R.run * 0.6; vz += nz * R.run * 0.6;
    }
    if (e.burstLeft > 0) { const k = R.aggressive ? 0.8 : 0.45; vx *= k; vz *= k; }
    // don't strafe off ledges / into walls: probe ahead
    const sp = Math.hypot(vx, vz);
    if (sp > 0.1) {
      const w2 = g.world;
      const px = e.body.x + (vx / sp) * 0.7, pz = e.body.z + (vz / sp) * 0.7;
      if (w2.groundBelow(px, pz, 0.2, e.body.y + 0.3, 0.6) === null || w2.overlaps(px, pz, 0.3, e.body.y + 0.4, e.body.y + 1.6)) {
        e.strafeDir = -e.strafeDir;
        e.strafeT = rand(0.6, 1.2);
        vx *= -0.5; vz *= -0.5;
      }
    }
    return [vx, vz, sp];
  }

  // Rifle: after a burst, move to a nearby spot with low cover toward the
  // player (blocked at crouch height, clear at head height).
  _coverHop(e) {
    const g = this.game;
    const nav = g.nav;
    const P = g.player;
    const b = e.body;
    const list = nav.near(b.x, b.z, 8, []);
    let best = null, bestS = -Infinity;
    let checks = 0;
    for (const n of list) {
      if (Math.abs(n.y - b.y) > 0.5) continue;
      const d = Math.hypot(n.x - b.x, n.z - b.z);
      if (d < 2.5 || d > 8) continue;
      const dp = Math.hypot(n.x - P.x, n.z - P.z);
      if (dp < e.R.pref[0] || dp > e.R.pref[1] + 6) continue;
      if (e.hold && Math.hypot(n.x - e.post.x, n.z - e.post.z) > 7) continue;
      if (++checks > 10) break;
      const low = !g.world.clear(n.x, n.y + 0.9, n.z, P.cam.x, P.cam.y - 0.3, P.cam.z, BULLET);
      const high = g.world.clear(n.x, n.y + 1.6, n.z, P.cam.x, P.cam.y, P.cam.z, SIGHT);
      const s = (low ? 3 : 0) + (high ? 1.5 : -2) - Math.abs(dp - (e.R.pref[0] + e.R.pref[1]) / 2) * 0.05 + Math.random();
      if (s > bestS) { bestS = s; best = n; }
    }
    if (!best || bestS < 1) return;
    e.hop = best;
    e.hopT = 3;
    this._pathTo(e, new THREE.Vector3(best.x, best.y, best.z));
  }

  // Sniper: laser tracks for ~0.8 s, holds still for the last 0.25 s, fires.
  _snipe(e, dt, canFire) {
    const g = this.game;
    const P = g.player;
    const s = e.snipe;
    const target = _v3.set(P.cam.x, P.cam.y - 0.42, P.cam.z);
    switch (s.phase) {
      case 'ready':
        s.on = false;
        if (canFire) {
          s.phase = 'aim'; s.t = 0; s.lost = 0;
          // start a little off target and sweep in
          s.aim.copy(target).add(_v.set(rand(-1.5, 1.5), rand(-0.5, 1), rand(-1.5, 1.5)));
          g.audio.play('laser', this._spatial(e, 0.5));
        }
        break;
      case 'aim':
      case 'lock': {
        s.on = true;
        s.t += dt;
        if (!e.sees) s.lost += dt; else s.lost = 0;
        if (s.lost > 0.35 || e.stagger > 0) { s.phase = 'cool'; s.t = 0.6; s.on = false; break; }
        if (s.phase === 'aim') {
          s.aim.lerp(target, Math.min(1, dt * 7));
          if (s.t >= SNIPER.aim - SNIPER.lock) s.phase = 'lock';
        } else if (s.t >= SNIPER.aim) {
          this._shoot(e, s.aim);
          s.phase = 'cool';
          s.t = SNIPER.cooldown * g.diff.react;
          s.on = false;
        }
        break;
      }
      case 'cool':
        s.on = false;
        s.t -= dt;
        if (s.t <= 0) s.phase = 'ready';
        break;
      default: s.phase = 'ready';
    }
    if (s.on) {
      // the line ends where it hits something (or the player)
      const m = this._muzzle(e, this.tmp[14]);
      const dir = _v.subVectors(s.aim, m);
      const len = dir.length();
      dir.divideScalar(len || 1);
      const hit = { t: 0 };
      let L = len + 0.4;
      if (g.world.raycast(m.x, m.y, m.z, dir.x, dir.y, dir.z, L, SIGHT, hit)) L = hit.t;
      s.end.copy(m).addScaledVector(dir, L);
    }
  }

  _shoot(e, aimAt = null) {
    const g = this.game;
    const P = g.player;
    const w = WEAPONS[e.weapon];
    const ew = w.enemy;
    const muzzle = this._muzzle(e, _v3).clone();
    const target = aimAt ? _v.copy(aimAt) : _v.set(P.cam.x, P.cam.y - 0.42, P.cam.z);
    const dir = new THREE.Vector3().subVectors(target, muzzle).normalize();
    const settle = 1.7 - 0.7 * Math.min(1, e.aimTime / 1.6);
    const moving = Math.min(1, Math.hypot(P.body.vx, P.body.vz) / 4);
    const acc = e.R.accuracy || 1;
    let spread = (e.sniper ? SNIPER.spread : ew.spread * acc * settle * (1 + moving * 0.35)) * g.diff.spread;
    const speed = (e.sniper ? SNIPER.speed : ew.speed) * g.diff.bulletSpeed;
    const dmg = (e.sniper ? SNIPER.damage : ew.damage) * g.diff.damage * (e.R.boss ? 1.15 : 1);
    const pellets = ew.pellets || 1;
    if (pellets > 1) spread = ew.spread * g.diff.spread;
    const right = _v2.set(-dir.z, 0, dir.x).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    for (let i = 0; i < pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const d = dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      g.bullets.fireEnemy(muzzle.x + d.x * 0.05, muzzle.y + d.y * 0.05, muzzle.z + d.z * 0.05, d.x, d.y, d.z, speed, dmg, e);
    }
    e.kick = 1;
    g.fx.enemyFlash(muzzle.x + dir.x * 0.06, muzzle.y + dir.y * 0.06, muzzle.z + dir.z * 0.06, e.weapon === 'shotgun' || e.weapon === 'revolver' ? 0.24 : 0.18);
    const sp = this._spatial(e, e.sniper ? 1.0 : 0.8);
    g.audio.play(w.sound, { ...sp, rate: (e.sniper ? 0.8 : 0.9) + Math.random() * 0.1 });
  }

  _spatial(e, base) {
    return this.game.spatialAt(e.body.x, e.body.y + 1.4, e.body.z, base);
  }

  _muzzle(e, out) {
    const m = this._gunMatrix(e, _m2);
    return out.copy(GUN_INFO[e.weapon].muzzle).applyMatrix4(m);
  }

  _pathTo(e, target) {
    const nav = this.game.nav;
    e.repathT = 1.4 + Math.random() * 0.4;
    const b = e.body;
    const start = nav.nearest(b.x, b.y, b.z);
    const goal = nav.nearest(target.x, target.y, target.z, false);
    e.goal = new THREE.Vector3(target.x, target.y, target.z);
    const p = start && goal ? nav.path(start, goal) : null;
    if (p) {
      e.path = [{ node: start, door: null }, ...p];
      e.pathIdx = e.path.length > 1 && Math.hypot(b.x - start.x, b.z - start.z) < 1.2 ? 1 : 0;
    } else {
      e.path = null;
    }
  }

  _followPath(e, speed, dt) {
    const b = e.body;
    let tx, tz, door = null;
    for (let guard = 0; guard < 8; guard++) {
      if (e.path && e.pathIdx < e.path.length) {
        const step = e.path[e.pathIdx];
        tx = step.node.x; tz = step.node.z;
        door = step.door;
        if (Math.hypot(tx - b.x, tz - b.z) < 0.55 && Math.abs(step.node.y - b.y) < 0.8) { e.pathIdx++; continue; }
      } else if (e.goal) {
        tx = e.goal.x; tz = e.goal.z;
        if (Math.hypot(tx - b.x, tz - b.z) < 0.5) { e.goal = null; return [0, 0, 0]; }
      } else return [0, 0, 0];
      break;
    }
    if (tx === undefined) return [0, 0, 0];
    // doors on the way: open them ourselves
    if (door && !door.isOpen && !door.locked && door.distanceTo(b.x, b.z) < 1.5) {
      door.open(b.x, b.z);
      this.game.audio.play('doorOpen', this._spatial(e, 0.6));
      e.doorWait = 0.35;
    }
    if (e.doorWait > 0) { e.doorWait -= dt; speed *= 0.2; }
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.hypot(dx, dz) || 1;
    if (e.state !== 'combat' || (e.hop && !e.sees) || e.relocating) this._turnTo(e, Math.atan2(-dx, -dz), 6, dt);
    return [(dx / d) * speed, (dz / d) * speed, speed];
  }

  _openBlockingDoor(e, vx, vz) {
    const b = e.body;
    const sp = Math.hypot(vx, vz) || 1;
    const px = b.x + (vx / sp) * 0.6, pz = b.z + (vz / sp) * 0.6;
    for (const d of this.game.doors) {
      if (!d.isOpen && !d.locked && Math.abs(d.y0 - b.y) < 1 && d.distanceTo(px, pz) < 0.6) {
        d.open(b.x, b.z);
        this.game.audio.play('doorOpen', this._spatial(e, 0.6));
      }
    }
  }

  _patrol(e, dt) {
    const pts = e.spawn.patrol;
    if (e.waitT > 0) {
      e.waitT -= dt;
      return [0, 0, 0];
    }
    const [px, pz] = pts[e.patrolIdx % pts.length];
    const b = e.body;
    if (Math.hypot(px - b.x, pz - b.z) < 0.8) {
      e.patrolIdx++;
      e.waitT = rand(1.0, 2.2);
      e.path = null;
      return [0, 0, 0];
    }
    if (!e.path || e.repathT <= 0) this._pathTo(e, new THREE.Vector3(px, e.post.y, pz));
    e.repathT -= dt;
    return this._followPath(e, e.R.walk, dt);
  }

  _startSearch(e) {
    e.state = 'search';
    e.searchT = ENEMY.searchTime * rand(0.8, 1.2);
    e.path = null;
    e.goal = null;
    e.hop = null;
    e.searchWait = 0;
    e.awareness = 0.5;
  }

  _search(e, dt) {
    e.searchT -= dt;
    if (e.searchT <= 0) {
      e.state = 'return';
      e.awareness = 0;
      this._pathTo(e, e.post);
      return [0, 0, 0];
    }
    if (e.searchWait > 0) {
      e.searchWait -= dt;
      e.idleT += dt;
      this._turnTo(e, e.yaw + Math.sin(e.idleT * 2.2) * 1.2, 2.5, dt);
      return [0, 0, 0];
    }
    if ((!e.path || e.pathIdx >= e.path.length) && !e.goal) {
      const nav = this.game.nav;
      const R = e.hold ? 5 : 9;
      const near = nav.near(e.lastKnown.x, e.lastKnown.z, R, []).filter((n) => Math.abs(n.y - e.lastKnown.y) < 1 && Math.hypot(n.x - e.lastKnown.x, n.z - e.lastKnown.z) < R);
      if (near.length) {
        const n = near[Math.floor(Math.random() * near.length)];
        this._pathTo(e, new THREE.Vector3(n.x, n.y, n.z));
      }
      e.searchWait = rand(0.8, 1.8);
      return [0, 0, 0];
    }
    return this._followPath(e, e.R.walk * 1.3, dt);
  }

  // Civilians keep their hands up; once freed they follow the player or
  // walk to a destination.
  _civilian(e, dt) {
    const P = this.game.player;
    const b = e.body;
    if (e.dest) {
      e.repathT -= dt;
      if (!e.path && !e.goal) this._pathTo(e, e.dest);
      const r = this._followPath(e, e.R.run, dt);
      if (Math.hypot(b.x - e.dest.x, b.z - e.dest.z) < 1) { e.dest = null; e.path = null; e.goal = null; }
      return r;
    }
    if (e.follow) {
      const d = Math.hypot(P.x - b.x, P.z - b.z);
      if (d > 3.2 || Math.abs(P.y - b.y) > 1.5) {
        e.repathT -= dt;
        if (e.repathT <= 0 || !e.path) this._pathTo(e, new THREE.Vector3(P.x, P.y, P.z));
        return this._followPath(e, d > 7 ? e.R.run : e.R.walk * 1.6, dt);
      }
      e.path = null; e.goal = null;
      this._turnTo(e, Math.atan2(-(P.x - b.x), -(P.z - b.z)), 3, dt);
      return [0, 0, 0];
    }
    // waiting: glance at the player when close
    e.idleT += dt;
    const d = Math.hypot(P.x - b.x, P.z - b.z);
    if (d < 8) this._turnTo(e, Math.atan2(-(P.x - b.x), -(P.z - b.z)), 2, dt);
    else this._turnTo(e, e.postYaw + Math.sin(e.idleT * 0.5) * 0.4, 1, dt);
    return [0, 0, 0];
  }

  freeCivilians(dest = null) {
    for (const e of this.list) {
      if (!e.alive || !e.civilian) continue;
      e.follow = true;
      if (dest) e.dest = new THREE.Vector3(dest[0], dest[1], dest[2]);
    }
  }

  _separate(e) {
    const b = e.body;
    for (const o of this.list) {
      if (o === e || !o.alive) continue;
      const dx = b.x - o.body.x, dz = b.z - o.body.z;
      const d2 = dx * dx + dz * dz;
      const rr = (b.r + o.body.r) * 1.15;
      if (d2 < rr * rr && d2 > 1e-6 && Math.abs(b.y - o.body.y) < 1) {
        const d = Math.sqrt(d2);
        b.vx += (dx / d) * 1.5; b.vz += (dz / d) * 1.5;
      }
    }
    const P = this.game.player;
    const dx = b.x - P.x, dz = b.z - P.z;
    const d = Math.hypot(dx, dz);
    if (d < b.r + 0.35 && d > 1e-4 && Math.abs(b.y - P.y) < 1.5) { b.vx += (dx / d) * 2.5; b.vz += (dz / d) * 2.5; }
  }

  // ------------------------------------------------------------------ pose
  _pose(e, dt) {
    const b = e.body;
    const k = e.k;
    const fwd = _v.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    const fx = fwd.x, fz = fwd.z;
    const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
    const combat = !e.civilian && (e.state === 'combat' || (e.state === 'chase' && e.moveSpeed < 1));
    e.aimBlend += ((combat && !e.relocating ? 1 : 0) - e.aimBlend) * Math.min(1, dt * 6);
    const a = e.aimBlend;
    const moveAmt = Math.min(1, e.moveSpeed / (3 * k));
    const ph = e.walkPhase;
    const bob = -Math.abs(Math.sin(ph)) * 0.035 * moveAmt;
    const L = (x, y, z, out) => out.set(b.x + (rx * x + fx * z) * k, b.y + y * k, b.z + (rz * x + fz * z) * k);
    const j = e.joints;
    const lean = a * 0.03 + moveAmt * 0.04 + (e.stagger > 0 && e.R.stagger ? -0.12 : 0);
    L(0, 0.95 + bob, 0, j[J.pelvis]);
    L(0, 1.42 + bob, lean, j[J.chest]);
    L(0, 1.47 + bob, lean + 0.01, j[J.neck]);
    L(0, 1.63 + bob, lean + 0.02, j[J.head]);
    L(-0.19, 1.39 + bob, lean, j[J.sl]);
    L(0.19, 1.39 + bob, lean, j[J.sr]);
    L(-0.1, 0.92 + bob, 0, j[J.hipl]);
    L(0.1, 0.92 + bob, 0, j[J.hipr]);
    for (const [side, knee, foot, off] of [[-1, J.kl, J.fl, 0], [1, J.kr, J.fr, Math.PI]]) {
      const p = ph + off;
      const th = Math.sin(p) * 0.5 * moveAmt;
      const bend = (0.15 + Math.max(0, -Math.cos(p)) * 0.75) * moveAmt;
      const ky = 0.92 + bob - 0.45 * Math.cos(th), kz = 0.45 * Math.sin(th);
      L(side * 0.105, ky, kz, j[knee]);
      L(side * 0.1, ky - 0.45 * Math.cos(th - bend), kz + 0.45 * Math.sin(th - bend), j[foot]);
      if (j[foot].y < b.y + 0.04) j[foot].y = b.y + 0.04;
    }
    // hands: low ready <-> aiming, rotated by aim pitch; arms fly up when hit
    const pitch = e.pitch * a;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (y, z) => [1.36 + (y - 1.36) * cp + z * sp, -(y - 1.36) * sp + z * cp];
    const kick = e.kick * 0.04;
    const [ry, rzz] = rot(1.33, 0.34 - kick);
    const [ly, lz] = rot(1.31, 0.56 - kick);
    const pistol = e.weapon && WEAPONS[e.weapon].slot === 'side';
    const lowR = [0.15, 1.02, 0.24], lowL = pistol ? [-0.2, 0.95, 0.1] : [-0.03, 1.1, 0.4];
    const aimR = [0.07, ry + bob, rzz + lean], aimL = pistol ? [0.03, ry - 0.03 + bob, rzz - 0.06 + lean] : [-0.01, ly + bob, lz + lean];
    const upR = [0.27, 2.02, 0.08], upL = [-0.27, 2.02, 0.08];
    const hu = Math.max(e.hitUp, e.handsUp);
    const h = hu * hu * (3 - 2 * hu);
    const mix = (lo, am, upv) => lo.map((v, i) => (v + (am[i] - v) * a) * (1 - h) + upv[i] * h);
    const Rh = mix(lowR, aimR, upR), Lh = mix(lowL, aimL, upL);
    L(Rh[0], Rh[1], Rh[2], j[J.hr]);
    L(Lh[0], Lh[1], Lh[2], j[J.hl]);
    const pole = this.tmp[0];
    pole.set(rx * 0.8 - fx * 0.2, -1, rz * 0.8 - fz * 0.2).normalize();
    solveElbow(j[J.sr], j[J.hr], 0.3 * k, 0.29 * k, pole, j[J.er]);
    pole.set(-rx * 0.8 - fx * 0.2, -1, -rz * 0.8 - fz * 0.2).normalize();
    solveElbow(j[J.sl], j[J.hl], 0.3 * k, 0.29 * k, pole, j[J.el]);
    e.face.set(fx, 0, fz);
  }

  _gunMatrix(e, out) {
    const j = e.joints;
    const hand = j[J.hr];
    const fwd = this.tmp[1].set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    const a = e.aimBlend;
    const pitch = e.pitch * a - (1 - a) * 0.45;
    const dir = this.tmp[2].set(fwd.x * Math.cos(pitch), Math.sin(pitch), fwd.z * Math.cos(pitch));
    const h = e.hitUp;
    if (h > 0) dir.lerp(this.tmp[3].set(fwd.x * 0.3, 1, fwd.z * 0.3), h * 0.8).normalize();
    const target = this.tmp[4].copy(hand).add(dir);
    out.lookAt(hand, target, UP);
    out.setPosition(hand);
    if (e.k !== 1) out.scale(_s.set(e.k, e.k, e.k));
    return out;
  }

  // ------------------------------------------------------------------ damage
  // Ray against alive hostiles: head sphere, vest box, torso/limb capsules.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = null;
    for (const e of this.list) {
      if (!e.alive || e.civilian) continue;
      const b = e.body;
      const cx = b.x - ox, cz = b.z - oz;
      const tc = cx * dx + cz * dz;
      const px = ox + dx * tc - b.x, pz = oz + dz * tc - b.z;
      if (tc < -1 || px * px + pz * pz > 1.2 * e.k * e.k) continue;
      const j = e.joints;
      const k = e.k, th = e.thick;
      const tHead = raySphere(ox, oy, oz, dx, dy, dz, j[J.head], 0.18 * k);
      if (tHead >= 0 && tHead < best) { best = tHead; hit = { enemy: e, part: 'head', t: tHead }; }
      const caps = [[J.pelvis, J.neck, (e.R.vest ? 0.2 : 0.15) * k], [J.sl, J.el, 0.075 * th], [J.el, J.hl, 0.07 * th], [J.sr, J.er, 0.075 * th], [J.er, J.hr, 0.07 * th],
        [J.hipl, J.kl, 0.085 * th], [J.kl, J.fl, 0.075 * th], [J.hipr, J.kr, 0.085 * th], [J.kr, J.fr, 0.075 * th]];
      for (let c = 0; c < caps.length; c++) {
        const [p, q, r] = caps[c];
        const t = rayCapsule(ox, oy, oz, dx, dy, dz, j[p], j[q], r);
        if (t >= 0 && t < best) { best = t; hit = { enemy: e, part: c === 0 && e.R.vest ? 'vest' : 'body', t }; }
      }
    }
    if (hit) hit.point = new THREE.Vector3(ox + dx * hit.t, oy + dy * hit.t, oz + dz * hit.t);
    return hit;
  }

  // Returns {killed, head, vest}.
  damage(e, amount, part, point, dir, src = 'player') {
    if (!e.alive || e.civilian) return { killed: false };
    const g = this.game;
    const head = part === 'head';
    const vest = part === 'vest';
    let dmg = amount * (head ? HEADSHOT_MULT : vest ? 0.7 : 1);
    if (e.relocating) dmg *= 0.5;
    e.health -= dmg;
    if (vest) {
      g.fx.impact(point.x, point.y, point.z, -dir.x, -dir.y, -dir.z, false, 0.7);
      g.audio.play('ricochet', { gain: 0.35, rate: rand(0.9, 1.15) });
    } else {
      g.fx.bloodSpray(point.x, point.y, point.z, dir.x, dir.y, dir.z, head ? 1.3 : 1);
      if (src === 'player') g.audio.play(head ? 'headshot' : 'flesh', { gain: 0.6 });
    }
    // hit reactions: heavies only stagger after repeated hits, then shrug
    // hits off for a while so they can't be stun-locked
    if (e.R.stagger) {
      e.staggerAcc += dmg;
      if (e.staggerAcc > 100 * (e.R.boss ? 1.6 : 1) && e.staggerCd <= 0) {
        e.stagger = 0.75;
        e.hitUp = 0.8;
        e.staggerCd = 3.4;
        e.staggerAcc = 0;
        e.burstLeft = 0;
        e.snipe.phase = 'ready';
        g.audio.play('grunt', this._spatial(e, 0.6));
      } else e.hitUp = Math.max(e.hitUp, 0.12);
    } else {
      e.hitUp = 1;
      e.stagger = 0.25;
    }
    if (e.health <= 0) {
      this._kill(e, dir, point, head);
      return { killed: true, head, vest };
    }
    if (e.R.boss) this._bossStage(e);
    if (src === 'player' || src === 'blast') {
      const P = g.player;
      e.lastKnown.set(P.x, P.y, P.z);
      e.lastSeen = g.time;
      if (e.state !== 'combat') {
        this._enterCombat(e, true);
        this._turnTo(e, Math.atan2(-(P.x - e.body.x), -(P.z - e.body.z)), 2.5, 0.2);
      }
    }
    return { killed: false, head, vest };
  }

  // Commander: at 2/3 and 1/3 health he falls back to a new position, swaps
  // weapon and calls for help (the level's mission script adds the wave).
  _bossStage(e) {
    const f = e.health / e.maxHealth;
    const want = f < 0.34 ? 2 : f < 0.67 ? 1 : 0;
    if (want <= e.stage) return;
    e.stage = want;
    const st = (e.spawn.stages || [])[want - 1];
    if (st) {
      e.post.set(st.x, st.y, st.z);
      if (st.yaw !== undefined) e.postYaw = st.yaw;
      if (st.weapon) e.weapon = st.weapon;
      e.relocating = true;
      e.path = null; e.goal = null; e.hop = null;
      e.burstLeft = 0;
      e.burstCd = 1.2;
    }
    this.game.audio.play('alert', this._spatial(e, 0.6));
    if (this.game.mission) this.game.mission.onBossStage(e, want);
  }

  // Area damage (explosions). Kills count for the player.
  blast(x, y, z, r, dmg) {
    for (const e of this.list) {
      if (!e.alive || e.civilian) continue;
      const cx = e.body.x, cy = e.body.y + 1.1 * e.k, cz = e.body.z;
      const d = Math.hypot(cx - x, cy - y, cz - z);
      if (d > r) continue;
      if (!this.game.world.clear(x, y, z, cx, cy, cz, BULLET)) continue;
      const dir = _v.set(cx - x, cy - y + 1, cz - z).normalize().clone();
      this.damage(e, dmg * (1 - d / r * 0.7), 'body', new THREE.Vector3(cx, cy, cz), dir, 'blast');
    }
  }

  // Cylinder hazard (steam): damage is already scaled by dt.
  hazard(x, y, z, r, h, dmg) {
    for (const e of this.list) {
      if (!e.alive || e.civilian) continue;
      const b = e.body;
      if (b.y > y + h || b.y + b.h < y || Math.hypot(b.x - x, b.z - z) > r + b.r) continue;
      this._hurt(e, dmg);
    }
  }

  // Box hazard (press head coming down).
  hazardBox(x0, z0, x1, z1, yLow, yHead, dmg) {
    for (const e of this.list) {
      if (!e.alive || e.civilian) continue;
      const b = e.body;
      if (b.x + b.r < x0 || b.x - b.r > x1 || b.z + b.r < z0 || b.z - b.r > z1) continue;
      if (b.y > yHead || b.y + b.h < yLow) continue;
      this._hurt(e, dmg);
    }
  }

  _hurt(e, dmg) {
    e.health -= dmg;
    if (e.health <= 0) {
      const p = e.joints[J.chest];
      this._kill(e, _v.set(0, 1, 0).clone(), p.clone(), false, 'hazard');
    } else if (e.state !== 'combat' && e.state !== 'chase') {
      const P = this.game.player;
      this.alert(e, P.x, P.y, P.z, false);
    }
  }

  _kill(e, dir, point, head, cause = 'player') {
    const g = this.game;
    e.alive = false;
    e.state = 'dead';
    e.deathT = 0;
    e.health = 0;
    e.snipe.on = false;
    if (this.boss === e) this.boss = null;
    const k = e.k;
    const pts = e.joints.map((p) => p.clone());
    const prev = pts.map((p) => p.clone());
    const vx = e.body.vx / 120, vz = e.body.vz / 120;
    const push = (head ? 0.016 : 0.012) / k;
    for (let i = 0; i < pts.length; i++) {
      prev[i].x -= vx + dir.x * push * 0.5;
      prev[i].z -= vz + dir.z * push * 0.5;
    }
    let hi = 0, hd = Infinity;
    pts.forEach((p, i) => { const d = p.distanceToSquared(point); if (d < hd) { hd = d; hi = i; } });
    prev[hi].addScaledVector(dir, -0.02 / k);
    prev[J.kl].addScaledVector(e.face, -0.02);
    prev[J.kr].addScaledVector(e.face, -0.02);
    const rest = STICKS.map(([a, b]) => pts[a].distanceTo(pts[b]));
    e.ragdoll = { pts, prev, rest, t: 0, sleep: false };
    // drop the gun with some ammo in it
    if (e.weapon) {
      const w = WEAPONS[e.weapon];
      const tier = g.diff.pickupTier || 2;
      const mag = Math.max(1, Math.round(w.mag * rand(0.5, 1)));
      const reserve = Math.round(w.mag * (0.25 + 0.25 * tier));
      const hand = e.joints[J.hr];
      g.items.drop(e.weapon, mag, reserve, hand.x, hand.y, hand.z, e.yaw + rand(-1, 1), true);
    }
    g.onEnemyKilled(e, head, cause);
  }

  _updateDead(e, dt) {
    const r = e.ragdoll;
    if (!r) return;
    e.deathT += dt;
    if (!e.pooled && e.deathT > 0.7) {
      e.pooled = true;
      const p = r.pts[J.pelvis];
      const gy = this.game.world.heightAt(p.x, p.z, p.y + 0.2);
      if (this.game.quality.decals > 0.3) this.game.fx.pool(p.x, gy, p.z, (0.45 + Math.random() * 0.25) * e.k);
    }
    if (r.sleep) return;
    r.t += dt;
    const steps = Math.max(1, Math.round(dt / (1 / 120)));
    const h = dt / steps;
    const world = this.game.world;
    const pc = r.pts[J.pelvis];
    const cols = world.gather(pc.x - 2, pc.z - 2, pc.x + 2, pc.z + 2, []).filter((c) => c.f & MOVE);
    let motion = 0;
    const k = e.k;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < r.pts.length; i++) {
        const p = r.pts[i], q = r.prev[i];
        const vx = (p.x - q.x) * 0.992, vy = (p.y - q.y) * 0.992, vz = (p.z - q.z) * 0.992;
        q.copy(p);
        p.x += vx; p.y += vy - GRAVITY * 0.8 * h * h; p.z += vz;
        motion = Math.max(motion, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
      }
      for (let it = 0; it < 6; it++) {
        for (let n = 0; n < STICKS.length; n++) {
          const [a, b] = STICKS[n];
          const pa = r.pts[a], pb = r.pts[b];
          const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = ((d - r.rest[n]) / d) * 0.5;
          pa.x += dx * diff; pa.y += dy * diff; pa.z += dz * diff;
          pb.x -= dx * diff; pb.y -= dy * diff; pb.z -= dz * diff;
        }
        for (let i = 0; i < r.pts.length; i++) this._collidePoint(r.pts[i], r.prev[i], P_RADIUS[i] * k, cols);
      }
    }
    if (r.t > 1.2 && motion < 0.0008) r.sleepT = (r.sleepT || 0) + dt; else r.sleepT = 0;
    if (r.sleepT > 0.4 || r.t > 6) r.sleep = true;
    for (let i = 0; i < 16; i++) e.joints[i].copy(r.pts[i]);
  }

  _collidePoint(p, q, rad, cols) {
    let floor = p.y >= -0.01 ? 0 : -Infinity;
    for (const c of cols) {
      if (p.x < c.x0 - rad || p.x > c.x1 + rad || p.z < c.z0 - rad || p.z > c.z1 + rad) continue;
      if (p.y - rad > c.y1 || p.y + rad < c.y0) continue;
      const inside = p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1;
      if (inside && q.y - rad >= c.y1 - 0.05) { floor = Math.max(floor, c.y1); continue; }
      if (inside && p.y - rad < c.y1 && c.y1 - (p.y - rad) < 0.12) { floor = Math.max(floor, c.y1); continue; }
      const pl = p.x - (c.x0 - rad), pr = c.x1 + rad - p.x, pb = p.z - (c.z0 - rad), pf = c.z1 + rad - p.z;
      const m = Math.min(pl, pr, pb, pf);
      if (m === pl) p.x -= pl; else if (m === pr) p.x += pr; else if (m === pb) p.z -= pb; else p.z += pf;
    }
    if (p.y - rad < floor) {
      p.y = floor + rad;
      q.x += (p.x - q.x) * 0.35;
      q.z += (p.z - q.z) * 0.35;
      if (q.y < p.y - 0.02) q.y = p.y - 0.02;
    }
  }

  // ------------------------------------------------------------------ checkpoints
  // Alive enemies and freed civilians at the moment a checkpoint activates.
  save() {
    return this.list.filter((e) => e.alive).map((e) => ({
      spawn: e.spawn, x: e.body.x, y: e.body.y, z: e.body.z, yaw: e.yaw,
      post: [e.post.x, e.post.y, e.post.z], postYaw: e.postYaw, weapon: e.weapon, stage: e.stage,
      health: e.health, maxHealth: e.maxHealth, follow: e.follow, dest: e.dest ? [e.dest.x, e.dest.y, e.dest.z] : null,
    }));
  }

  // Put back the enemies that were still alive, calm, at their posts (or
  // where they were, for reinforcements without one).
  restore(saved) {
    this.clear();
    for (const s of saved) {
      const sp = s.spawn.dynamic || s.stage ? { ...s.spawn, x: s.x, y: s.y, z: s.z, yaw: s.yaw } : s.spawn;
      const e = this._add(this._make(sp));
      e.post.set(s.post[0], s.post[1], s.post[2]);
      e.postYaw = s.postYaw;
      e.weapon = s.weapon;
      e.stage = s.stage;
      if (e.R.boss) { e.health = s.health; e.maxHealth = s.maxHealth; }
      e.follow = s.follow;
      if (s.dest) e.dest = new THREE.Vector3(s.dest[0], s.dest[1], s.dest[2]);
      if (e.civilian && e.follow) { e.body.x = s.x; e.body.y = s.y; e.body.z = s.z; }
      this._pose(e, 1);
    }
  }

  // ------------------------------------------------------------------ render
  render() {
    const g = this.game;
    const n = this.list.length;
    const neo = g.style === 'neo';
    let nv = 0, nc = 0, nl = 0;
    for (let i = 0; i < n; i++) {
      const e = this.list[i];
      const j = e.joints;
      const th = e.thick, k = e.k;
      for (let s = 0; s < LIMB_SEGS.length; s++) this.limbs.setMatrixAt(i * LIMBS + s, segMatrix(j[LIMB_SEGS[s][0]], j[LIMB_SEGS[s][1]], _m, th));
      const neckTop = this.tmp[5].copy(j[J.head]).lerp(j[J.neck], 0.4);
      this.limbs.setMatrixAt(i * LIMBS + 8, segMatrix(j[J.neck], neckTop, _m, th));
      this.torso.setMatrixAt(i * 2, segMatrix(j[J.pelvis], j[J.neck], _m, k > 1 ? 1.3 : 1));
      this.torso.setMatrixAt(i * 2 + 1, _m.copy(HIDE));
      for (let s = 0; s < JOINT_LIST.length; s++) {
        const p = j[JOINT_LIST[s]];
        _m.makeScale(th, th, th).setPosition(p);
        this.joints.setMatrixAt(i * JOINTS + s, _m);
      }
      _m.makeScale(1.85 * th, 1.85 * th, 1.85 * th).setPosition(j[J.pelvis]);
      this.joints.setMatrixAt(i * JOINTS + 12, _m);
      _m.makeScale(1.75 * th, 1.75 * th, 1.75 * th).setPosition(j[J.neck]);
      this.joints.setMatrixAt(i * JOINTS + 13, _m);
      _m.makeScale(k, k, k).setPosition(j[J.head]);
      this.heads.setMatrixAt(i, _m);
      // per-instance colour
      _c.setHex(e.civilian ? (neo ? 0x3f7cff : 0x8d929b) : neo ? 0x0c0c0c : 0x0a0a0a);
      for (let s = 0; s < LIMBS; s++) this.limbs.setColorAt(i * LIMBS + s, _c);
      this.torso.setColorAt(i * 2, _c); this.torso.setColorAt(i * 2 + 1, _c);
      for (let s = 0; s < JOINTS; s++) this.joints.setColorAt(i * JOINTS + s, _c);
      this.heads.setColorAt(i, _c);
      // one big eye on the face, pupil looking where they aim
      const up = this.tmp[7].subVectors(j[J.head], j[J.neck]).normalize();
      const face = this.tmp[6];
      if (e.alive) {
        const pitch = e.pitch * e.aimBlend * 0.6;
        face.set(e.face.x * Math.cos(pitch), Math.sin(pitch), e.face.z * Math.cos(pitch));
      } else {
        const side = this.tmp[8].subVectors(j[J.sr], j[J.sl]);
        face.crossVectors(up, side).normalize();
        if (face.lengthSq() < 0.5) face.set(0, 1, 0);
      }
      const eyePos = this.tmp[9].copy(j[J.head]).addScaledVector(face, 0.152 * k);
      eyePos.y += 0.035 * k;
      _q.setFromUnitVectors(this.tmp[10].set(0, 0, 1), face);
      _m.compose(eyePos, _q, _s.set(k, k, k));
      this.eyes.setMatrixAt(i, _m);
      const pupil = this.tmp[11].copy(eyePos).addScaledVector(face, 0.008);
      if (e.alive) {
        const P = g.player;
        const look = this.tmp[12].set(P.cam.x - eyePos.x, P.cam.y - eyePos.y, P.cam.z - eyePos.z).normalize();
        const lat = this.tmp[13].copy(look).addScaledVector(face, -look.dot(face));
        if (e.state !== 'idle' && e.state !== 'patrol') pupil.addScaledVector(lat, 0.03 * k);
      } else pupil.y -= 0.02;
      _m.compose(pupil, _q, _s.set(k, k, k));
      this.pupils.setMatrixAt(i, _m);
      // torso basis for vest / cap
      if (e.R.vest || e.R.cap) {
        const tUp = this.tmp[3].subVectors(j[J.neck], j[J.pelvis]).normalize();
        const tRight = this.tmp[4].subVectors(j[J.sr], j[J.sl]).normalize();
        const tFwd = this.tmp[15].crossVectors(tUp, tRight).normalize();
        const tX = tRight.crossVectors(tUp, tFwd).normalize();
        _m.makeBasis(tX, tUp, tFwd);
        if (e.R.vest && nv < MAX_E) {
          const c = _v3.copy(j[J.pelvis]).lerp(j[J.neck], 0.6);
          _m.scale(_s.set(k, k, k)).setPosition(c);
          this.vests.setMatrixAt(nv++, _m);
        }
        if (e.R.cap && nc < 8) {
          const hf = e.alive ? _v2.set(e.face.x, 0, e.face.z) : face;
          const hx = _v.crossVectors(up, hf).normalize();
          const hz = this.tmp[14].crossVectors(hx, up).normalize();
          _m.makeBasis(hx, up, hz);
          _m.scale(_s.set(k, k, k)).setPosition(_v3.copy(j[J.head]).addScaledVector(up, 0.1 * k));
          this.caps.setMatrixAt(nc++, _m);
        }
      }
      if (e.alive && e.weapon) g.items.pushGun(e.weapon, this._gunMatrix(e, _m));
      if (e.alive && e.snipe.on && nl < MAX_LASERS) {
        const m = this._muzzle(e, this.tmp[14]);
        const end = e.snipe.end;
        this.lasers.setMatrixAt(nl, segMatrix(m, end, _m, 1));
        _m.makeTranslation(end.x, end.y, end.z);
        this.laserDots.setMatrixAt(nl, _m);
        nl++;
      }
    }
    this.limbs.count = n * LIMBS;
    this.torso.count = n * 2;
    this.joints.count = n * JOINTS;
    this.heads.count = this.eyes.count = this.pupils.count = n;
    this.vests.count = this.vestHull.count = nv;
    this.caps.count = this.capHull.count = nc;
    this.lasers.count = this.laserDots.count = nl;
    for (const m of [this.limbs, this.torso, this.joints, this.heads, this.eyes, this.pupils, this.vests, this.caps, this.lasers, this.laserDots]) m.instanceMatrix.needsUpdate = true;
    for (const m of this.tinted) m.instanceColor.needsUpdate = true;
    for (const [r, src] of this.rims) r.count = src.count;
  }

  snapshot() {
    return this.list.map((e) => ({
      id: e.id, key: e.key, role: e.role, weapon: e.weapon, group: e.group, alive: e.alive, state: e.state, health: e.health,
      x: e.body.x, y: e.body.y, z: e.body.z, yaw: e.yaw, laser: e.snipe.on, stagger: e.stagger, stage: e.stage, civilian: e.civilian,
      joints: e.joints.map((p) => [p.x, p.y, p.z]),
    }));
  }
}

function raySphere(ox, oy, oz, dx, dy, dz, c, r) {
  const lx = ox - c.x, ly = oy - c.y, lz = oz - c.z;
  const b = lx * dx + ly * dy + lz * dz;
  const cc = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : cc < 0 ? 0 : -1;
}

function rayCapsule(ox, oy, oz, dx, dy, dz, a, b, r) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const wx = ox - a.x, wy = oy - a.y, wz = oz - a.z;
  const A = dx * dx + dy * dy + dz * dz, B = dx * ux + dy * uy + dz * uz, C = ux * ux + uy * uy + uz * uz;
  const D = dx * wx + dy * wy + dz * wz, E = ux * wx + uy * wy + uz * wz;
  const den = A * C - B * B;
  let s;
  let t = den > 1e-9 ? (A * E - B * D) / den : E / (C || 1);
  t = Math.max(0, Math.min(1, t));
  s = Math.max(0, (B * t - D) / A);
  const px = ox + dx * s - (a.x + ux * t), py = oy + dy * s - (a.y + uy * t), pz = oz + dz * s - (a.z + uz * t);
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  return Math.max(0, s - Math.sqrt(r * r - d2));
}
