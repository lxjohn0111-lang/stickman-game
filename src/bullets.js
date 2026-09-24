// Projectiles.
//  * Player bullets fly along the crosshair ray (that is what they hit), but
//    are drawn as tracers that leave the gun muzzle and converge onto the
//    crosshair line within a few metres: thin tail, round head.
//  * Enemy bullets are slow, fat teardrops you can see and side-step; near
//    misses whiz past with a panned sound.
import * as THREE from 'three';
import { BULLET } from './world.js';

const MAX_PT = 96;
const MAX_ET = 160;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function teardropGeometry() {
  // round head + cone tail, pointing along +Y (flight direction)
  const head = new THREE.SphereGeometry(1, 10, 8);
  const tail = new THREE.CylinderGeometry(0.98, 0, 3.4, 10, 1, true);
  tail.translate(0, -1.7, 0);
  const merge = (list) => {
    let n = 0, ni = 0;
    for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(n * 3), idx = new Uint32Array(ni);
    let o = 0, io = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, o * 3);
      for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.array[k] + o;
      o += g.attributes.position.count; io += g.index.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeVertexNormals();
    return out;
  };
  return merge([head, tail]);
}

function segPointDist2(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px, y = ay + dy * t - py, z = az + dz * t - pz;
  return x * x + y * y + z * z;
}

// Closest distance between segment AB and vertical segment (px, y0..y1, pz).
function segCapsuleDist(ax, ay, az, bx, by, bz, px, y0, y1, pz) {
  let best = Infinity;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    const cy = y < y0 ? y0 : y > y1 ? y1 : y;
    const d = (x - px) ** 2 + (y - cy) ** 2 + (z - pz) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export class Bullets {
  constructor(scene, materials, world, fx) {
    this.world = world;
    this.fx = fx;
    this.player = [];
    this.enemy = [];
    const pm = materials.get('tracerPlayer');
    const em = materials.get('tracerEnemy');
    this.ptTail = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), pm, MAX_PT);
    this.ptHead = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), pm, MAX_PT);
    this.etHead = new THREE.InstancedMesh(teardropGeometry(), em, MAX_ET);
    this.etRim = new THREE.InstancedMesh(this.etHead.geometry, materials.get('tracerRim'), MAX_ET);
    this.etRim.instanceMatrix = this.etHead.instanceMatrix;
    materials.get('tracerRim').onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position * 1.35;');
    };
    this.etTail = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), em, MAX_ET);
    for (const m of [this.ptTail, this.ptHead, this.etHead, this.etRim, this.etTail]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.hit = {};
    this.onEnemyHit = null; // (enemy, part, point, dir, bullet)
    this.onPlayerHit = null; // (bullet)
    this.onWhiz = null; // (bullet, sidePan)
    this.stats = { hits: 0 };
  }

  reset() {
    this.player.length = 0;
    this.enemy.length = 0;
  }

  // origin/dir: crosshair ray. muzzle: world position of the gun muzzle.
  firePlayer(origin, dir, muzzle, weapon, damage) {
    const w = this.world;
    let conv = 9;
    if (w.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 60, BULLET, this.hit)) conv = Math.max(0.5, Math.min(conv, this.hit.t * 0.85));
    this.player.push({
      ox: origin.x, oy: origin.y, oz: origin.z,
      dx: dir.x, dy: dir.y, dz: dir.z,
      mx: muzzle.x - origin.x, my: muzzle.y - origin.y, mz: muzzle.z - origin.z,
      d: 0, conv, speed: weapon.speed, range: weapon.range, damage, weapon: weapon.id, done: false, age: 0,
    });
  }

  fireEnemy(x, y, z, dx, dy, dz, speed, damage, shooter) {
    if (this.enemy.length >= MAX_ET) this.enemy.shift();
    this.enemy.push({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, speed, damage, shooter, life: 4, whiz: false, minD: 99, done: false });
  }

  // Position of a player tracer at distance d (converging onto the ray).
  tracerPos(b, d, out) {
    const k = Math.max(0, 1 - d / b.conv);
    const kk = k * k * (3 - 2 * k);
    return out.set(b.ox + b.dx * d + b.mx * kk, b.oy + b.dy * d + b.my * kk, b.oz + b.dz * d + b.mz * kk);
  }

  update(dt, enemies, player) {
    const w = this.world, hit = this.hit;
    // ---- player bullets
    for (const b of this.player) {
      if (b.done) continue;
      b.age += dt;
      const step = b.speed * dt;
      const sx = b.ox + b.dx * b.d, sy = b.oy + b.dy * b.d, sz = b.oz + b.dz * b.d;
      let tWorld = Infinity;
      if (w.raycast(sx, sy, sz, b.dx, b.dy, b.dz, step, BULLET, hit)) tWorld = hit.t;
      const eh = enemies.raycast(sx, sy, sz, b.dx, b.dy, b.dz, Math.min(step, tWorld));
      if (eh) {
        b.done = true;
        b.d += eh.t;
        this.stats.hits++;
        if (this.onEnemyHit) this.onEnemyHit(eh.enemy, eh.part, eh.point, _v.set(b.dx, b.dy, b.dz), b);
      } else if (tWorld < Infinity) {
        b.done = true;
        b.d += tWorld;
        this.fx.impact(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, !hit.door);
        if (this.onWorldHit) this.onWorldHit(hit, b);
      } else {
        b.d += step;
        if (b.d > b.range) b.done = true;
      }
    }
    // keep finished bullets one extra frame so the tracer reaches the target
    this.player = this.player.filter((b) => !b.done || (b.fade = (b.fade || 0) + 1) < 2);

    // ---- enemy bullets
    const px = player.x, pz = player.z, py0 = player.y + 0.1, py1 = player.y + player.height - 0.05;
    const cx = player.cam.x, cy = player.cam.y, cz = player.cam.z;
    for (const b of this.enemy) {
      if (b.done) continue;
      b.life -= dt;
      if (b.life <= 0) { b.done = true; continue; }
      const ax = b.x, ay = b.y, az = b.z;
      const step = b.speed * dt;
      const dx = b.vx / b.speed, dy = b.vy / b.speed, dz = b.vz / b.speed;
      let tWorld = step;
      let hitWorld = false;
      if (w.raycast(ax, ay, az, dx, dy, dz, step, BULLET, hit)) { tWorld = hit.t; hitWorld = true; }
      const bx = ax + dx * tWorld, by = ay + dy * tWorld, bz = az + dz * tWorld;
      // player hit?
      if (player.alive && segCapsuleDist(ax, ay, az, bx, by, bz, px, py0, py1, pz) < player.hitRadius) {
        b.done = true;
        if (this.onPlayerHit) this.onPlayerHit(b);
        continue;
      }
      // near miss tracking
      const d = Math.sqrt(segPointDist2(ax, ay, az, bx, by, bz, cx, cy, cz));
      if (d < b.minD) b.minD = d;
      if (!b.whiz && b.minD < 1.7 && player.alive) {
        const past = (cx - bx) * dx + (cy - by) * dy + (cz - bz) * dz < 0;
        if (past || hitWorld) {
          b.whiz = true;
          if (this.onWhiz) this.onWhiz(b, bx, by, bz);
        }
      }
      if (hitWorld) {
        b.done = true;
        this.fx.impact(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, !hit.door, 0.8);
        continue;
      }
      b.x = bx; b.y = by; b.z = bz;
    }
    this.enemy = this.enemy.filter((b) => !b.done);
  }

  // Build instance matrices; called once per rendered frame.
  render() {
    let n = 0;
    for (const b of this.player) {
      if (n >= MAX_PT) break;
      const head = this.tracerPos(b, b.d, _a);
      const tailD = Math.max(0, b.d - Math.min(3.2, 0.6 + b.d * 0.35));
      const tail = this.tracerPos(b, tailD, _b);
      const len = head.distanceTo(tail);
      if (len > 1e-3) {
        _v.subVectors(head, tail).divideScalar(len);
        _q.setFromUnitVectors(UP, _v);
        _m.compose(_s.addVectors(head, tail).multiplyScalar(0.5), _q, _v.set(0.006, len, 0.006));
        this.ptTail.setMatrixAt(n, _m);
      } else {
        this.ptTail.setMatrixAt(n, _m.makeScale(0, 0, 0));
      }
      _m.compose(head, _q.identity(), _v.set(0.017, 0.017, 0.017));
      this.ptHead.setMatrixAt(n, _m);
      n++;
    }
    this.ptTail.count = this.ptHead.count = n;
    if (n) { this.ptTail.instanceMatrix.needsUpdate = true; this.ptHead.instanceMatrix.needsUpdate = true; }

    let e = 0;
    for (const b of this.enemy) {
      if (e >= MAX_ET) break;
      _v.set(b.vx, b.vy, b.vz).normalize();
      _q.setFromUnitVectors(UP, _v);
      _m.compose(_a.set(b.x, b.y, b.z), _q, _s.set(0.06, 0.06, 0.06));
      this.etHead.setMatrixAt(e, _m);
      const tl = Math.min(1.4, (4 - b.life) * b.speed);
      _b.set(b.x - _v.x * (tl / 2 + 0.12), b.y - _v.y * (tl / 2 + 0.12), b.z - _v.z * (tl / 2 + 0.12));
      _m.compose(_b, _q, _s.set(0.009, tl, 0.009));
      this.etTail.setMatrixAt(e, _m);
      e++;
    }
    this.etHead.count = this.etTail.count = this.etRim.count = e;
    if (e) { this.etHead.instanceMatrix.needsUpdate = true; this.etTail.instanceMatrix.needsUpdate = true; }
  }
}
