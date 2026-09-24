// Hinged doors. They swing away from whoever opens them (player or enemy),
// block movement, bullets and sight, and are simulated as oriented slabs in
// the collision world.
import * as THREE from 'three';
import { PartBuilder } from './builder.js';
import { SOLID } from './world.js';

const OPEN_ANGLE = (Math.PI / 2) * 0.96;

export class Door {
  // hx,hz: hinge; angle: closed direction of the leaf (radians in XZ, 0 = +X);
  // w: leaf width; h: height; y0: floor height.
  constructor({ hx, hz, angle, w = 0.92, h = 2.08, y0 = 0, t = 0.06, name = 'door', id = null, locked = false, role = 'door', panels = true, speed = 1 }) {
    this.id = id;
    this.locked = locked;
    this.role = role;
    this.panels = panels;
    this.speed = speed;
    this.hx = hx; this.hz = hz;
    this.closed = angle;
    this.angle = angle;
    this.target = angle;
    this.w = w; this.t = t;
    this.y0 = y0; this.y1 = y0 + h;
    this.h = h;
    this.flags = SOLID;
    this.name = name;
    this.isOpen = false;
    this.moving = false;
    this.group = null;
    this.startLocked = locked;
  }

  get cx() { return this.hx + Math.cos(this.closed) * this.w * 0.5; }
  get cz() { return this.hz + Math.sin(this.closed) * this.w * 0.5; }

  buildMesh(scene, materials) {
    const g = new THREE.Group();
    const pb = new PartBuilder();
    const w = this.w, h = this.h, t = this.t;
    pb.box(this.role, w / 2 + 0.01, h / 2, 0, w - 0.02, h - 0.01, t);
    if (!this.panels) {
      // plain leaf (gates, container doors): vertical ribs instead of panels
      for (const s of [-1, 1]) {
        const z = s * (t / 2 + 0.002);
        for (let x = 0.2; x < w - 0.1; x += 0.28) pb.line(x, 0.1, z, x, h - 0.1, z);
      }
      pb.build(g, materials, { lineMaterial: materials.lines.main });
      g.position.set(this.hx, this.y0, this.hz);
      g.rotation.y = -this.angle;
      scene.add(g);
      this.group = g;
      return;
    }
    // panel inset lines on both faces
    for (const s of [-1, 1]) {
      const z = s * (t / 2 + 0.002);
      const x0 = 0.14, x1 = w - 0.14, y0 = 0.18, y1 = h - 0.2, ym = h * 0.52;
      pb.line(x0, y0, z, x1, y0, z); pb.line(x1, y0, z, x1, ym - 0.06, z);
      pb.line(x1, ym - 0.06, z, x0, ym - 0.06, z); pb.line(x0, ym - 0.06, z, x0, y0, z);
      pb.line(x0, ym + 0.06, z, x1, ym + 0.06, z); pb.line(x1, ym + 0.06, z, x1, y1, z);
      pb.line(x1, y1, z, x0, y1, z); pb.line(x0, y1, z, x0, ym + 0.06, z);
      pb.box('ink', w - 0.1, 1.0, s * (t / 2 + 0.035), 0.12, 0.03, 0.03);
      pb.box('ink', w - 0.06, 1.0, s * (t / 2 + 0.018), 0.03, 0.03, 0.035);
    }
    pb.build(g, materials, { lineMaterial: materials.lines.main });
    g.position.set(this.hx, this.y0, this.hz);
    g.rotation.y = -this.angle;
    scene.add(g);
    this.group = g;
  }

  // Which side of the closed door plane a point is on (+1 / -1).
  side(x, z) {
    const nx = -Math.sin(this.closed), nz = Math.cos(this.closed);
    return (x - this.cx) * nx + (z - this.cz) * nz >= 0 ? 1 : -1;
  }

  toggle(x, z) {
    if (this.locked) return false;
    if (this.isOpen) this.close();
    else this.open(x, z);
    return true;
  }

  unlock() { this.locked = false; }

  open(x, z) {
    // Opening by +90deg swings the free end towards the +normal side, so pick
    // the sign that moves it away from the opener.
    this.target = this.closed + (this.side(x, z) > 0 ? -OPEN_ANGLE : OPEN_ANGLE);
    this.isOpen = true;
    this.moving = true;
  }

  close() {
    this.target = this.closed;
    this.isOpen = false;
    this.moving = true;
  }

  reset() {
    this.angle = this.target = this.closed;
    this.isOpen = false;
    this.locked = !!this.startLocked;
    this.moving = false;
    if (this.group) this.group.rotation.y = -this.angle;
  }

  // Snap to a saved state (checkpoint restore).
  setState(open, locked, target) {
    this.isOpen = open;
    this.locked = locked;
    this.angle = this.target = open ? target : this.closed;
    this.moving = false;
    if (this.group) this.group.rotation.y = -this.angle;
  }

  update(dt) {
    if (!this.moving) return;
    const d = this.target - this.angle;
    const step = Math.sign(d) * Math.min(Math.abs(d), dt * (1.2 + Math.abs(d) * 5.5) * this.speed);
    this.angle += step;
    if (Math.abs(this.target - this.angle) < 1e-3) { this.angle = this.target; this.moving = false; }
    this.group.rotation.y = -this.angle;
  }

  // Distance from a point to the leaf's centre line (XZ).
  distanceTo(x, z) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const rx = x - this.hx, rz = z - this.hz;
    const u = Math.max(0, Math.min(this.w, rx * c + rz * s));
    const px = this.hx + c * u, pz = this.hz + s * u;
    return Math.hypot(x - px, z - pz);
  }

  // Does segment a->b cross the closed doorway?
  crosses(ax, az, bx, bz) {
    const ex = this.hx + Math.cos(this.closed) * this.w, ez = this.hz + Math.sin(this.closed) * this.w;
    return segIntersect(ax, az, bx, bz, this.hx, this.hz, ex, ez);
  }
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
