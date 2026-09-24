// Weather and ground effects, all instanced and kept around the camera:
//  * rain: falling streaks + fixed reflection streaks under lamps;
//  * snow: drifting flakes + footprints that fade behind moving characters;
//  * dust: blowing specks that thicken the distance without touching the
//    area around the crosshair.
import * as THREE from 'three';
import { makeFootTexture, makeStreakTexture } from './textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const MAX_P = 1000;
const MAX_FOOT = 160;

export class Env {
  constructor(game) {
    this.game = game;
    const mats = game.materials;
    const scene = game.scene;
    const mk = (geo, mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    this.rain = mk(new THREE.BoxGeometry(0.012, 1, 0.012), mats.get('weather'), MAX_P);
    this.snow = mk(new THREE.BoxGeometry(0.045, 0.045, 0.045), mats.get('snowflake'), MAX_P);
    this.dust = mk(new THREE.PlaneGeometry(0.1, 0.1), mats.get('dust'), MAX_P);
    this.dust.material.side = THREE.DoubleSide;
    this.footMat = new THREE.MeshBasicMaterial({ map: makeFootTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const fg = new THREE.PlaneGeometry(0.34, 0.34);
    fg.rotateX(-Math.PI / 2);
    this.feet = mk(fg, this.footMat, MAX_FOOT);
    this.feet.setColorAt(0, new THREE.Color(0x999999));
    this.streakTex = makeStreakTexture();
    this.reflectMat = mats.get('reflect');
    this.reflectMat.map = this.streakTex;
    this.reflectMat.depthWrite = false;
    this.reflectMat.needsUpdate = true;
    const rg = new THREE.PlaneGeometry(0.9, 4.5);
    rg.rotateX(-Math.PI / 2);
    this.reflect = mk(rg, this.reflectMat, 80);
    this.prints = [];
    this.parts = [];
    this.kind = null;
    this.t = 0;
    this.fadeColor = new THREE.Color();
  }

  load(level) {
    const env = level.def.env;
    this.kind = env.weather || null;
    this.parts.length = 0;
    this.prints.length = 0;
    this.feet.count = 0;
    this.rain.count = this.snow.count = this.dust.count = 0;
    this.reflect.count = 0;
    this.snowPrints = !!env.footprints;
    // reflection streaks under lamps on wet streets
    if (env.reflections) {
      let n = 0;
      for (const l of level.data.lamps) {
        if (n >= 80 || l.y > 8) continue;
        _q.setFromAxisAngle(UP, (l.x * 13 + l.z * 7) % 0.6 - 0.3);
        _m.compose(_v.set(l.x, 0.02, l.z + 1.2), _q, _s.set(1, 1, 1));
        this.reflect.setMatrixAt(n++, _m);
      }
      this.reflect.count = n;
      this.reflect.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    this.kind = null;
    this.parts.length = 0;
    this.prints.length = 0;
    this.rain.count = this.snow.count = this.dust.count = this.feet.count = this.reflect.count = 0;
  }

  // Footprint behind a character walking on snow.
  footprint(x, y, z, yaw) {
    if (!this.snowPrints) return;
    if (this.prints.length >= MAX_FOOT) this.prints.shift();
    this.prints.push({ x, y: y + 0.012, z, yaw, t: 0 });
  }

  update(dt, camera) {
    this.t += dt;
    const q = this.game.quality;
    const want = Math.round((this.kind === 'rain' ? 900 : this.kind === 'snow' ? 700 : this.kind === 'dust' ? 420 : 0) * (q.particles || 1));
    const c = camera.position;
    // (re)seed particles around the camera
    while (this.parts.length < want) this.parts.push(this._seed(c, true));
    if (this.parts.length > want) this.parts.length = want;
    let n = 0;
    if (this.kind === 'rain') {
      _q.setFromEuler(_e.set(0.12, 0, 0.05));
      for (const p of this.parts) {
        p.y -= 19 * dt; p.x += 1.2 * dt; p.z += 2.2 * dt;
        if (p.y < c.y - 8 || Math.abs(p.x - c.x) > 22 || Math.abs(p.z - c.z) > 22) Object.assign(p, this._seed(c, false));
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(1, p.s, 1));
        this.rain.setMatrixAt(n++, _m);
      }
      this.rain.count = n;
      this.rain.instanceMatrix.needsUpdate = true;
    } else if (this.kind === 'snow') {
      for (const p of this.parts) {
        p.y -= 1.1 * dt;
        p.x += Math.sin(this.t * 0.7 + p.ph) * 0.5 * dt + 0.3 * dt;
        p.z += Math.cos(this.t * 0.5 + p.ph) * 0.4 * dt;
        if (p.y < c.y - 6 || Math.abs(p.x - c.x) > 26 || Math.abs(p.z - c.z) > 26) Object.assign(p, this._seed(c, false));
        _m.makeTranslation(p.x, p.y, p.z);
        this.snow.setMatrixAt(n++, _m);
      }
      this.snow.count = n;
      this.snow.instanceMatrix.needsUpdate = true;
    } else if (this.kind === 'dust') {
      for (const p of this.parts) {
        p.x += 6.5 * dt; p.z += 1.5 * dt; p.y += Math.sin(this.t * 2 + p.ph) * 0.3 * dt;
        const dx = p.x - c.x, dz = p.z - c.z;
        if (Math.abs(dx) > 30 || Math.abs(dz) > 30 || p.y < 0) Object.assign(p, this._seed(c, false));
        // keep the space right around the camera clear so aim is never blocked
        if (dx * dx + dz * dz < 9) { _m.makeScale(0, 0, 0); this.dust.setMatrixAt(n++, _m); continue; }
        _q.setFromEuler(_e.set(p.ph, this.t + p.ph, 0));
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s, p.s));
        this.dust.setMatrixAt(n++, _m);
      }
      this.dust.count = n;
      this.dust.instanceMatrix.needsUpdate = true;
    }
    // footprints fade into the snow after ~6 s
    if (this.prints.length) {
      const snow = this.game.style === 'neo' ? 0xf4f8ff : 0xffffff;
      let k = 0;
      for (const f of this.prints) {
        f.t += dt;
        if (f.t > 6.5) continue;
        const a = Math.min(1, f.t / 6.5);
        _q.setFromAxisAngle(UP, f.yaw);
        _m.compose(_v.set(f.x, f.y, f.z), _q, _s.set(1, 1, 1));
        this.feet.setMatrixAt(k, _m);
        this.fadeColor.setHex(0x8a93a6).lerp(new THREE.Color(snow), a * a);
        this.feet.setColorAt(k, this.fadeColor);
        k++;
      }
      this.prints = this.prints.filter((f) => f.t <= 6.5);
      this.feet.count = k;
      this.feet.instanceMatrix.needsUpdate = true;
      if (this.feet.instanceColor) this.feet.instanceColor.needsUpdate = true;
    } else this.feet.count = 0;
  }

  _seed(c, anywhere) {
    const r = this.kind === 'dust' ? 30 : this.kind === 'snow' ? 26 : 22;
    const p = { x: c.x + (Math.random() * 2 - 1) * r, z: c.z + (Math.random() * 2 - 1) * r, ph: Math.random() * 6, s: 0.6 + Math.random() * 0.8 };
    if (this.kind === 'rain') p.y = anywhere ? c.y - 8 + Math.random() * 20 : c.y + 10 + Math.random() * 4;
    else if (this.kind === 'snow') p.y = anywhere ? c.y - 6 + Math.random() * 16 : c.y + 9 + Math.random() * 3;
    else p.y = Math.random() * 4;
    return p;
  }
}
