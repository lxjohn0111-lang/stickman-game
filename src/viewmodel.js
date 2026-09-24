// First-person weapon rendered in its own scene/camera on top of the world.
// Guns sit low on the right with the muzzle just below-right of the
// crosshair, forearms rising from the bottom edge of the screen.
import * as THREE from 'three';
import { LineSegments2 } from '../vendor/three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from '../vendor/three/addons/lines/LineSegmentsGeometry.js';
import { PartBuilder, geoCache } from './builder.js';
import { buildGun, GUN_INFO } from './guns.js';
import { makeStarGeometry } from './fx.js';

// Where each gun sits in camera space (right, up, forward).
export const HOLD = {
  smg: { pos: new THREE.Vector3(0.17, -0.18, -0.43), rot: new THREE.Euler(0.08, 0.2, 0), s: 0.8 },
  shotgun: { pos: new THREE.Vector3(0.17, -0.19, -0.34), rot: new THREE.Euler(0.07, 0.17, 0), s: 0.8 },
  rifle: { pos: new THREE.Vector3(0.17, -0.19, -0.36), rot: new THREE.Euler(0.07, 0.18, 0), s: 0.8 },
  pistol: { pos: new THREE.Vector3(0.15, -0.16, -0.45), rot: new THREE.Euler(0.06, 0.18, 0), s: 0.85 },
};

const _v = new THREE.Vector3();

export class ViewModel {
  constructor(materials) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);
    this.ambient = new THREE.AmbientLight(0xffffff, 0);
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.position.set(0.4, 1, 0.6);
    this.scene.add(this.ambient, this.sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.guns = {};
    for (const id of Object.keys(HOLD)) this.guns[id] = this._buildGun(id);
    this.current = null;
    // spring state for recoil (x = displacement, v = velocity)
    this.kx = 0; this.kv = 0;
    this.swayX = 0; this.swayY = 0;
    this.bobT = 0;
    this.equipT = 1;
    this.aim = 0;
    this.sprint = 0;
    this.reloadT = -1;
    this.reloadDur = 1;
    this.pumpT = -1;
    this.slideT = -1;
    this.dropT = -1;
    this.flashFrames = 0;
    this._buildFlash();
  }

  _buildGun(id) {
    const group = new THREE.Group();
    const parts = buildGun(id);
    const lm = this.materials.lines.vm;
    parts.main.build(group, this.materials, { lineMaterial: lm, castShadow: false, receiveShadow: false });
    const movers = {};
    for (const key of ['pump', 'slide', 'mag']) {
      if (!parts[key]) continue;
      const g = new THREE.Group();
      parts[key].build(g, this.materials, { lineMaterial: lm, castShadow: false, receiveShadow: false });
      group.add(g);
      movers[key] = g;
    }
    // arms: right hand on the grip, left hand on the support point; the
    // forearms run down past the bottom edge of the screen.
    const arms = new PartBuilder();
    const info = GUN_INFO[id];
    const rHand = new THREE.Vector3(0.0, -0.035, 0.03);
    const rElbow = new THREE.Vector3(0.1, -0.42, 0.3);
    const lHand = info.support.clone();
    const lElbow = id === 'pistol' ? new THREE.Vector3(-0.2, -0.42, 0.22) : new THREE.Vector3(-0.2, -0.4, lHand.z + 0.32);
    arms.box('hand', rHand.x, rHand.y - 0.01, rHand.z, 0.055, 0.075, 0.085);
    this._forearm(arms, rHand.clone().add(new THREE.Vector3(0.01, -0.03, 0.04)), rElbow, 0.078);
    arms.box('hand', lHand.x - 0.005, lHand.y - 0.028, lHand.z, 0.058, 0.05, 0.09, { rz: info.supportRot });
    this._forearm(arms, lHand.clone().add(new THREE.Vector3(-0.02, -0.04, 0.03)), lElbow, 0.075);
    arms.build(group, this.materials, { lineMaterial: lm, castShadow: false, receiveShadow: false });
    group.visible = false;
    group.scale.setScalar(HOLD[id].s);
    this.root.add(group);
    return { id, group, movers, info, hold: HOLD[id] };
  }

  _forearm(pb, a, b, w) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.normalize().negate());
    const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(w, w, len));
    pb.add('sleeve', this._boxGeom(), m, 'box');
    // cuff line
    const cuff = new THREE.Matrix4().compose(a.clone().lerp(b, 0.12), q, new THREE.Vector3(w * 1.08, w * 1.08, 0.012));
    pb.add('sleeve', this._boxGeom(), cuff, 'box');
  }

  _boxGeom() {
    return geoCache.box();
  }

  _buildFlash() {
    this.flash = new THREE.Group();
    this.flashStar = new THREE.Mesh(makeStarGeometry(10, 0.36), this.materials.get('flash'));
    this.flashCore = new THREE.Mesh(makeStarGeometry(6, 0.5), this.materials.get('flashCore'));
    this.flashCore.scale.setScalar(0.45);
    this.flashCore.position.z = 0.001;
    this.flash.add(this.flashStar, this.flashCore);
    this.flashStar.renderOrder = 5;
    this.flashCore.renderOrder = 6;
    // pre-built variants of 8-10 radiating ink strokes
    this.strokeSets = [];
    for (let v = 0; v < 6; v++) {
      const n = 8 + (v % 3);
      const pos = [];
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const r0 = 0.35 + Math.random() * 0.25, r1 = 0.95 + Math.random() * 0.75;
        pos.push(Math.cos(a) * r0, Math.sin(a) * r0, 0.002, Math.cos(a) * r1, Math.sin(a) * r1, 0.002);
      }
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      const l = new LineSegments2(g, this.materials.lines.flash);
      l.visible = false;
      l.renderOrder = 7;
      this.flash.add(l);
      this.strokeSets.push(l);
    }
    for (const m of [this.flashStar, this.flashCore]) {
      m.material.depthTest = false;
    }
    this.flash.visible = false;
    this.scene.add(this.flash);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(id, instant = false) {
    if (this.current) this.current.group.visible = false;
    this.current = this.guns[id];
    this.current.group.visible = true;
    this.equipT = instant ? 1 : 0;
    this.reloadT = -1;
    this.pumpT = -1;
    this.dropT = -1;
    for (const g of Object.values(this.current.movers)) g.position.set(0, 0, 0);
  }

  // Shot: kick the gun sharply up and back; a stiff spring returns it in ~5 frames.
  kick(strength = 1) {
    this.kx = Math.min(1.6, Math.max(this.kx, 0) + strength);
    this.kv = 0;
    this.flashFrames = 2;
    const set = this.strokeSets[Math.floor(Math.random() * this.strokeSets.length)];
    for (const s of this.strokeSets) s.visible = s === set;
    this.flash.rotation.z = Math.random() * Math.PI;
    const sc = 0.055 + Math.random() * 0.02;
    this.flash.scale.setScalar(sc);
    if (this.current.id === 'pistol') this.slideT = 0;
  }

  pump() { this.pumpT = 0; }
  startReload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  stopReload() { this.reloadT = -1; }
  drop() { this.dropT = 0; }

  // state: {moving (0..1), grounded, aim (bool), sprint (bool), lookDX, lookDY, bob (bool), dead}
  update(dt, s) {
    const cur = this.current;
    if (!cur) return;
    // recoil spring, sub-stepped for stability
    const w = 40, z = 0.72;
    const n = 3, h = dt / n;
    for (let i = 0; i < n; i++) {
      this.kv += (-w * w * this.kx - 2 * z * w * this.kv) * h;
      this.kx += this.kv * h;
    }
    this.aim += ((s.aim ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    this.sprint += ((s.sprint ? 1 : 0) - this.sprint) * Math.min(1, dt * 8);
    this.equipT = Math.min(1, this.equipT + dt / 0.35);
    // sway from mouse movement
    this.swayX += (-s.lookDX * 0.00035 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (s.lookDY * 0.00035 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    // walk bob
    const bobAmt = s.bob ? s.moving * (1 - this.aim * 0.7) : 0;
    this.bobT += dt * (s.sprint ? 13 : 9) * (s.moving > 0.05 ? 1 : 0);

    const hold = cur.hold;
    const g = cur.group;
    const k = this.kx;
    const e = 1 - this.equipT;
    const eq = e * e;
    g.position.copy(hold.pos);
    g.rotation.copy(hold.rot);
    // steady aim: pull the gun in toward the centre
    g.position.x -= this.aim * 0.05;
    g.position.y += this.aim * 0.018;
    g.position.z += this.aim * 0.03;
    // bob
    g.position.x += Math.sin(this.bobT) * 0.011 * bobAmt;
    g.position.y += -Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;
    // sway
    g.position.x += this.swayX;
    g.position.y += this.swayY;
    g.rotation.y += this.swayX * 1.5;
    g.rotation.x += this.swayY * 1.5;
    // recoil: back and up
    g.position.z += k * 0.055;
    g.position.y += k * 0.012;
    g.rotation.x += k * 0.15;
    // sprint pose
    g.rotation.y += this.sprint * 0.55;
    g.rotation.x -= this.sprint * 0.35;
    g.position.y -= this.sprint * 0.04;
    // equip raise
    g.position.y -= eq * 0.3;
    g.rotation.x -= eq * 0.8;
    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur;
      const t = Math.min(1, this.reloadT);
      const down = t < 0.25 ? t / 0.25 : t > 0.78 ? (1 - t) / 0.22 : 1;
      const dd = down * down * (3 - 2 * down);
      g.rotation.x -= dd * 0.45;
      g.rotation.z += dd * 0.5;
      g.position.y -= dd * 0.06;
      g.position.x -= dd * 0.03;
      const mag = cur.movers.mag;
      if (mag && cur.info.magOffset) {
        const out = t > 0.2 && t < 0.62 ? Math.sin(((t - 0.2) / 0.42) * Math.PI) : 0;
        mag.position.copy(cur.info.magOffset).multiplyScalar(out * 1.6);
      }
      if (cur.id === 'shotgun') g.rotation.z += Math.sin(t * Math.PI * 2) * 0.05;
      if (this.reloadT >= 1 && cur.id !== 'shotgun') this.reloadT = -1;
    } else if (cur.movers.mag) cur.movers.mag.position.set(0, 0, 0);
    // pump: back then forward after each shot
    if (this.pumpT >= 0 && cur.movers.pump) {
      this.pumpT += dt;
      const t = (this.pumpT - 0.1) / 0.36;
      const p = t <= 0 ? 0 : t >= 1 ? 0 : Math.sin(t * Math.PI);
      cur.movers.pump.position.z = p * 0.085;
      g.rotation.z += p * 0.05;
      if (t >= 1) this.pumpT = -1;
    }
    if (this.slideT >= 0 && cur.movers.slide) {
      this.slideT += dt;
      const t = this.slideT / 0.07;
      cur.movers.slide.position.z = t < 1 ? (1 - t) * 0.035 : 0;
      if (t >= 1) this.slideT = -1;
    }
    // death: the gun drops away
    if (this.dropT >= 0) {
      this.dropT += dt;
      const t = Math.min(1, this.dropT / 0.7);
      g.position.y -= t * t * 0.55;
      g.rotation.x -= t * 1.1;
      g.rotation.z += t * 0.6;
    }
    // muzzle flash follows the muzzle, facing the camera
    if (this.flashFrames > 0) {
      g.updateMatrixWorld(true);
      this.flash.position.copy(cur.info.muzzle).applyMatrix4(g.matrixWorld);
      this.flash.position.z -= 0.01;
      this.flash.visible = true;
    } else this.flash.visible = false;
  }

  // Called once per rendered frame after drawing, so the flash lasts 2 frames.
  frameRendered() {
    if (this.flashFrames > 0) this.flashFrames--;
  }

  // World-space muzzle position as seen through the main camera.
  muzzleWorld(mainCam, out) {
    const cur = this.current;
    cur.group.updateMatrixWorld(true);
    const p = _v.copy(cur.info.muzzle).applyMatrix4(cur.group.matrixWorld);
    const dist = p.length();
    p.project(this.camera);
    p.z = 0.5;
    p.unproject(mainCam);
    out.copy(p).sub(mainCam.position).normalize().multiplyScalar(dist * 1.2).add(mainCam.position);
    return out;
  }
}
