// Stickman enemies: AI, procedural pose, Verlet ragdolls and dropped guns.
// All enemies share a handful of InstancedMeshes (limbs, torso, joints, head,
// eye, pupil, one per gun type) so ~16 of them cost ~14 draw calls.
//
// AI: idle/patrol -> awareness builds while they can see you -> combat (face
// you, aim, fire bursts, strafe) -> chase your last known position with
// waypoint A* (opening doors themselves) -> search the area -> return.
import * as THREE from 'three';
import { ENEMY, WEAPONS, SNIPER, HEADSHOT_MULT, GRAVITY } from './config.js';
import { SIGHT, MOVE } from './world.js';
import { GUN_INFO, mergedGunGeometry } from './guns.js';

const MAX_E = 24;
const MAX_PICKUPS = 40;
const LIMBS = 9;
const JOINTS = 14;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _s = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const GUN_IDS = ['smg', 'shotgun', 'rifle', 'pistol'];

const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

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

function segMatrix(a, b, out) {
  _v.subVectors(b, a);
  const len = _v.length();
  if (len < 1e-5) return out.copy(HIDE);
  _v.divideScalar(len);
  _q.setFromUnitVectors(UP, _v);
  return out.compose(_v2.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(1, len, 1));
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

function rimMaterial(base) {
  const m = base;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * 0.024;');
  };
  return m;
}

export class Enemies {
  constructor(game) {
    this.game = game;
    const mats = game.materials;
    const scene = game.scene;
    this.list = [];
    this.pickups = [];
    const bodyMat = mats.get('enemy');
    const rimMat = rimMaterial(mats.get('rim'));
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
    // white rim for the Neobrutalist style (hidden in Classic)
    this.rims = [];
    for (const src of [this.limbs, this.torso, this.joints, this.heads]) {
      const r = mk(src.geometry, rimMat, src.instanceMatrix.count, false);
      r.instanceMatrix = src.instanceMatrix;
      r.renderOrder = -1;
      this.rims.push([r, src]);
    }
    this.guns = {};
    for (const id of GUN_IDS) this.guns[id] = mk(mergedGunGeometry(id), mats.get('enemyGun'), MAX_E + MAX_PICKUPS);
    this.tmp = Array.from({ length: 16 }, () => new THREE.Vector3());
    this.hitInfo = {};
    this.alertCooldown = 0;
  }

  spawnAll(spawns) {
    this.list.length = 0;
    this.pickups.length = 0;
    spawns.forEach((sp, i) => this.list.push(this._make(sp, i)));
  }

  _make(sp, i) {
    const body = { x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, r: ENEMY.radius, h: ENEMY.height, grounded: true, stepH: 0.36, jumping: false };
    const e = {
      id: i, spawn: sp, body, yaw: sp.yaw, pitch: 0, weapon: sp.weapon, sniper: !!sp.sniper,
      alive: true, health: ENEMY.health, state: sp.patrol ? 'patrol' : 'idle',
      awareness: 0, sees: false, lastKnown: new THREE.Vector3(), lastSeen: -99, perceiveT: (i % 6) * 0.017,
      reactT: 0, burstLeft: 0, burstCd: 0, shotCd: 0, aimTime: 0, aimBlend: 0, hitUp: 0, stagger: 0, kick: 0,
      strafeDir: 0, strafeT: 0, path: null, pathIdx: 0, repathT: 0, goal: null,
      searchT: 0, patrolIdx: 0, waitT: 0, walkPhase: Math.random() * 6, moveSpeed: 0, idleT: Math.random() * 10,
      joints: Array.from({ length: 16 }, () => new THREE.Vector3()), face: new THREE.Vector3(0, 0, -1),
      ragdoll: null, deathT: 0, pooled: false, alerted: 0, suspicious: 0, stuckT: 0, lastPos: new THREE.Vector3(sp.x, sp.y, sp.z),
      doorWait: 0,
    };
    this._pose(e, 0);
    return e;
  }

  get alive() { return this.list.filter((e) => e.alive).length; }

  // ------------------------------------------------------------------ AI
  update(dt, active) {
    const g = this.game;
    const P = g.player;
    this.alertCooldown = Math.max(0, this.alertCooldown - dt);
    for (const e of this.list) {
      if (!e.alive) { this._updateDead(e, dt); continue; }
      e.hitUp = Math.max(0, e.hitUp - dt * 2.6);
      e.stagger = Math.max(0, e.stagger - dt);
      e.kick = Math.max(0, e.kick - dt * 12);
      let desiredX = 0, desiredZ = 0, speed = 0;
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
              // something's there: stop and turn toward it
              this._turnTo(e, Math.atan2(-dxp, -dzp), 2.0, dt);
              break;
            }
            if (e.state === 'patrol' && !e.sniper) {
              [desiredX, desiredZ, speed] = this._patrol(e, dt);
            } else if (e.state === 'search') {
              [desiredX, desiredZ, speed] = this._search(e, dt);
            } else if (e.state === 'return') {
              [desiredX, desiredZ, speed] = this._followPath(e, ENEMY.walk, dt);
              if (!e.path || e.pathIdx >= e.path.length) {
                if (Math.hypot(e.body.x - e.spawn.x, e.body.z - e.spawn.z) < 1) {
                  e.state = e.spawn.patrol ? 'patrol' : 'idle';
                  e.path = null;
                } else if (!e.goal) e.goal = new THREE.Vector3(e.spawn.x, e.spawn.y, e.spawn.z);
              }
            } else {
              // idle: look around slowly
              e.idleT += dt;
              const look = e.sniper ? Math.sin(e.idleT * 0.35 + e.id) * 0.9 : Math.sin(e.idleT * 0.3 + e.id) * 0.45;
              this._turnTo(e, e.spawn.yaw + look, 1.2, dt);
            }
            break;
          }
          case 'combat': {
            [desiredX, desiredZ, speed] = this._combat(e, dt, distP, dxp, dzp);
            break;
          }
          case 'chase': {
            if (e.sees) { this._enterCombat(e, true); break; }
            e.repathT -= dt;
            if (e.repathT <= 0 || !e.path) this._pathTo(e, e.lastKnown);
            [desiredX, desiredZ, speed] = this._followPath(e, ENEMY.run, dt);
            const dl = Math.hypot(e.body.x - e.lastKnown.x, e.body.z - e.lastKnown.z);
            if (dl < 1.3 || (!e.path && !e.goal)) this._startSearch(e);
            break;
          }
          default: break;
        }
      } else {
        e.idleT += dt;
        this._turnTo(e, e.spawn.yaw + Math.sin(e.idleT * 0.3 + e.id) * 0.4, 1.0, dt);
      }

      // steering + physics
      if (e.sniper) { desiredX = desiredZ = 0; speed = 0; }
      if (e.stagger > 0) { desiredX *= 0.3; desiredZ *= 0.3; }
      const b = e.body;
      const accel = 14 * dt;
      const ax = desiredX - b.vx, az = desiredZ - b.vz;
      const al = Math.hypot(ax, az);
      if (al <= accel) { b.vx = desiredX; b.vz = desiredZ; } else { b.vx += (ax / al) * accel; b.vz += (az / al) * accel; }
      this._separate(e);
      const x0 = b.x, z0 = b.z;
      if (!e.sniper) this.game.world.moveBody(b, dt, GRAVITY);
      const moved = Math.hypot(b.x - x0, b.z - z0);
      e.moveSpeed = moved / Math.max(dt, 1e-4);
      // stuck against something while trying to move? open doors / repath
      if (speed > 0.5 && e.moveSpeed < 0.25) {
        e.stuckT += dt;
        this._openBlockingDoor(e, desiredX, desiredZ);
        if (e.stuckT > 1.2) { e.stuckT = 0; e.repathT = 0; e.strafeDir = -e.strafeDir; e.path = null; }
      } else e.stuckT = 0;
      e.walkPhase += dt * Math.min(e.moveSpeed, 4) * 3.1;
      this._pose(e, dt);
    }
    this._updatePickups(dt);
  }

  _canSee(e) {
    const g = this.game;
    const P = g.player;
    const b = e.body;
    const ex = b.x, ey = b.y + ENEMY.eye, ez = b.z;
    const dx = P.cam.x - ex, dy = P.cam.y - ey, dz = P.cam.z - ez;
    const dist = Math.hypot(dx, dy, dz);
    const range = e.sniper ? ENEMY.sniperRange : ENEMY.viewRange;
    if (dist > range) return false;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const hd = Math.hypot(dx, dz) || 1;
    const dot = (dx * fx + dz * fz) / hd;
    const fov = e.state === 'combat' || e.state === 'chase' ? ENEMY.combatFovCos : e.sniper ? Math.cos(1.2) : ENEMY.fovCos;
    if (dot < fov && dist > 3.5) return false;
    const w = g.world;
    if (w.clear(ex, ey, ez, P.cam.x, P.cam.y - 0.05, P.cam.z, SIGHT)) return true;
    return w.clear(ex, ey, ez, P.cam.x, P.cam.y - 0.45, P.cam.z, SIGHT);
  }

  _enterCombat(e, fromChase = false) {
    const g = this.game;
    const wasCombat = e.state === 'combat';
    e.state = 'combat';
    e.awareness = 1;
    e.path = null;
    e.goal = null;
    if (!wasCombat) {
      e.reactT = (fromChase ? rand(0.2, 0.4) : rand(0.4, 0.8)) * g.diff.react;
      e.burstCd = e.reactT;
      e.burstLeft = 0;
      e.aimTime = 0;
      e.lastSeen = g.time;
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
      if (o === src || !o.alive || o.state === 'combat') continue;
      const d = Math.hypot(o.body.x - src.body.x, o.body.y - src.body.y, o.body.z - src.body.z);
      if (d > ENEMY.alertRange) continue;
      const clear = w.clear(src.body.x, src.body.y + 1.5, src.body.z, o.body.x, o.body.y + 1.5, o.body.z, SIGHT);
      if (clear || d < ENEMY.alertRangeWalled) this.alert(o, P.x, P.y, P.z);
    }
  }

  // Something told this enemy where the player is (gunfire, a shout).
  alert(e, x, y, z) {
    if (!e.alive || e.state === 'combat') return;
    e.lastKnown.set(x, y, z);
    e.awareness = 1;
    if (e.sniper) { e.state = 'combat'; e.reactT = rand(0.6, 1.0) * this.game.diff.react; e.burstCd = e.reactT; return; }
    e.state = 'chase';
    e.repathT = 0;
    e.path = null;
  }

  // Player gunfire: loud in the open, muffled through walls.
  hearShot(x, y, z) {
    const w = this.game.world;
    for (const e of this.list) {
      if (!e.alive || e.state === 'combat') continue;
      const d = Math.hypot(e.body.x - x, e.body.y - y, e.body.z - z);
      if (d > ENEMY.hearRange) continue;
      const clear = w.clear(e.body.x, e.body.y + 1.6, e.body.z, x, y, z, SIGHT);
      // through walls it carries less, through a floor/roof much less
      const walled = Math.abs(e.body.y + 1.6 - y) > 2.6 ? ENEMY.hearRangeWalled * 0.5 : ENEMY.hearRangeWalled;
      if (clear || d < walled) this.alert(e, this.game.player.x, this.game.player.y, this.game.player.z);
    }
  }

  // Quieter noises (doors): investigate.
  hearNoise(x, y, z, radius) {
    const w = this.game.world;
    for (const e of this.list) {
      if (!e.alive || e.state === 'combat' || e.state === 'chase' || e.sniper) continue;
      const d = Math.hypot(e.body.x - x, e.body.y - y, e.body.z - z);
      const clear = w.clear(e.body.x, e.body.y + 1.6, e.body.z, x, y, z, SIGHT);
      if (d < (clear ? radius : radius * 0.5)) {
        e.lastKnown.set(x, y - 1, z);
        e.state = 'chase';
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
    const w = WEAPONS[e.weapon];
    const ew = w.enemy;
    e.reactT -= dt;
    if (e.sees) e.aimTime += dt; else e.aimTime = Math.max(0, e.aimTime - dt * 2);
    const tx = e.sees ? P.x : e.lastKnown.x, tz = e.sees ? P.z : e.lastKnown.z;
    const yawTo = Math.atan2(-(tx - e.body.x), -(tz - e.body.z));
    const off = this._turnTo(e, yawTo, 7, dt);
    // aim pitch at the chest
    const ty = (e.sees ? P.cam.y - 0.4 : e.lastKnown.y + 1.2) - (e.body.y + 1.35);
    const tp = Math.atan2(ty, Math.max(0.5, Math.hypot(tx - e.body.x, tz - e.body.z)));
    e.pitch += (tp - e.pitch) * Math.min(1, dt * 8);
    // fire in bursts
    if (e.sees && e.reactT <= 0 && off < 0.3 && P.alive) {
      if (e.burstLeft > 0) {
        e.shotCd -= dt;
        if (e.shotCd <= 0) {
          this._shoot(e);
          e.burstLeft--;
          e.shotCd += e.sniper ? SNIPER.interval : ew.interval;
          if (e.burstLeft === 0) e.burstCd = e.sniper ? SNIPER.interval : rand(ew.pause[0], ew.pause[1]);
        }
      } else {
        e.burstCd -= dt;
        if (e.burstCd <= 0) {
          e.burstLeft = e.sniper ? 1 : Math.round(rand(ew.burst[0], ew.burst[1]));
          e.shotCd = 0;
        }
      }
    }
    // lost sight -> chase last known position
    if (!e.sees && g.time - e.lastSeen > ENEMY.loseSightTime && !e.sniper) {
      e.state = 'chase';
      e.repathT = 0;
      e.path = null;
      return [0, 0, 0];
    }
    if (e.sniper) return [0, 0, 0];
    // strafe, keep a comfortable distance
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      const r = Math.random();
      e.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
      e.strafeT = rand(0.8, 2.0);
    }
    const inv = 1 / Math.max(distP, 0.01);
    const nx = dxp * inv, nz = dzp * inv;
    let vx = -nz * e.strafeDir * ENEMY.strafe, vz = nx * e.strafeDir * ENEMY.strafe;
    const pref = e.weapon === 'shotgun' ? [3, 9] : e.weapon === 'rifle' ? [7, 24] : [4, 15];
    if (!e.sees || distP > pref[1]) {
      // move up toward the player along the nav graph
      e.repathT -= dt;
      if (e.repathT <= 0 || !e.path) this._pathTo(e, e.lastKnown);
      const [px, pz] = this._followPath(e, ENEMY.run * 0.8, dt);
      vx = px + vx * 0.3; vz = pz + vz * 0.3;
    } else if (distP < pref[0]) {
      vx -= nx * ENEMY.strafe; vz -= nz * ENEMY.strafe;
    }
    if (e.burstLeft > 0) { vx *= 0.45; vz *= 0.45; }
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

  _shoot(e) {
    const g = this.game;
    const P = g.player;
    const w = WEAPONS[e.weapon];
    const ew = w.enemy;
    const muzzle = this._muzzle(e, _v3);
    const target = _v.set(P.cam.x, P.cam.y - 0.42, P.cam.z);
    const dir = new THREE.Vector3().subVectors(target, muzzle).normalize();
    const settle = 1.7 - 0.7 * Math.min(1, e.aimTime / 1.6);
    const moving = Math.min(1, Math.hypot(P.body.vx, P.body.vz) / 4);
    let spread = (e.sniper ? SNIPER.spread : ew.spread) * g.diff.spread * settle * (1 + moving * 0.35);
    const speed = (e.sniper ? SNIPER.speed : ew.speed) * g.diff.bulletSpeed;
    const dmg = (e.sniper ? SNIPER.damage : ew.damage) * g.diff.damage;
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
    g.fx.enemyFlash(muzzle.x + dir.x * 0.06, muzzle.y + dir.y * 0.06, muzzle.z + dir.z * 0.06, e.weapon === 'shotgun' ? 0.24 : 0.18);
    const sp = this._spatial(e, 0.8);
    g.audio.play(w.sound, { ...sp, rate: 0.9 + Math.random() * 0.1 });
  }

  // Gain / pan / occlusion filter for a sound at an enemy.
  _spatial(e, base) {
    const g = this.game;
    const cam = g.camera;
    const dx = e.body.x - cam.position.x, dy = e.body.y + 1.4 - cam.position.y, dz = e.body.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const yaw = g.player.yaw;
    const pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d;
    const occluded = !g.world.clear(cam.position.x, cam.position.y, cam.position.z, e.body.x, e.body.y + 1.4, e.body.z, SIGHT);
    return { gain: base / (1 + d / 9), pan: pan * 0.8, lowpass: occluded ? 900 : Math.max(2500, 20000 - d * 220) };
  }

  _muzzle(e, out) {
    const m = this._gunMatrix(e, _m);
    return out.copy(GUN_INFO[e.weapon].muzzle).applyMatrix4(m);
  }

  _pathTo(e, target) {
    const nav = this.game.nav;
    e.repathT = 1.4 + Math.random() * 0.4;
    const b = e.body;
    const start = nav.nearest(b.x, b.y, b.z);
    const goal = nav.nearest(target.x, target.y, target.z, false);
    e.goal = target.clone ? target.clone() : new THREE.Vector3(target.x, target.y, target.z);
    const p = start && goal ? nav.path(start, goal) : null;
    if (p) {
      e.path = [{ node: start, door: null }, ...p];
      // skip the first node if we're already past it
      e.pathIdx = e.path.length > 1 && Math.hypot(b.x - start.x, b.z - start.z) < 1.2 ? 1 : 0;
    } else {
      e.path = null;
    }
  }

  _followPath(e, speed, dt) {
    const b = e.body;
    let tx, tz, door = null;
    if (e.path && e.pathIdx < e.path.length) {
      const step = e.path[e.pathIdx];
      tx = step.node.x; tz = step.node.z;
      door = step.door;
      if (Math.hypot(tx - b.x, tz - b.z) < 0.55 && Math.abs(step.node.y - b.y) < 0.8) {
        e.pathIdx++;
        return this._followPath(e, speed, dt);
      }
    } else if (e.goal) {
      tx = e.goal.x; tz = e.goal.z;
      if (Math.hypot(tx - b.x, tz - b.z) < 0.5) { e.goal = null; return [0, 0, 0]; }
    } else return [0, 0, 0];
    // doors on the way: open them ourselves
    if (door && !door.isOpen && door.distanceTo(b.x, b.z) < 1.5) {
      door.open(b.x, b.z);
      this.game.audio.play('doorOpen', this._spatial(e, 0.6));
      e.doorWait = 0.35;
    }
    if (e.doorWait > 0) { e.doorWait -= dt; speed *= 0.2; }
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.hypot(dx, dz) || 1;
    if (e.state !== 'combat') this._turnTo(e, Math.atan2(-dx, -dz), 6, dt);
    return [(dx / d) * speed, (dz / d) * speed, speed];
  }

  _openBlockingDoor(e, vx, vz) {
    const b = e.body;
    const sp = Math.hypot(vx, vz) || 1;
    const px = b.x + (vx / sp) * 0.6, pz = b.z + (vz / sp) * 0.6;
    for (const d of this.game.doors) {
      if (!d.isOpen && Math.abs(d.y0 - b.y) < 1 && d.distanceTo(px, pz) < 0.6) {
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
    if (!e.path || e.repathT <= 0) this._pathTo(e, new THREE.Vector3(px, e.spawn.y, pz));
    e.repathT -= dt;
    return this._followPath(e, ENEMY.walk, dt);
  }

  _startSearch(e) {
    e.state = 'search';
    e.searchT = ENEMY.searchTime * rand(0.8, 1.2);
    e.path = null;
    e.goal = null;
    e.searchWait = 0;
    e.awareness = 0.5;
  }

  _search(e, dt) {
    e.searchT -= dt;
    if (e.searchT <= 0) {
      e.state = 'return';
      e.awareness = 0;
      this._pathTo(e, new THREE.Vector3(e.spawn.x, e.spawn.y, e.spawn.z));
      return [0, 0, 0];
    }
    if (e.searchWait > 0) {
      e.searchWait -= dt;
      e.idleT += dt;
      this._turnTo(e, e.yaw + Math.sin(e.idleT * 2.2) * 1.2, 2.5, dt);
      return [0, 0, 0];
    }
    if ((!e.path || e.pathIdx >= e.path.length) && !e.goal) {
      // pick a random nearby waypoint around the last known position
      const nav = this.game.nav;
      const near = nav.nodes.filter((n) => Math.abs(n.y - e.lastKnown.y) < 1 && Math.hypot(n.x - e.lastKnown.x, n.z - e.lastKnown.z) < 9);
      if (near.length) {
        const n = near[Math.floor(Math.random() * near.length)];
        this._pathTo(e, new THREE.Vector3(n.x, n.y, n.z));
      }
      e.searchWait = rand(0.8, 1.8);
      return [0, 0, 0];
    }
    return this._followPath(e, ENEMY.walk * 1.3, dt);
  }

  _separate(e) {
    const b = e.body;
    for (const o of this.list) {
      if (o === e || !o.alive) continue;
      const dx = b.x - o.body.x, dz = b.z - o.body.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.49 && d2 > 1e-6 && Math.abs(b.y - o.body.y) < 1) {
        const d = Math.sqrt(d2);
        b.vx += (dx / d) * 1.5; b.vz += (dz / d) * 1.5;
      }
    }
    const P = this.game.player;
    const dx = b.x - P.x, dz = b.z - P.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.65 && d > 1e-4 && Math.abs(b.y - P.y) < 1.5) { b.vx += (dx / d) * 2.5; b.vz += (dz / d) * 2.5; }
  }

  // ------------------------------------------------------------------ pose
  _pose(e, dt) {
    const b = e.body;
    const fwd = _v.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    const fx = fwd.x, fz = fwd.z;
    const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
    const combat = e.state === 'combat' || (e.state === 'chase' && e.moveSpeed < 1);
    e.aimBlend += ((combat ? 1 : 0) - e.aimBlend) * Math.min(1, dt * 6);
    const a = e.aimBlend;
    const moveAmt = Math.min(1, e.moveSpeed / 3);
    const ph = e.walkPhase;
    const bob = -Math.abs(Math.sin(ph)) * 0.035 * moveAmt;
    const L = (x, y, z, out) => out.set(b.x + rx * x + fx * z, b.y + y, b.z + rz * x + fz * z);
    const j = e.joints;
    const lean = a * 0.03 + moveAmt * 0.04;
    L(0, 0.95 + bob, 0, j[J.pelvis]);
    L(0, 1.42 + bob, lean, j[J.chest]);
    L(0, 1.47 + bob, lean + 0.01, j[J.neck]);
    L(0, 1.63 + bob, lean + 0.02, j[J.head]);
    L(-0.19, 1.39 + bob, lean, j[J.sl]);
    L(0.19, 1.39 + bob, lean, j[J.sr]);
    L(-0.1, 0.92 + bob, 0, j[J.hipl]);
    L(0.1, 0.92 + bob, 0, j[J.hipr]);
    // legs
    for (const [side, hip, knee, foot, off] of [[-1, J.hipl, J.kl, J.fl, 0], [1, J.hipr, J.kr, J.fr, Math.PI]]) {
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
    let [ry, rzz] = rot(1.33, 0.34 - kick);
    let [ly, lz] = rot(1.31, 0.56 - kick);
    const lowR = [0.15, 1.02, 0.24], lowL = [-0.03, 1.1, 0.4];
    const aimR = [0.07, ry + bob, rzz + lean], aimL = [-0.01, ly + bob, lz + lean];
    const upR = [0.27, 2.02, 0.08], upL = [-0.27, 2.02, 0.08];
    const h = e.hitUp * e.hitUp * (3 - 2 * e.hitUp);
    const mix = (lo, am, upv, k) => lo.map((v, i) => (v + (am[i] - v) * a) * (1 - h) + upv[i] * h);
    const R = mix(lowR, aimR, upR, 0), Lh = mix(lowL, aimL, upL, 0);
    L(R[0], R[1], R[2], j[J.hr]);
    L(Lh[0], Lh[1], Lh[2], j[J.hl]);
    const pole = this.tmp[0];
    pole.set(rx * 0.8 - fx * 0.2, -1, rz * 0.8 - fz * 0.2).normalize();
    solveElbow(j[J.sr], j[J.hr], 0.3, 0.29, pole, j[J.er]);
    pole.set(-rx * 0.8 - fx * 0.2, -1, -rz * 0.8 - fz * 0.2).normalize();
    solveElbow(j[J.sl], j[J.hl], 0.3, 0.29, pole, j[J.el]);
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
    return out;
  }

  // ------------------------------------------------------------------ damage
  // Ray against alive enemies: head sphere, then torso/limb capsules.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      const b = e.body;
      // quick reject by bounding cylinder
      const cx = b.x - ox, cz = b.z - oz;
      const tc = cx * dx + cz * dz;
      const px = ox + dx * tc - b.x, pz = oz + dz * tc - b.z;
      if (tc < -1 || px * px + pz * pz > 1.2) continue;
      const j = e.joints;
      // head
      const th = raySphere(ox, oy, oz, dx, dy, dz, j[J.head], 0.18);
      if (th >= 0 && th < best) { best = th; hit = { enemy: e, part: 'head', t: th }; }
      // body parts as capsules
      const caps = [[J.pelvis, J.neck, 0.15], [J.sl, J.el, 0.075], [J.el, J.hl, 0.07], [J.sr, J.er, 0.075], [J.er, J.hr, 0.07],
        [J.hipl, J.kl, 0.085], [J.kl, J.fl, 0.075], [J.hipr, J.kr, 0.085], [J.kr, J.fr, 0.075]];
      for (const [p, q, r] of caps) {
        const t = rayCapsule(ox, oy, oz, dx, dy, dz, j[p], j[q], r);
        if (t >= 0 && t < best) { best = t; hit = { enemy: e, part: 'body', t }; }
      }
    }
    if (hit) hit.point = new THREE.Vector3(ox + dx * hit.t, oy + dy * hit.t, oz + dz * hit.t);
    return hit;
  }

  damage(e, amount, part, point, dir) {
    if (!e.alive) return false;
    const g = this.game;
    const head = part === 'head';
    e.health -= amount * (head ? HEADSHOT_MULT : 1);
    e.hitUp = 1;
    e.stagger = 0.25;
    g.fx.bloodSpray(point.x, point.y, point.z, dir.x, dir.y, dir.z, head ? 1.3 : 1);
    g.audio.play(head ? 'headshot' : 'flesh', { gain: 0.6 });
    if (e.health <= 0) {
      this._kill(e, dir, point, head);
      return true;
    }
    // being shot means they know where you are
    const P = g.player;
    e.lastKnown.set(P.x, P.y, P.z);
    e.lastSeen = g.time;
    if (e.state !== 'combat') {
      this._enterCombat(e, true);
      this._turnTo(e, Math.atan2(-(P.x - e.body.x), -(P.z - e.body.z)), 2.5, 0.2);
    }
    return false;
  }

  _kill(e, dir, point, head) {
    const g = this.game;
    e.alive = false;
    e.state = 'dead';
    e.deathT = 0;
    e.health = 0;
    // Verlet ragdoll from the current pose
    const pts = e.joints.map((p) => p.clone());
    const prev = pts.map((p) => p.clone());
    const vx = e.body.vx / 120, vz = e.body.vz / 120;
    const push = head ? 0.016 : 0.012;
    for (let i = 0; i < pts.length; i++) {
      prev[i].x -= vx + dir.x * push * 0.5;
      prev[i].z -= vz + dir.z * push * 0.5;
    }
    // extra shove where the bullet hit, and a little knee buckle
    let hi = 0, hd = Infinity;
    pts.forEach((p, i) => { const d = p.distanceToSquared(point); if (d < hd) { hd = d; hi = i; } });
    prev[hi].addScaledVector(dir, -0.02);
    prev[J.kl].addScaledVector(e.face, -0.02);
    prev[J.kr].addScaledVector(e.face, -0.02);
    const rest = STICKS.map(([a, b]) => pts[a].distanceTo(pts[b]));
    e.ragdoll = { pts, prev, rest, t: 0, sleep: false };
    // drop the gun as a pickup
    const ammoMag = WEAPONS[e.weapon].mag;
    const hand = e.joints[J.hr];
    this.dropPickup(e.weapon, ammoMag, Math.round(ammoMag * 0.5), hand.x, hand.y, hand.z, e.yaw + rand(-1, 1), true);
    g.onEnemyKilled(e, head);
  }

  _updateDead(e, dt) {
    const r = e.ragdoll;
    if (!r) return;
    e.deathT += dt;
    if (!e.pooled && e.deathT > 0.7) {
      e.pooled = true;
      const p = r.pts[J.pelvis];
      const gy = this.game.world.heightAt(p.x, p.z, p.y + 0.2);
      this.game.fx.pool(p.x, gy, p.z, 0.45 + Math.random() * 0.25);
    }
    if (r.sleep) return;
    r.t += dt;
    const steps = Math.max(1, Math.round(dt / (1 / 120)));
    const h = dt / steps;
    const world = this.game.world;
    const cols = world.gather(r.pts[J.pelvis].x - 2, r.pts[J.pelvis].z - 2, r.pts[J.pelvis].x + 2, r.pts[J.pelvis].z + 2, []).filter((c) => c.f & MOVE);
    let motion = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < r.pts.length; i++) {
        const p = r.pts[i], q = r.prev[i];
        const vx = (p.x - q.x) * 0.992, vy = (p.y - q.y) * 0.992, vz = (p.z - q.z) * 0.992;
        q.copy(p);
        p.x += vx; p.y += vy - GRAVITY * 0.8 * h * h; p.z += vz;
        motion = Math.max(motion, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
      }
      for (let it = 0; it < 6; it++) {
        for (let k = 0; k < STICKS.length; k++) {
          const [a, b] = STICKS[k];
          const pa = r.pts[a], pb = r.pts[b];
          const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = ((d - r.rest[k]) / d) * 0.5;
          pa.x += dx * diff; pa.y += dy * diff; pa.z += dz * diff;
          pb.x -= dx * diff; pb.y -= dy * diff; pb.z -= dz * diff;
        }
        for (let i = 0; i < r.pts.length; i++) this._collidePoint(r.pts[i], r.prev[i], P_RADIUS[i], cols);
      }
    }
    if (r.t > 1.2 && motion < 0.0008) r.sleepT = (r.sleepT || 0) + dt; else r.sleepT = 0;
    if (r.sleepT > 0.4 || r.t > 6) r.sleep = true;
    for (let i = 0; i < 16; i++) e.joints[i].copy(r.pts[i]);
  }

  _collidePoint(p, q, rad, cols) {
    // ground plane + tops of boxes below, walls pushed out
    let floor = p.y >= -0.01 ? 0 : -Infinity;
    for (const c of cols) {
      if (p.x < c.x0 - rad || p.x > c.x1 + rad || p.z < c.z0 - rad || p.z > c.z1 + rad) continue;
      if (p.y - rad > c.y1 || p.y + rad < c.y0) continue;
      const inside = p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1;
      if (inside && q.y - rad >= c.y1 - 0.05) { floor = Math.max(floor, c.y1); continue; }
      if (inside && p.y - rad < c.y1 && c.y1 - (p.y - rad) < 0.12) { floor = Math.max(floor, c.y1); continue; }
      // push out horizontally along the shallowest axis
      const pl = p.x - (c.x0 - rad), pr = c.x1 + rad - p.x, pb = p.z - (c.z0 - rad), pf = c.z1 + rad - p.z;
      const m = Math.min(pl, pr, pb, pf);
      if (m === pl) p.x -= pl; else if (m === pr) p.x += pr; else if (m === pb) p.z -= pb; else p.z += pf;
    }
    if (p.y - rad < floor) {
      p.y = floor + rad;
      // friction
      q.x += (p.x - q.x) * 0.35;
      q.z += (p.z - q.z) * 0.35;
      if (q.y < p.y - 0.02) q.y = p.y - 0.02;
    }
  }

  // ------------------------------------------------------------------ pickups
  dropPickup(weapon, mag, reserve, x, y, z, yaw, fromHand = false) {
    if (this.pickups.length >= MAX_PICKUPS) this.pickups.shift();
    const p = { weapon, mag, reserve, x, y, z, yaw, vy: fromHand ? 1.2 : 0, vx: fromHand ? rand(-0.6, 0.6) : 0, vz: fromHand ? rand(-0.6, 0.6) : 0, rest: false, spin: fromHand ? rand(-6, 6) : 0, tilt: 0 };
    this.pickups.push(p);
    return p;
  }

  removePickup(p) {
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  _updatePickups(dt) {
    const w = this.game.world;
    for (const p of this.pickups) {
      if (p.rest) continue;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
      p.yaw += p.spin * dt;
      p.tilt = Math.min(1, p.tilt + dt * 3);
      const floor = p.floor !== undefined ? p.floor : (p.floor = w.heightAt(p.x, p.z, p.y + 0.3));
      if (p.y <= floor + 0.03) { p.y = floor + 0.03; p.rest = true; p.tilt = 1; }
    }
  }

  nearestPickup(x, y, z, look) {
    let best = null, bestScore = -1;
    for (const p of this.pickups) {
      if (!p.rest || Math.abs(p.y - y) > 1.2) continue;
      const dx = p.x - x, dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2) continue;
      const facing = (dx * look.x + dz * look.z) / (d || 1);
      const score = d < 1.0 ? 1 + (1 - d) : facing > 0.55 ? facing : -1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ? { pickup: best, score: bestScore } : null;
  }

  // ------------------------------------------------------------------ render
  render() {
    const n = this.list.length;
    const counts = { smg: 0, shotgun: 0, rifle: 0, pistol: 0 };
    for (let i = 0; i < n; i++) {
      const e = this.list[i];
      const j = e.joints;
      for (let k = 0; k < LIMB_SEGS.length; k++) this.limbs.setMatrixAt(i * LIMBS + k, segMatrix(j[LIMB_SEGS[k][0]], j[LIMB_SEGS[k][1]], _m));
      // neck
      const neckTop = this.tmp[5].copy(j[J.head]).lerp(j[J.neck], 0.4);
      this.limbs.setMatrixAt(i * LIMBS + 8, segMatrix(j[J.neck], neckTop, _m));
      this.torso.setMatrixAt(i * 2, segMatrix(j[J.pelvis], j[J.neck], _m));
      // shoulder bar
      this.torso.setMatrixAt(i * 2 + 1, _m.copy(HIDE));
      for (let k = 0; k < JOINT_LIST.length; k++) {
        _m.makeTranslation(j[JOINT_LIST[k]].x, j[JOINT_LIST[k]].y, j[JOINT_LIST[k]].z);
        this.joints.setMatrixAt(i * JOINTS + k, _m);
      }
      _m.makeScale(1.85, 1.85, 1.85).setPosition(j[J.pelvis]);
      this.joints.setMatrixAt(i * JOINTS + 12, _m);
      _m.makeScale(1.75, 1.75, 1.75).setPosition(j[J.neck]);
      this.joints.setMatrixAt(i * JOINTS + 13, _m);
      _m.makeTranslation(j[J.head].x, j[J.head].y, j[J.head].z);
      this.heads.setMatrixAt(i, _m);
      // one big eye on the face, pupil looking where they aim
      let face = this.tmp[6];
      if (e.alive) {
        const pitch = e.pitch * e.aimBlend * 0.6;
        face.set(e.face.x * Math.cos(pitch), Math.sin(pitch), e.face.z * Math.cos(pitch));
      } else {
        const up = this.tmp[7].subVectors(j[J.head], j[J.neck]).normalize();
        const side = this.tmp[8].subVectors(j[J.sr], j[J.sl]);
        face.crossVectors(up, side).normalize();
        if (face.lengthSq() < 0.5) face.set(0, 1, 0);
      }
      const eyePos = this.tmp[9].copy(j[J.head]).addScaledVector(face, 0.152);
      eyePos.y += 0.035;
      _q.setFromUnitVectors(this.tmp[10].set(0, 0, 1), face);
      _m.compose(eyePos, _q, _s.set(1, 1, 1));
      this.eyes.setMatrixAt(i, _m);
      const pupil = this.tmp[11].copy(eyePos).addScaledVector(face, 0.008);
      if (e.alive) {
        const P = this.game.player;
        const look = this.tmp[12].set(P.cam.x - eyePos.x, P.cam.y - eyePos.y, P.cam.z - eyePos.z).normalize();
        const lat = this.tmp[13].copy(look).addScaledVector(face, -look.dot(face));
        if (e.state !== 'idle' && e.state !== 'patrol') pupil.addScaledVector(lat, 0.03);
      } else {
        pupil.y -= 0.02;
      }
      _m.compose(pupil, _q, _s.set(1, 1, 1));
      this.pupils.setMatrixAt(i, _m);
      if (e.alive) {
        const gm = this._gunMatrix(e, _m);
        this.guns[e.weapon].setMatrixAt(counts[e.weapon]++, gm);
      }
    }
    for (const p of this.pickups) {
      // lying on its side on the ground
      _q.setFromAxisAngle(UP, p.yaw);
      const side = new THREE.Quaternion().setFromAxisAngle(this.tmp[14].set(0, 0, 1), (Math.PI / 2) * p.tilt);
      _q.multiply(side);
      _m.compose(this.tmp[15].set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
      this.guns[p.weapon].setMatrixAt(counts[p.weapon]++, _m);
    }
    this.limbs.count = n * LIMBS;
    this.torso.count = n * 2;
    this.joints.count = n * JOINTS;
    this.heads.count = this.eyes.count = this.pupils.count = n;
    for (const m of [this.limbs, this.torso, this.joints, this.heads, this.eyes, this.pupils]) m.instanceMatrix.needsUpdate = true;
    for (const [r, src] of this.rims) r.count = src.count;
    for (const id of GUN_IDS) {
      this.guns[id].count = counts[id];
      this.guns[id].instanceMatrix.needsUpdate = true;
    }
  }

  snapshot() {
    return this.list.map((e) => ({
      id: e.id, alive: e.alive, state: e.state, health: e.health, x: e.body.x, y: e.body.y, z: e.body.z, yaw: e.yaw,
      joints: e.joints.map((p) => [p.x, p.y, p.z]),
    })).concat([{ pickups: this.pickups.map((p) => [p.weapon, p.mag, p.reserve, p.x, p.y, p.z]) }]);
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
  // sample-based closest approach between ray and segment, good enough for hit tests
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const wx = ox - a.x, wy = oy - a.y, wz = oz - a.z;
  const A = dx * dx + dy * dy + dz * dz, B = dx * ux + dy * uy + dz * uz, C = ux * ux + uy * uy + uz * uz;
  const D = dx * wx + dy * wy + dz * wz, E = ux * wx + uy * wy + uz * wz;
  const den = A * C - B * B;
  let s = den > 1e-9 ? (B * E - C * D) / den : 0;
  let t = den > 1e-9 ? (A * E - B * D) / den : E / (C || 1);
  t = Math.max(0, Math.min(1, t));
  s = Math.max(0, (B * t - D) / A);
  const px = ox + dx * s - (a.x + ux * t), py = oy + dy * s - (a.y + uy * t), pz = oz + dz * s - (a.z + uz * t);
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  // step back to the surface
  return Math.max(0, s - Math.sqrt(r * r - d2));
}
