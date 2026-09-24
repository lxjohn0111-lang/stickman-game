// Pickups: weapons (dropped or placed, keeping their remaining ammo), ammo
// boxes, health kits and secret stars. All instanced, with a thin black hull
// so they read on white Classic floors and colourful Neo ones alike.
// The gun meshes are shared with enemies, who push the guns they hold.
import * as THREE from 'three';
import { GRAVITY, PLAYER, WEAPONS, WEAPON_IDS } from './config.js';
import { mergedGunGeometry } from './guns.js';
import { makeStarGeometry } from './fx.js';

const MAX_GUNS = 96;
const MAX_KITS = 40;
const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function mergeParts(parts) {
  let n = 0, ni = 0;
  for (const g of parts) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, io = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.array[k] + o;
    o += g.attributes.position.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function hullMaterial(base) {
  base.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * 0.022;');
  };
  return base;
}

export class Items {
  constructor(game) {
    this.game = game;
    const mats = game.materials;
    const scene = game.scene;
    const mk = (geo, mat, n, shadow = false) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.count = 0;
      scene.add(m);
      return m;
    };
    this.guns = {};
    for (const id of WEAPON_IDS) this.guns[id] = mk(mergedGunGeometry(id), mats.get('enemyGun'), MAX_GUNS, true);
    const hull = hullMaterial(mats.get('hull2'));
    // health kit: white case + red cross
    const kit = new THREE.BoxGeometry(0.44, 0.24, 0.32);
    const crossA = new THREE.BoxGeometry(0.2, 0.02, 0.06).translate(0, 0.125, 0);
    const crossB = new THREE.BoxGeometry(0.06, 0.02, 0.2).translate(0, 0.125, 0);
    const crossC = new THREE.BoxGeometry(0.2, 0.06, 0.005).translate(0, 0, 0.162);
    const crossD = new THREE.BoxGeometry(0.06, 0.18, 0.005).translate(0, 0, 0.162);
    for (const g of [kit, crossA, crossB, crossC, crossD]) g.deleteAttribute('uv');
    this.kit = mk(kit, mats.get('healthKit'), MAX_KITS, true);
    this.kitCross = mk(mergeParts([crossA, crossB, crossC, crossD]), mats.get('healthCross'), MAX_KITS);
    this.kitCross.instanceMatrix = this.kit.instanceMatrix;
    this.kitHull = mk(kit, hull, MAX_KITS);
    this.kitHull.instanceMatrix = this.kit.instanceMatrix;
    // ammo box: olive case with a yellow band
    const box = new THREE.BoxGeometry(0.46, 0.26, 0.3);
    const band = new THREE.BoxGeometry(0.47, 0.06, 0.31);
    box.deleteAttribute('uv'); band.deleteAttribute('uv');
    this.ammo = mk(box, mats.get('ammoBox'), MAX_KITS, true);
    this.ammoBand = mk(band, mats.get('ammoBand'), MAX_KITS);
    this.ammoBand.instanceMatrix = this.ammo.instanceMatrix;
    this.ammoHull = mk(box, hull, MAX_KITS);
    this.ammoHull.instanceMatrix = this.ammo.instanceMatrix;
    // secret: a thick five-point star that spins
    const star = makeStarGeometry(5, 0.45);
    star.scale(0.26, 0.26, 50);
    star.computeVertexNormals();
    this.star = mk(star, mats.get('secret'), 8);
    this.starHull = mk(star, hull, 8);
    this.starHull.instanceMatrix = this.star.instanceMatrix;
    this.list = [];
    this.gunCounts = {};
    this.t = 0;
  }

  // Place the level's pickups for the current difficulty (tier filter).
  load(defs, maxTier, taken = new Set(), secretsFound = []) {
    this.list.length = 0;
    for (const d of defs.items) {
      if (d.tier > maxTier || taken.has(d.key)) continue;
      if (d.type === 'weapon') {
        const w = WEAPONS[d.weapon];
        this.list.push({ key: d.key, type: 'weapon', weapon: d.weapon, mag: d.mag ?? w.mag, reserve: d.reserve ?? w.mag, x: d.x, y: d.y + 0.03, z: d.z, yaw: d.yaw || 0, rest: true, tilt: 1 });
      } else {
        this.list.push({ key: d.key, type: d.type, x: d.x, y: d.y, z: d.z, rest: true, yaw: (d.x * 7 + d.z * 3) % 6 });
      }
    }
    defs.secrets.forEach((s, i) => {
      if (secretsFound[i]) return;
      this.list.push({ key: 'secret' + i, type: 'secret', index: i, x: s.x, y: s.y, z: s.z, rest: true, yaw: 0 });
    });
  }

  clear() { this.list.length = 0; }

  // A dropped gun keeps whatever ammo it still has.
  drop(weapon, mag, reserve, x, y, z, yaw, fromHand = false) {
    const guns = this.list.filter((p) => p.type === 'weapon');
    if (guns.length >= 40) this.remove(guns[0]);
    const p = {
      key: 'd' + Math.random().toString(36).slice(2, 8), type: 'weapon', weapon, mag, reserve, x, y, z, yaw,
      vy: fromHand ? 1.2 : 0, vx: fromHand ? (Math.random() - 0.5) * 1.2 : 0, vz: fromHand ? (Math.random() - 0.5) * 1.2 : 0,
      rest: false, spin: fromHand ? (Math.random() - 0.5) * 12 : 0, tilt: fromHand ? 0 : 1, dropped: true,
    };
    this.list.push(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  update(dt) {
    this.t += dt;
    const w = this.game.world;
    for (const p of this.list) {
      if (!p.rest) {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        p.yaw += p.spin * dt;
        p.tilt = Math.min(1, p.tilt + dt * 3);
        const floor = w.heightAt(p.x, p.z, p.y + 0.3);
        if (p.y <= floor + 0.03) { p.y = floor + 0.03; p.rest = true; p.tilt = 1; }
      } else if (p.type === 'weapon' && p.dropped) {
        // conveyor belts carry dropped weapons along
        const g = w.groundBelow(p.x, p.z, 0.05, p.y + 0.05, 0.2);
        const c = w._lastGroundCol;
        if (g !== null && c && c.conv && c.conv.on) { p.x += c.conv.vx * dt; p.z += c.conv.vz * dt; }
        else if (g === null) p.rest = false;
      }
    }
  }

  // Weapon the player is looking at / standing near.
  nearestWeapon(x, y, z, look) {
    let best = null, bestScore = -1;
    for (const p of this.list) {
      if (p.type !== 'weapon' || !p.rest || Math.abs(p.y - y) > 1.2) continue;
      const dx = p.x - x, dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2) continue;
      const facing = (dx * look.x + dz * look.z) / (d || 1);
      const score = d < 1.0 ? 1 + (1 - d) : facing > 0.55 ? facing : -1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ? { pickup: best, score: bestScore } : null;
  }

  // Walk-over pickups. Returns the list of things taken this frame.
  touch(player) {
    const out = [];
    const px = player.x, py = player.y, pz = player.z;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.type === 'weapon') continue;
      if (Math.abs(p.y - py) > 1.3) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > (p.type === 'secret' ? 1.2 : 1.0)) continue;
      out.push(p);
    }
    return out;
  }

  beginGuns() {
    for (const id of WEAPON_IDS) this.gunCounts[id] = 0;
  }

  pushGun(id, matrix) {
    const n = this.gunCounts[id]++;
    if (n < MAX_GUNS) this.guns[id].setMatrixAt(n, matrix);
  }

  render() {
    let nk = 0, na = 0, ns = 0;
    for (const p of this.list) {
      if (p.type === 'weapon') {
        _q.setFromAxisAngle(UP, p.yaw);
        _q2.setFromAxisAngle(Z, (Math.PI / 2) * p.tilt);
        _q.multiply(_q2);
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
        this.pushGun(p.weapon, _m);
      } else if (p.type === 'health' && nk < MAX_KITS) {
        _q.setFromAxisAngle(UP, p.yaw);
        _m.compose(_v.set(p.x, p.y + 0.12, p.z), _q, _s.set(1, 1, 1));
        this.kit.setMatrixAt(nk++, _m);
      } else if (p.type === 'ammo' && na < MAX_KITS) {
        _q.setFromAxisAngle(UP, p.yaw);
        _m.compose(_v.set(p.x, p.y + 0.13, p.z), _q, _s.set(1, 1, 1));
        this.ammo.setMatrixAt(na++, _m);
      } else if (p.type === 'secret' && ns < 8) {
        _q.setFromAxisAngle(UP, this.t * 2 + p.index);
        _m.compose(_v.set(p.x, p.y + 0.7 + Math.sin(this.t * 2.2 + p.index) * 0.1, p.z), _q, _s.set(1, 1, 1));
        this.star.setMatrixAt(ns++, _m);
      }
    }
    this.kit.count = this.kitCross.count = this.kitHull.count = nk;
    this.ammo.count = this.ammoBand.count = this.ammoHull.count = na;
    this.star.count = this.starHull.count = ns;
    for (const m of [this.kit, this.ammo, this.star]) m.instanceMatrix.needsUpdate = true;
    for (const id of WEAPON_IDS) {
      this.guns[id].count = Math.min(MAX_GUNS, this.gunCounts[id]);
      this.guns[id].instanceMatrix.needsUpdate = true;
    }
  }

  snapshot() {
    return this.list.map((p) => [p.key, p.type, p.weapon || '', p.mag ?? 0, p.reserve ?? 0, +p.x.toFixed(2), +p.z.toFixed(2)]);
  }

  // Saved state for checkpoints: which level pickups remain + dropped guns.
  save() {
    return this.list.filter((p) => p.rest).map((p) => ({ ...p }));
  }

  restore(list) {
    this.list = list.map((p) => ({ ...p }));
  }
}

export { HIDE, PLAYER };
