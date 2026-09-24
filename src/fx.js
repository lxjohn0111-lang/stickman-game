// Instanced visual effects: ink/blood decals, growing blood pools, debris and
// blood particles, and enemy muzzle flashes. Each is one draw call.
import * as THREE from 'three';

const MAX_DECALS = 420;
const MAX_POOLS = 24;
const MAX_PARTS = 700;
const MAX_FLASH = 24;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export const INK = new THREE.Color(0x0d0d0d);
export const BLOOD = new THREE.Color(0x6e0a0a);
const BLOOD_DARK = new THREE.Color(0x4a0606);
const GLASS_MARK = new THREE.Color(0x8a96a8);
const GLASS_SHARD = new THREE.Color(0xc8d4e4);

// Starburst built by pinching every other rim vertex of a flat cylinder.
export function makeStarGeometry(points = 10, inner = 0.42) {
  const seg = points * 2;
  const g = new THREE.CylinderGeometry(1, 1, 0.001, seg, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(x, z);
    const k = Math.round(a / ((Math.PI * 2) / seg));
    const f = ((k % 2) + 2) % 2 === 1 ? inner : 1;
    p.setXYZ(i, x * f, p.getY(i), z * f);
  }
  g.rotateX(Math.PI / 2);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export class FX {
  constructor(scene, materials, world) {
    this.world = world;
    this.materials = materials;
    this.inkColor = INK;
    this.q = { particles: 1, decals: 1 }; // quality scales (never gameplay)

    // decals: 2x2 atlas of splat variants, chosen per instance
    const dg = new THREE.PlaneGeometry(1, 1);
    dg.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1));
    materials.decal.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + vec2(mod(aTile, 2.0), floor(aTile / 2.0)) * 0.5;\n#endif');
    };
    this.decals = new THREE.InstancedMesh(dg, materials.decal, MAX_DECALS);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.setColorAt(0, INK);
    this.decals.name = 'decals';
    this.decalNext = 0;
    this.decalTotal = 0;
    scene.add(this.decals);

    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.poolMesh = new THREE.InstancedMesh(pg, materials.poolMat, MAX_POOLS);
    this.poolMesh.count = 0;
    this.poolMesh.frustumCulled = false;
    this.poolMesh.setColorAt(0, BLOOD_DARK);
    this.poolMesh.name = 'pools';
    this.pools = [];
    scene.add(this.poolMesh);

    // particles
    this.partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.partMat, MAX_PARTS);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    this.parts.setColorAt(0, INK);
    this.parts.name = 'particles';
    this.p = [];
    scene.add(this.parts);

    // enemy muzzle flashes (camera-facing starbursts)
    this.flashMesh = new THREE.InstancedMesh(makeStarGeometry(9, 0.38), materials.get('flashWorld'), MAX_FLASH);
    this.flashMesh.frustumCulled = false;
    this.flashMesh.count = 0;
    this.flashMesh.name = 'enemy-flashes';
    this.flashes = [];
    scene.add(this.flashMesh);
  }

  reset() {
    this.decals.count = 0;
    this.decalNext = 0;
    this.decalTotal = 0;
    this.pools.length = 0;
    this.poolMesh.count = 0;
    this.p.length = 0;
    this.parts.count = 0;
    this.flashes.length = 0;
    this.flashMesh.count = 0;
  }

  decal(x, y, z, nx, ny, nz, size, color = INK, tile = -1) {
    const cap = Math.max(40, Math.floor(MAX_DECALS * this.q.decals));
    if (this.decalNext >= cap) this.decalNext = 0;
    const i = this.decalNext;
    this.decalNext = (this.decalNext + 1) % cap;
    this.decalTotal++;
    _n.set(nx, ny, nz).normalize();
    _q.setFromUnitVectors(Z, _n);
    _q2.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
    _q.multiply(_q2);
    _v.set(x + nx * 0.006, y + ny * 0.006, z + nz * 0.006);
    _s.set(size, size, size);
    _m.compose(_v, _q, _s);
    this.decals.setMatrixAt(i, _m);
    this.decals.setColorAt(i, color);
    this.decals.geometry.attributes.aTile.setX(i, tile >= 0 ? tile : Math.floor(Math.random() * 4));
    this.decals.geometry.attributes.aTile.needsUpdate = true;
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor.needsUpdate = true;
    this.decals.count = Math.min(MAX_DECALS, Math.max(this.decals.count, i + 1));
  }

  // Blood pool that grows under a body.
  pool(x, y, z, radius) {
    if (this.pools.length >= MAX_POOLS) this.pools.shift();
    this.pools.push({ x, y: y + 0.004 + this.pools.length * 0.0004, z, r: 0.05, target: radius, rot: Math.random() * Math.PI * 2 });
  }

  particle(x, y, z, vx, vy, vz, size, life, color, kind = 0) {
    if (this.q.particles < 1 && Math.random() > this.q.particles) return;
    if (this.p.length >= MAX_PARTS) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, s: size, life, max: life, c: color, kind, rx: Math.random() * 6, ry: Math.random() * 6, rest: false });
  }

  // Bullet hit on world geometry: ink splat decal with droplets, chips of debris.
  impact(x, y, z, nx, ny, nz, decal = true, scale = 1) {
    if (decal) this.decal(x, y, z, nx, ny, nz, (0.22 + Math.random() * 0.14) * scale, INK);
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 4;
      const vx = nx * sp + (Math.random() - 0.5) * 3;
      const vy = ny * sp + Math.random() * 3;
      const vz = nz * sp + (Math.random() - 0.5) * 3;
      this.particle(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02, vx, vy, vz, 0.025 + Math.random() * 0.04, 0.6 + Math.random() * 0.6, INK, 0);
    }
  }

  // Bullet through a window pane: pale crack mark and a few glinting shards.
  glass(x, y, z, nx, ny, nz) {
    this.decal(x, y, z, nx, ny, nz, 0.3 + Math.random() * 0.12, GLASS_MARK);
    this.decal(x, y, z, -nx, -ny, -nz, 0.26 + Math.random() * 0.1, GLASS_MARK);
    for (let i = 0; i < 6; i++) {
      const sp = 1 + Math.random() * 2.5;
      this.particle(x, y, z, -nx * sp + (Math.random() - 0.5) * 2, Math.random() * 1.5, -nz * sp + (Math.random() - 0.5) * 2, 0.02 + Math.random() * 0.03, 0.7, GLASS_SHARD, 0);
    }
  }

  // Dark red spray along the bullet direction; drops that land leave spots and
  // the spray splatters the wall behind the victim.
  bloodSpray(x, y, z, dx, dy, dz, amount = 1) {
    const n = Math.round(14 * amount);
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 5;
      this.particle(x, y, z,
        dx * sp + (Math.random() - 0.5) * 2.5, dy * sp + Math.random() * 2.2, dz * sp + (Math.random() - 0.5) * 2.5,
        0.03 + Math.random() * 0.045, 0.8 + Math.random() * 0.5, BLOOD, 1);
    }
    const hit = {};
    if (this.world.raycast(x, y, z, dx, dy, dz, 3.6, 2, hit, true)) {
      this.decal(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, (0.55 + Math.random() * 0.45) * (0.7 + amount * 0.3), BLOOD);
    }
  }

  enemyFlash(x, y, z, size = 0.35) {
    if (this.flashes.length >= MAX_FLASH) this.flashes.shift();
    this.flashes.push({ x, y, z, s: size, frames: 2, age: 0, rot: Math.random() * Math.PI });
  }

  update(dt, camera) {
    const world = this.world;
    // flashes normally expire after two rendered frames; also drop stale ones
    for (const f of this.flashes) f.age += dt;
    if (this.flashes.length) this.flashes = this.flashes.filter((f) => f.age < 0.1);
    // particles
    let alive = 0;
    const g = 16;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (!p.rest) {
        p.vy -= g * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
        if (p.vy < 0) {
          const floor = p.floorY !== undefined ? p.floorY : (p.floorY = world.heightAt(p.x, p.z, p.y + 0.05));
          if (ny <= floor) {
            if (p.kind === 1) {
              if (Math.random() < 0.35) this.decal(nx, floor, nz, 0, 1, 0, 0.1 + Math.random() * 0.14, BLOOD);
              p.life = 0;
              continue;
            }
            p.y = floor + p.s * 0.5;
            p.rest = true;
            p.x = nx; p.z = nz;
            p.life = Math.min(p.life, 1.5);
            this.p[alive++] = p;
            continue;
          }
        }
        p.x = nx; p.y = ny; p.z = nz;
        p.rx += dt * 9; p.ry += dt * 7;
      }
      this.p[alive++] = p;
    }
    this.p.length = alive;
    for (let i = 0; i < alive; i++) {
      const p = this.p[i];
      const k = Math.min(1, p.life / Math.min(0.3, p.max)) * p.s;
      _q.setFromEuler(_e.set(p.rx, p.ry, 0));
      _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(k, k, k));
      this.parts.setMatrixAt(i, _m);
      this.parts.setColorAt(i, p.c);
    }
    this.parts.count = alive;
    if (alive) {
      this.parts.instanceMatrix.needsUpdate = true;
      this.parts.instanceColor.needsUpdate = true;
    }

    // pools grow with an ease-out
    for (let i = 0; i < this.pools.length; i++) {
      const p = this.pools[i];
      p.r += (p.target - p.r) * Math.min(1, dt * 0.45);
      _q.setFromAxisAngle(_n.set(0, 1, 0), p.rot);
      _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.r * 2, 1, p.r * 2));
      this.poolMesh.setMatrixAt(i, _m);
      this.poolMesh.setColorAt(i, BLOOD_DARK);
    }
    this.poolMesh.count = this.pools.length;
    if (this.pools.length) {
      this.poolMesh.instanceMatrix.needsUpdate = true;
      this.poolMesh.instanceColor.needsUpdate = true;
    }
  }

  // Flashes count frames, not time: each shows for exactly two frames.
  updateFlashes(camera) {
    let n = 0;
    for (const f of this.flashes) {
      if (f.frames <= 0) continue;
      f.frames--;
      _q.copy(camera.quaternion);
      _q2.setFromAxisAngle(Z, f.rot);
      _q.multiply(_q2);
      _m.compose(_v.set(f.x, f.y, f.z), _q, _s.set(f.s, f.s, f.s));
      this.flashMesh.setMatrixAt(n++, _m);
    }
    this.flashes = this.flashes.filter((f) => f.frames > 0);
    this.flashMesh.count = n;
    if (n) this.flashMesh.instanceMatrix.needsUpdate = true;
  }

  snapshot() {
    return { decals: this.decalTotal, pools: this.pools.map((p) => [p.x, p.z, p.target]) };
  }
}

export { ZERO };
