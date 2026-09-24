// LevelKit: everything a level module needs to build itself.
//  * modular prefabs (walls with windows/doors, rooms, stairs, ramps, ladders,
//    catwalks, containers, fences, trees, lamps, props) built from boxes,
//    cylinders and cones and merged per material role;
//  * data a level registers: player start, enemy spawns and groups,
//    reinforcement entries, checkpoints, secrets, pickups, interactables,
//    destructibles, zones, hazards, areas for captions, minimap shapes;
//  * a staged finalize() that merges geometry and links the nav graph over
//    several frames so loading never blocks for long.
import * as THREE from 'three';
import { StaticBuilder, PartBuilder, geoCache } from './builder.js';
import { Door } from './doors.js';
import { NavGraph } from './nav.js';
import { World, MOVE, BULLET, SIGHT, SOLID, GLASS } from './world.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// direction helpers: 'n' = -Z, 's' = +Z, 'e' = +X, 'w' = -X
const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export class LevelKit {
  constructor(def, materials, { preview = false } = {}) {
    this.def = def;
    this.materials = materials;
    this.preview = preview;
    this.world = new World(def.bounds);
    this.world.groundSurf = def.groundSurf || 'ground';
    this.group = new THREE.Group();
    this.group.name = 'level:' + def.id;
    this.b = new StaticBuilder(this.world);
    this.builders = { main: this.b };
    this.doors = [];
    this.signQuads = [];
    this.nav = new NavGraph(this.world);
    this.map = { rects: [], circles: [], lines: [], bounds: def.mapBounds };
    this.navGrids = [];
    this.navChains = [];
    this.navDoorPairs = [];
    this.navPoints = [];
    this.dynamic = []; // extra per-level objects (gates, belts...) for disposal
    this.data = {
      start: { x: 0, y: 0, z: 0, yaw: 0 },
      spawns: [], entries: [], checkpoints: [], secrets: [], items: [], interacts: [], destructibles: [],
      zones: [], areas: [], conveyors: [], vents: [], presses: [], lifts: [], lamps: [], route: [], tips: [],
      shadowToggles: [], puddles: [], arenas: [],
    };
    this._spawnKey = 0;
  }

  // ------------------------------------------------------------------ builders
  // Switch to a named builder (its meshes can be toggled as a set).
  use(name) {
    if (!this.builders[name]) this.builders[name] = new StaticBuilder(this.world);
    this.b = this.builders[name];
    return this.b;
  }

  box(role, x0, y0, z0, x1, y1, z1, o = {}) { return this.b.boxMM(role, x0, y0, z0, x1, y1, z1, o); }
  deco(role, x0, y0, z0, x1, y1, z1, o = {}) { return this.b.boxMM(role, x0, y0, z0, x1, y1, z1, { ...o, col: false }); }
  boxC(role, x, y, z, sx, sy, sz, o = {}) { return this.b.boxMM(role, x - sx / 2, y - sy / 2, z - sz / 2, x + sx / 2, y + sy / 2, z + sz / 2, o); }
  line(ax, ay, az, bx, by, bz) { this.b.line(ax, ay, az, bx, by, bz); }
  detail(ax, ay, az, bx, by, bz) { this.b.fenceLine(ax, ay, az, bx, by, bz); }
  collider(x0, y0, z0, x1, y1, z1, flags = SOLID, tag = null, surf = null) { return this.b.collider(x0, y0, z0, x1, y1, z1, flags, tag, surf); }
  cyl(role, x, y, z, rt, rb, h, seg, o = {}) { this.b.cyl(role, x, y, z, rt, rb, h, seg, o); }
  rod(role, a, b, r, seg = 6, o = {}) { this.b.rod(role, a, b, r, seg, o); }
  mapRect(x0, z0, x1, z1, k) { this.map.rects.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), k }); }
  mapCircle(x, z, r, k) { this.map.circles.push({ x, z, r, k }); }
  mapLine(ax, az, bx, bz, k) { this.map.lines.push({ ax, az, bx, bz, k }); }

  // Short diagonal hatch strokes that mark glass (3-4 per pane, both faces).
  hatch(axis, fixed, a0, a1, y0, y1, count = 4) {
    const w = a1 - a0, h = y1 - y0;
    const L = Math.min(0.42, Math.min(w, h) * 0.34);
    const ca = a0 + w * 0.3, cy = y0 + h * 0.58;
    for (const off of [-0.014, 0.014]) {
      for (let i = 0; i < count; i++) {
        const la = L * (i === 0 || i === count - 1 ? 0.62 : 1);
        const sa = ca + (i - (count - 1) / 2) * 0.1;
        const sy = cy + (i - (count - 1) / 2) * -0.02;
        const p0 = [sa - la * 0.35, sy - la * 0.35], p1 = [sa + la * 0.35, sy + la * 0.35];
        if (axis === 'x') this.b.line(p0[0], p0[1], fixed + off, p1[0], p1[1], fixed + off);
        else this.b.line(fixed + off, p0[1], p0[0], fixed + off, p1[1], p1[0]);
      }
    }
  }

  // Glass pane collider: blocks bodies, lets sight and bullets through (and
  // bullets crack it on the way).
  pane(x0, y0, z0, x1, y1, z1, o = {}) {
    this.b.boxMM(o.role || 'glass', x0, y0, z0, x1, y1, z1, { col: MOVE | GLASS, edges: o.edges });
  }

  // Wall along X (axis 'x', at z = fixed) or along Z (axis 'z', at x = fixed)
  // from a0 to a1, thickness t, openings [{a, b, lo, hi, kind:'window'|'door'|'gap'}].
  wall(role, axis, fixed, t, a0, a1, y0, y1, openings = [], opts = {}) {
    const b = this.b;
    const ops = [...openings].sort((p, q) => p.a - q.a);
    const f0 = fixed - t / 2, f1 = fixed + t / 2;
    const put = (s0, s1, h0, h1) => {
      if (s1 - s0 < 1e-3 || h1 - h0 < 1e-3) return;
      if (axis === 'x') b.boxMM(role, s0, h0, f0, s1, h1, f1, opts);
      else b.boxMM(role, f0, h0, s0, f1, h1, s1, opts);
    };
    let cur = a0;
    for (const op of ops) {
      put(cur, op.a, y0, y1);
      put(op.a, op.b, y0, y0 + op.lo);
      put(op.a, op.b, y0 + op.hi, y1);
      if (op.kind === 'window') {
        const g0 = fixed - 0.01, g1 = fixed + 0.01;
        if (axis === 'x') this.pane(op.a, y0 + op.lo, g0, op.b, y0 + op.hi, g1);
        else this.pane(g0, y0 + op.lo, op.a, g1, y0 + op.hi, op.b);
        this.hatch(axis, fixed, op.a, op.b, y0 + op.lo, y0 + op.hi, op.hatch || 4);
        const s0 = fixed - t / 2 - 0.06, s1 = fixed + t / 2 + 0.06;
        if (axis === 'x') b.boxMM('frame', op.a - 0.05, y0 + op.lo - 0.05, s0, op.b + 0.05, y0 + op.lo, s1, { col: false });
        else b.boxMM('frame', s0, y0 + op.lo - 0.05, op.a - 0.05, s1, y0 + op.lo, op.b + 0.05, { col: false });
        if (op.b - op.a > 1.2 && !op.noMullion) {
          const m = (op.a + op.b) / 2;
          if (axis === 'x') b.boxMM('frame', m - 0.025, y0 + op.lo, fixed - 0.03, m + 0.025, y0 + op.hi, fixed + 0.03, { col: false });
          else b.boxMM('frame', fixed - 0.03, y0 + op.lo, m - 0.025, fixed + 0.03, y0 + op.hi, m + 0.025, { col: false });
        }
      }
      // open gaps at floor level: a nav link straight through the wall
      if (op.kind === 'gap' && op.lo < 0.3 && op.b - op.a > 0.8) {
        const m = (op.a + op.b) / 2, off = t / 2 + 0.9;
        if (axis === 'x') this.navChain([[m, y0, fixed - off], [m, y0, fixed + off]]);
        else this.navChain([[fixed - off, y0, m], [fixed + off, y0, m]]);
      }
      cur = op.b;
    }
    put(cur, a1, y0, y1);
    if (!opts.noMap && (opts.mapAlways || y0 < 1)) {
      if (axis === 'x') this.mapRect(a0, f0, a1, f1, 'wall');
      else this.mapRect(f0, a0, f1, a1, 'wall');
    }
  }

  // Rectangular room: four walls centred on the rectangle edges.
  // o: {role, t, h, n:[openings], s:[], e:[], w:[], floor: role, ceil: role, roof: role}
  room(x0, z0, x1, z1, y0, o = {}) {
    const t = o.t ?? 0.25, h = o.h ?? 3.2, role = o.role || 'wall';
    const y1 = y0 + h;
    const mo = { noMap: o.noMap, mapAlways: o.mapAlways };
    this.wall(role, 'x', z0, t, x0 - t / 2, x1 + t / 2, y0, y1, o.n || [], mo);
    this.wall(role, 'x', z1, t, x0 - t / 2, x1 + t / 2, y0, y1, o.s || [], mo);
    this.wall(role, 'z', x0, t, z0 + t / 2, z1 - t / 2, y0, y1, o.w || [], mo);
    this.wall(role, 'z', x1, t, z0 + t / 2, z1 - t / 2, y0, y1, o.e || [], mo);
    if (o.floor) this.box(o.floor, x0, y0 - 0.2, z0, x1, y0, z1, { edges: o.floorEdges ?? false });
    if (o.ceil) {
      this.deco(o.ceil, x0 - t / 2, y1, z0 - t / 2, x1 + t / 2, y1 + 0.2, z1 + t / 2, { edges: o.ceilEdges ?? true });
      this.collider(x0 - t / 2, y1, z0 - t / 2, x1 + t / 2, y1 + 0.2, z1 + t / 2, SOLID, null, 'roof');
    }
  }

  // Walkable slab (floor of an upper storey, platform, quay).
  slab(role, x0, z0, x1, z1, y, thick = 0.25, o = {}) {
    return this.box(role, x0, y - thick, z0, x1, y, z1, o);
  }

  door(spec) {
    const d = new Door(spec);
    d.buildMesh(this.group, this.materials);
    this.world.doors.push(d);
    this.doors.push(d);
    if (!spec.noNav) this.navDoorPairs.push(d);
    return d;
  }

  sign(text, x, y, z, w, h, facing = 1, axis = 'z') {
    this.signQuads.push({ text, x, y, z, w, h, facing, axis });
  }

  // ------------------------------------------------------------------ layout helpers
  // Invisible walls around the playable area.
  bounds(x0, z0, x1, z1, h = 14) {
    const t = 0.6;
    this.collider(x0 - t, -2, z0 - t, x1 + t, h, z0, MOVE);
    this.collider(x0 - t, -2, z1, x1 + t, h, z1 + t, MOVE);
    this.collider(x0 - t, -2, z0, x0, h, z1, MOVE);
    this.collider(x1, -2, z0, x1 + t, h, z1, MOVE);
  }

  // Visual ground slab (the collision ground is the infinite plane at y=0).
  ground(role, x0, z0, x1, z1, y = 0, o = {}) {
    if (y <= 0.001) this.deco(role, x0, y - 0.3, z0, x1, y, z1, { edges: false, ...o });
    else this.box(role, x0, y - 0.3, z0, x1, y, z1, { edges: false, ...o });
  }

  // Door leaf in a wall opening. axis 'x': wall at z = fixed, leaf from a to
  // a + w along X. axis 'z': wall at x = fixed, leaf along Z.
  doorAt(axis, fixed, a, w = 0.95, y0 = 0, o = {}) {
    if (axis === 'x') return this.door({ hx: a, hz: fixed, angle: 0, w, h: o.h || 2.08, y0, ...o });
    return this.door({ hx: fixed, hz: a, angle: Math.PI / 2, w, h: o.h || 2.08, y0, ...o });
  }

  // Wall openings: a doorway and a window.
  op(a, w = 1.0, hi = 2.12) { return { a, b: a + w, lo: 0, hi, kind: 'door' }; }
  gap(a, w, hi = 3) { return { a, b: a + w, lo: 0, hi, kind: 'gap' }; }
  win(a, w = 1.4, lo = 0.95, hi = 2.3) { return { a, b: a + w, lo, hi, kind: 'window' }; }
  // Evenly spaced windows from a0 to a1 (skipping ranges in `skip`).
  wins(a0, a1, w = 1.4, every = 3, lo = 0.95, hi = 2.3, skip = []) {
    const out = [];
    for (let a = a0; a + w <= a1 + 1e-6; a += every) {
      if (skip.some(([s0, s1]) => a + w > s0 && a < s1)) continue;
      out.push(this.win(a, w, lo, hi));
    }
    return out;
  }

  // ------------------------------------------------------------------ vertical movement
  // Straight stair. (x, z) = centre of the bottom edge; dir = ascent direction.
  stairs({ x, z, y0 = 0, dir = 'n', n = 10, rise = 0.25, run = 0.35, w = 1.4, role = 'concrete', rails = 'both', solid = true, area = '' }) {
    const [dx, dz] = DIRS[dir];
    const ax = -dz, az = dx; // across axis
    const hw = w / 2;
    const pt = (along, across) => [x + dx * along + ax * across, z + dz * along + az * across];
    for (let k = 0; k < n; k++) {
      const top = y0 + rise * (k + 1);
      const [p0x, p0z] = pt(k * run, -hw), [p1x, p1z] = pt((k + 1) * run, hw);
      const bx0 = Math.min(p0x, p1x), bx1 = Math.max(p0x, p1x), bz0 = Math.min(p0z, p1z), bz1 = Math.max(p0z, p1z);
      this.box(role, bx0, solid ? y0 : top - rise - 0.3, bz0, bx1, top, bz1, { edges: false });
      // nose line + riser + side profile
      const [n0x, n0z] = pt(k * run, -hw), [n1x, n1z] = pt(k * run, hw);
      this.line(n0x, top, n0z, n1x, top, n1z);
      this.line(n0x, top - rise, n0z, n1x, top - rise, n1z);
      for (const s of [-hw, hw]) {
        const [ax0, az0] = pt(k * run, s), [ax1, az1] = pt((k + 1) * run, s);
        this.line(ax0, top, az0, ax1, top, az1);
        this.line(ax0, top - rise, az0, ax0, top, az0);
      }
      if (rails) {
        for (const s of rails === 'both' ? [-1, 1] : rails === 'left' ? [-1] : [1]) {
          const [c0x, c0z] = pt(k * run, s * (hw - 0.04)), [c1x, c1z] = pt((k + 1) * run, s * (hw + 0.02));
          this.collider(Math.min(c0x, c1x), top, Math.min(c0z, c1z), Math.max(c0x, c1x), top + 1.0, Math.max(c0z, c1z), MOVE);
        }
      }
    }
    const L = n * run, H = n * rise;
    for (const s of [-hw, hw]) {
      const [a0x, a0z] = pt(0, s), [a1x, a1z] = pt(L, s);
      if (solid) this.line(a0x, y0, a0z, a1x, y0, a1z);
    }
    if (rails) {
      for (const s of rails === 'both' ? [-1, 1] : rails === 'left' ? [-1] : [1]) {
        const off = s * (hw - 0.04);
        const [r0x, r0z] = pt(0.2, off), [r1x, r1z] = pt(L - 0.2, off);
        this.rod('steel', V(r0x, y0 + rise + 0.95, r0z), V(r1x, y0 + H + 0.95, r1z), 0.03, 6);
        for (let k = 0; k <= n; k += 4) {
          const kk = Math.min(k, n - 1);
          const [px, pz] = pt((kk + 0.5) * run, off);
          const top = y0 + rise * (kk + 1);
          this.rod('steel', V(px, top, pz), V(px, top + 0.95, pz), 0.022, 6);
        }
      }
    }
    // nav: a chain up the stair
    const pts = [];
    const [bx, bz] = pt(-0.7, 0);
    pts.push([bx, y0, bz]);
    for (let k = 3; k < n - 1; k += 4) {
      const [mx, mz] = pt((k + 0.5) * run, 0);
      pts.push([mx, y0 + rise * (k + 1), mz]);
    }
    const [tx, tz] = pt(L + 0.7, 0);
    pts.push([tx, y0 + H, tz]);
    this.navChain(pts, null, area);
    this.mapRect(Math.min(bx, tx) - (dz ? hw : 0), Math.min(bz, tz) - (dx ? hw : 0), Math.max(bx, tx) + (dz ? hw : 0), Math.max(bz, tz) + (dx ? hw : 0), 'stair');
    return { x: tx, y: y0 + H, z: tz };
  }

  // Ramp: sloped slab drawn as one rotated box, collided as fine steps.
  ramp({ x, z, y0 = 0, y1 = 1, dir = 'n', len = 6, w = 3, role = 'concrete', rails = null, area = '' }) {
    const [dx, dz] = DIRS[dir];
    const ax = -dz, az = dx;
    const H = y1 - y0;
    const slope = Math.atan2(H, len);
    const hyp = Math.hypot(H, len);
    const cx = x + dx * len / 2, cz = z + dz * len / 2;
    const th = 0.2;
    // rotation so the slab tilts up along dir
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yaw = Math.atan2(-dx, -dz); // local -Z points along dir
    q.setFromEuler(new THREE.Euler(slope, yaw, 0, 'YXZ'));
    const cy = y0 + H / 2 - (th / 2) / Math.cos(slope);
    m.compose(V(cx, cy, cz), q, V(w, th, hyp));
    this.b.add(role, geoCache.box(), m, 'box');
    const steps = Math.max(2, Math.ceil(H / 0.14));
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * len, a1 = ((i + 1) / steps) * len;
      const top = y0 + H * ((i + 1) / steps);
      const p0x = x + dx * a0 + ax * (-w / 2), p0z = z + dz * a0 + az * (-w / 2);
      const p1x = x + dx * a1 + ax * (w / 2), p1z = z + dz * a1 + az * (w / 2);
      this.collider(Math.min(p0x, p1x), y0 - 0.2, Math.min(p0z, p1z), Math.max(p0x, p1x), top, Math.max(p0z, p1z), SOLID, null, role === 'asphalt' ? 'ground' : 'indoor');
    }
    if (rails) {
      for (const s of rails === 'both' ? [-1, 1] : rails === 'left' ? [-1] : [1]) {
        const off = s * (w / 2 - 0.05);
        this.rod('steel', V(x + ax * off, y0 + 1, z + az * off), V(x + dx * len + ax * off, y1 + 1, z + dz * len + az * off), 0.03, 6);
        for (let a = 0; a <= len; a += Math.max(1.5, len / 4)) {
          const py = y0 + H * (a / len);
          this.rod('steel', V(x + dx * a + ax * off, py, z + dz * a + az * off), V(x + dx * a + ax * off, py + 1, z + dz * a + az * off), 0.022, 6);
        }
        const c0x = x + ax * (off - 0.05), c0z = z + az * (off - 0.05), c1x = x + dx * len + ax * (off + 0.05), c1z = z + dz * len + az * (off + 0.05);
        this.collider(Math.min(c0x, c1x), y0, Math.min(c0z, c1z), Math.max(c0x, c1x), y1 + 1, Math.max(c0z, c1z), MOVE);
      }
    }
    const pts = [];
    const nseg = Math.max(2, Math.ceil(len / 1.6));
    for (let i = -1; i <= nseg + 1; i++) {
      const a = Math.max(-0.8, Math.min(len + 0.8, (i / nseg) * len));
      const py = y0 + H * Math.max(0, Math.min(1, a / len));
      pts.push([x + dx * a, py, z + dz * a]);
    }
    this.navChain(pts, null, area);
    this.mapRect(Math.min(x, x + dx * len) - (dz ? w / 2 : 0), Math.min(z, z + dz * len) - (dx ? w / 2 : 0), Math.max(x, x + dx * len) + (dz ? w / 2 : 0), Math.max(z, z + dz * len) + (dx ? w / 2 : 0), 'stair');
  }

  // Ladder against a face. face = the direction the climber looks while climbing.
  ladder({ x, z, y0 = 0, y1 = 3, face = 'n', w = 0.55 }) {
    const [dx, dz] = DIRS[face];
    const ax = -dz, az = dx;
    for (const s of [-1, 1]) {
      const px = x + ax * s * w / 2, pz = z + az * s * w / 2;
      this.rod('steel', V(px, y0, pz), V(px, y1 + 0.9, pz), 0.028, 6);
    }
    for (let y = y0 + 0.3; y < y1 + 0.1; y += 0.32) {
      this.line(x - ax * w / 2, y, z - az * w / 2, x + ax * w / 2, y, z + az * w / 2);
      this.rod('steel', V(x - ax * w / 2, y, z - az * w / 2), V(x + ax * w / 2, y, z + az * w / 2), 0.014, 4, { edges: false });
    }
    // climb volume sits in front of the ladder (on the climber's side)
    const cx = x - dx * 0.35, cz = z - dz * 0.35;
    const hx = dz ? w / 2 + 0.1 : 0.4, hz = dx ? w / 2 + 0.1 : 0.4;
    this.world.ladders.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, y0: y0 - 0.1, y1: y1 + 0.05, top: y1, dx, dz });
    this.navChain([[x - dx * 0.8, y0, z - dz * 0.8], [x + dx * 0.9, y1, z + dz * 0.9]], 'ladder');
  }

  // Raised walkway with a grating floor and railings on the given sides.
  catwalk(x0, z0, x1, z1, y, { rails = 'nsew', role = 'catwalk', gaps = [], legs = true, area = '' } = {}) {
    this.box(role, x0, y - 0.12, z0, x1, y, z1, { surf: 'metal' });
    const along = x1 - x0 > z1 - z0;
    if (along) for (let x = x0 + 0.4; x < x1; x += 0.4) this.detail(x, y + 0.004, z0, x, y + 0.004, z1);
    else for (let z = z0 + 0.4; z < z1; z += 0.4) this.detail(x0, y + 0.004, z, x1, y + 0.004, z);
    const inGap = (side, a) => gaps.some((g) => g.side === side && a > g.a && a < g.b);
    const railSide = (side, ax0, az0, ax1, az1) => {
      const L = Math.hypot(ax1 - ax0, az1 - az0);
      const ux = (ax1 - ax0) / L, uz = (az1 - az0) / L;
      let segStart = 0;
      const segs = [];
      const gs = gaps.filter((g) => g.side === side).sort((p, q) => p.a - q.a);
      for (const g of gs) { segs.push([segStart, g.a - (side === 'n' || side === 's' ? x0 : z0)]); segStart = g.b - (side === 'n' || side === 's' ? x0 : z0); }
      segs.push([segStart, L]);
      for (const [s0, s1] of segs) {
        if (s1 - s0 < 0.2) continue;
        const pa = V(ax0 + ux * s0, y + 1.0, az0 + uz * s0), pb = V(ax0 + ux * s1, y + 1.0, az0 + uz * s1);
        this.rod('steel', pa, pb, 0.025, 6);
        this.rod('steel', V(pa.x, y + 0.5, pa.z), V(pb.x, y + 0.5, pb.z), 0.015, 4, { edges: false });
        for (let a = s0; a <= s1 + 1e-3; a += Math.max(1.2, (s1 - s0) / Math.max(1, Math.round((s1 - s0) / 1.8)))) {
          this.rod('steel', V(ax0 + ux * a, y, az0 + uz * a), V(ax0 + ux * a, y + 1.0, az0 + uz * a), 0.022, 6);
        }
        const c0x = ax0 + ux * s0, c0z = az0 + uz * s0, c1x = ax0 + ux * s1, c1z = az0 + uz * s1;
        this.collider(Math.min(c0x, c1x) - 0.04, y, Math.min(c0z, c1z) - 0.04, Math.max(c0x, c1x) + 0.04, y + 1.05, Math.max(c0z, c1z) + 0.04, MOVE);
      }
      void inGap;
    };
    if (rails.includes('n')) railSide('n', x0, z0, x1, z0);
    if (rails.includes('s')) railSide('s', x0, z1, x1, z1);
    if (rails.includes('w')) railSide('w', x0, z0, x0, z1);
    if (rails.includes('e')) railSide('e', x1, z0, x1, z1);
    if (legs && y > 0.5) {
      const lx = [x0 + 0.1, x1 - 0.1], lz = [z0 + 0.1, z1 - 0.1];
      const len = Math.max(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 5));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = along ? x0 + 0.1 + (x1 - x0 - 0.2) * t : null;
        const pz = along ? null : z0 + 0.1 + (z1 - z0 - 0.2) * t;
        for (const o of along ? lz : lx) {
          const X = along ? px : o, Z = along ? o : pz;
          this.box('steel', X - 0.06, 0, Z - 0.06, X + 0.06, y - 0.12, Z + 0.06);
        }
      }
    }
    this.navGrid(x0 + 0.5, x1 - 0.5, z0 + 0.5, z1 - 0.5, y, 1.5, area);
    this.mapRect(x0, z0, x1, z1, 'walk');
  }

  // ------------------------------------------------------------------ props
  // Shipping container. rot 0 = long along X. doors: null | 'a' | 'b' | 'both'
  // (a = -X/-Z end). A container with doors is hollow and walkable inside.
  container(x, z, { y = 0, rot = 0, len = 12.2, role = 'cont1', doors = null } = {}) {
    const W = 2.44, H = 2.6;
    const hl = len / 2, hw = W / 2;
    const bx0 = rot ? x - hw : x - hl, bx1 = rot ? x + hw : x + hl;
    const bz0 = rot ? z - hl : z - hw, bz1 = rot ? z + hl : z + hw;
    if (!doors) {
      this.box(role, bx0, y, bz0, bx1, y + H, bz1, { surf: 'metal' });
    } else {
      const t = 0.08;
      // shell: floor, roof, two long walls; ends open or doors
      this.box(role, bx0, y, bz0, bx1, y + 0.12, bz1, { surf: 'metal', edges: false });
      this.box(role, bx0, y + H - 0.1, bz0, bx1, y + H, bz1, { surf: 'metal' });
      if (rot) {
        this.box(role, bx0, y, bz0, bx0 + t, y + H, bz1, { surf: 'metal' });
        this.box(role, bx1 - t, y, bz0, bx1, y + H, bz1, { surf: 'metal' });
      } else {
        this.box(role, bx0, y, bz0, bx1, y + H, bz0 + t, { surf: 'metal' });
        this.box(role, bx0, y, bz1 - t, bx1, y + H, bz1, { surf: 'metal' });
      }
      const ends = doors === 'both' ? ['a', 'b'] : [doors];
      for (const end of ['a', 'b']) {
        const hasDoor = ends.includes(end);
        if (!hasDoor) {
          if (rot) this.box(role, bx0, y, end === 'a' ? bz0 : bz1 - t, bx1, y + H, end === 'a' ? bz0 + t : bz1, { surf: 'metal' });
          else this.box(role, end === 'a' ? bx0 : bx1 - t, y, bz0, end === 'a' ? bx0 + t : bx1, y + H, bz1, { surf: 'metal' });
          continue;
        }
        // two leaves hinged at the corners
        const lw = W / 2 - 0.02;
        if (rot) {
          const ez = end === 'a' ? bz0 : bz1;
          this.door({ hx: bx0 + 0.02, hz: ez, angle: 0, w: lw, h: H - 0.2, y0: y + 0.12, role, panels: false, name: 'Container door' });
          this.door({ hx: bx1 - 0.02, hz: ez, angle: Math.PI, w: lw, h: H - 0.2, y0: y + 0.12, role, panels: false, name: 'Container door', noNav: true });
        } else {
          const ex = end === 'a' ? bx0 : bx1;
          this.door({ hx: ex, hz: bz0 + 0.02, angle: Math.PI / 2, w: lw, h: H - 0.2, y0: y + 0.12, role, panels: false, name: 'Container door' });
          this.door({ hx: ex, hz: bz1 - 0.02, angle: -Math.PI / 2, w: lw, h: H - 0.2, y0: y + 0.12, role, panels: false, name: 'Container door', noNav: true });
        }
      }
      // inside nav
      if (rot) this.navGrid(x, x, bz0 + 1.2, bz1 - 1.2, y + 0.12, 2.2);
      else this.navGrid(bx0 + 1.2, bx1 - 1.2, z, z, y + 0.12, 2.2);
    }
    // corrugation ribs on the long sides
    const e = 0.004;
    if (rot) {
      for (let zz = bz0 + 0.3; zz < bz1 - 0.2; zz += 0.3) {
        this.detail(bx0 - e, y + 0.1, zz, bx0 - e, y + H - 0.1, zz);
        this.detail(bx1 + e, y + 0.1, zz, bx1 + e, y + H - 0.1, zz);
      }
    } else {
      for (let xx = bx0 + 0.3; xx < bx1 - 0.2; xx += 0.3) {
        this.detail(xx, y + 0.1, bz0 - e, xx, y + H - 0.1, bz0 - e);
        this.detail(xx, y + 0.1, bz1 + e, xx, y + H - 0.1, bz1 + e);
      }
    }
    if (y < 0.5) this.mapRect(bx0, bz0, bx1, bz1, 'block');
    return { x0: bx0, z0: bz0, x1: bx1, z1: bz1, top: y + H };
  }

  // Chain-link fence (blocks movement only; bullets pass).
  fence(ax, az, bx, bz, { h = 2.3, wire = true } = {}) {
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L;
    const H = h;
    const nPosts = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= nPosts; i++) {
      const t = (i / nPosts) * L;
      const x = ax + ux * t, z = az + uz * t;
      this.cyl('steel', x, H / 2 + 0.1, z, 0.045, 0.045, H + 0.2, 6);
      if (wire) this.rod('steel', V(x, H + 0.2, z), V(x - uz * 0.25, H + 0.45, z + ux * 0.25), 0.015, 4, { edges: false });
    }
    this.rod('steel', V(ax, H, az), V(bx, H, bz), 0.025, 6);
    this.rod('steel', V(ax, 0.08, az), V(bx, 0.08, bz), 0.015, 4, { edges: false });
    if (wire) {
      for (let s = 0; s < 2; s++) {
        const off = 0.1 + s * 0.12, hy = H + 0.25 + s * 0.12;
        this.line(ax - uz * off, hy, az + ux * off, bx - uz * off, hy, bz + ux * off);
        for (let t = 0.2; t < L; t += 0.5) {
          const x = ax + ux * t - uz * off, z = az + uz * t + ux * off;
          this.detail(x - ux * 0.05, hy - 0.05, z - uz * 0.05, x + ux * 0.05, hy + 0.05, z + uz * 0.05);
        }
      }
    }
    const S = 0.3, y0 = 0.08, y1 = H;
    const hh = y1 - y0;
    for (let s0 = -hh; s0 < L; s0 += S) {
      for (const dir of [1, -1]) {
        let uA, yA, uB, yB;
        if (dir === 1) { uA = s0; yA = y0; uB = s0 + hh; yB = y1; } else { uA = s0; yA = y1; uB = s0 + hh; yB = y0; }
        if (uA < 0) { const k = -uA / (uB - uA); yA = yA + (yB - yA) * k; uA = 0; }
        if (uB > L) { const k = (L - uA) / (uB - uA); yB = yA + (yB - yA) * k; uB = L; }
        if (uB - uA < 0.01) continue;
        this.detail(ax + ux * uA, yA, az + uz * uA, ax + ux * uB, yB, az + uz * uB);
      }
    }
    const t = 0.05;
    this.collider(Math.min(ax, bx) - t, 0, Math.min(az, bz) - t, Math.max(ax, bx) + t, H + 0.3, Math.max(az, bz) + t, MOVE, 'fence');
    this.mapLine(ax, az, bx, bz, 'fence');
  }

  pine(x, z, s = 1, y = 0) {
    this.cyl('trunk', x, y + 0.65 * s, z, 0.13 * s, 0.17 * s, 1.3 * s, 7);
    this.cyl('pine', x, y + 2.1 * s, z, 0, 1.65 * s, 2.3 * s, 7);
    this.cyl('pine', x, y + 3.35 * s, z, 0, 1.25 * s, 2.0 * s, 7, { ry: 0.4 });
    this.cyl('pine', x, y + 4.5 * s, z, 0, 0.85 * s, 1.7 * s, 7, { ry: 0.8 });
    this.collider(x - 0.22 * s, y, z - 0.22 * s, x + 0.22 * s, y + 3 * s, z + 0.22 * s);
    this.mapCircle(x, z, 1.4 * s, 'tree');
  }

  lampPost(x, z, { h = 6, arm = 1, y = 0 } = {}) {
    this.cyl('steel', x, y + h / 2, z, 0.06, 0.09, h, 6);
    this.boxC('steel', x + 0.45 * arm, y + h - 0.1, z, 0.9, 0.07, 0.07, { col: false });
    this.boxC('lamp', x + 0.85 * arm, y + h - 0.2, z, 0.45, 0.14, 0.26, { col: false });
    this.boxC('ink', x + 0.85 * arm, y + h - 0.28, z, 0.36, 0.02, 0.18, { col: false });
    this.collider(x - 0.14, y, z - 0.14, x + 0.14, y + h, z + 0.14);
    this.data.lamps.push({ x: x + 0.85 * arm, y: y + h - 0.3, z });
    this.mapCircle(x, z, 0.3, 'lamp');
    return V(x, y + h - 0.05, z);
  }

  cable(a, c, sag = 0.55, seg = 10) {
    let prev = a;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const p = V(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (c.z - a.z) * t);
      this.line(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  }

  crate(x, y, z, s = 1.1) {
    this.box('crate', x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2);
    const e = 0.004;
    this.line(x - s / 2, y + 0.05, z + s / 2 + e, x + s / 2, y + s - 0.05, z + s / 2 + e);
    this.line(x - s / 2, y + 0.05, z - s / 2 - e, x + s / 2, y + s - 0.05, z - s / 2 - e);
    this.line(x + s / 2 + e, y + 0.05, z - s / 2, x + s / 2 + e, y + s - 0.05, z + s / 2);
    this.line(x - s / 2 - e, y + 0.05, z - s / 2, x - s / 2 - e, y + s - 0.05, z + s / 2);
    for (const f of [-1, 1]) {
      this.line(x - s / 2, y + s - 0.12, z + f * (s / 2 + e), x + s / 2, y + s - 0.12, z + f * (s / 2 + e));
      this.line(x - s / 2, y + 0.12, z + f * (s / 2 + e), x + s / 2, y + 0.12, z + f * (s / 2 + e));
    }
    if (y < 0.5) this.mapRect(x - s / 2, z - s / 2, x + s / 2, z + s / 2, 'cover');
  }

  crateStack(x, z, y = 0) {
    this.crate(x, y, z);
    this.crate(x + 1.15, y, z + 0.1);
    this.crate(x + 0.55, y + 1.1, z + 0.05, 1.0);
  }

  // Jersey barrier (0.9 m) along X or Z.
  barrier(x, z, along = 'x', len = 3.0, y = 0) {
    const hx = along === 'x' ? len / 2 : 0.31, hz = along === 'x' ? 0.31 : len / 2;
    const tx = along === 'x' ? len / 2 : 0.16, tz = along === 'x' ? 0.16 : len / 2;
    this.deco('barrier', x - hx, y, z - hz, x + hx, y + 0.32, z + hz);
    this.deco('barrier', x - tx, y + 0.32, z - tz, x + tx, y + 0.9, z + tz);
    this.b.boxMM('stripe', x - (along === 'x' ? hx * 0.6 : tx + 0.002), y + 0.55, z - (along === 'x' ? tz + 0.002 : hz * 0.6),
      x + (along === 'x' ? hx * 0.6 : tx + 0.002), y + 0.7, z + (along === 'x' ? tz + 0.002 : hz * 0.6), { col: false, edges: false });
    this.collider(x - hx, y, z - hz, x + hx, y + 0.9, z + hz, SOLID, null, 'indoor');
    this.mapRect(x - hx, z - hz, x + hx, z + hz, 'cover');
  }

  drum(x, z, y = 0, role = 'steel') {
    this.cyl(role, x, y + 0.45, z, 0.3, 0.3, 0.9, 10);
    this.line(x - 0.3, y + 0.3, z, x + 0.3, y + 0.3, z);
    this.collider(x - 0.3, y, z - 0.3, x + 0.3, y + 0.9, z + 0.3, SOLID, null, 'metal');
  }

  // Sandbag wall: stacked courses with offset joints.
  sandbags(x0, z0, x1, z1, h = 1.1, y = 0) {
    this.box('sandbag', x0, y, z0, x1, y + h, z1, { edges: true, surf: 'ground' });
    const along = x1 - x0 > z1 - z0;
    const L = along ? x1 - x0 : z1 - z0;
    for (let yy = y + 0.22, r = 0; yy < y + h - 0.05; yy += 0.22, r++) {
      for (const f of along ? [z0 - 0.003, z1 + 0.003] : [x0 - 0.003, x1 + 0.003]) {
        if (along) this.detail(x0, yy, f, x1, yy, f); else this.detail(f, yy, z0, f, yy, z1);
        for (let a = (r % 2) * 0.3 + 0.6; a < L; a += 0.6) {
          if (along) this.detail(x0 + a, yy - 0.22, f, x0 + a, yy, f); else this.detail(f, yy - 0.22, z0 + a, f, yy, z0 + a);
        }
      }
    }
    this.mapRect(x0, z0, x1, z1, 'cover');
  }

  // Low-poly rock formation.
  rock(x, z, r, h, seed = 1, y = 0) {
    const R = rng(seed);
    const seg = 5 + Math.floor(R() * 3);
    this.cyl('rock', x, y + h / 2, z, r * (0.45 + R() * 0.2), r, h, seg, { ry: R() * 3 });
    if (R() > 0.3) this.cyl('rock', x + r * 0.35, y + h * 0.3, z - r * 0.2, r * 0.3, r * 0.55, h * 0.6, 5, { ry: R() * 3 });
    this.collider(x - r * 0.8, y, z - r * 0.8, x + r * 0.8, y + h, z + r * 0.8, SOLID, null, 'ground');
    this.mapCircle(x, z, r, 'rock');
  }

  // Ridge tent: triangular prism on four short walls.
  tent(x, z, w, l, h, rot = 0, role = 'tent') {
    this.cyl(role, x, h / 3, z, 1, 1, l, 3, { rx: -Math.PI / 2, ry: rot ? Math.PI / 2 : 0, sx: w / 2 / 0.866, sz: h / 1.5 });
    const x0 = x - (rot ? l : w) / 2, x1 = x + (rot ? l : w) / 2, z0 = z - (rot ? w : l) / 2, z1 = z + (rot ? w : l) / 2;
    this.collider(x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, h * 0.75, z1 - 0.2, SOLID, null, 'ground');
    this.mapRect(x0, z0, x1, z1, 'block');
  }

  // Parked car (cover). rot 0 = long along X.
  car(x, z, rot = 0, role = 'car1') {
    const L = 4.2, W = 1.8;
    const hx = rot ? W / 2 : L / 2, hz = rot ? L / 2 : W / 2;
    this.box(role, x - hx, 0.3, z - hz, x + hx, 0.95, z + hz, { col: false });
    const cx = rot ? 0 : -0.2, cz = rot ? -0.2 : 0;
    const chx = rot ? W / 2 - 0.12 : 1.1, chz = rot ? 1.1 : W / 2 - 0.12;
    this.deco(role, x + cx - chx, 0.95, z + cz - chz, x + cx + chx, 1.45, z + cz + chz);
    this.pane(x + cx - chx + 0.05, 1.0, z + cz - chz - 0.01, x + cx + chx - 0.05, 1.4, z + cz - chz + 0.01, { edges: false });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wx = x + (rot ? sx * (W / 2 - 0.05) : sx * 1.35), wz = z + (rot ? sz * 1.35 : sz * (W / 2 - 0.05));
        this.cyl('tire', wx, 0.33, wz, 0.33, 0.33, 0.22, 10, rot ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 });
      }
    }
    this.collider(x - hx, 0, z - hz, x + hx, 1.45, z + hz, SOLID, null, 'metal');
    this.mapRect(x - hx, z - hz, x + hx, z + hz, 'cover');
  }

  tableSet(x, z, { chairs = 4, role = 'table', chairRole = 'chair', w = 1.4, d = 0.9, y = 0 } = {}) {
    this.boxC(role, x, y + 0.745, z, w, 0.05, d, { col: false });
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.boxC(role, x + lx * (w / 2 - 0.08), y + 0.36, z + lz * (d / 2 - 0.08), 0.06, 0.72, 0.06, { col: false });
    this.collider(x - w / 2, y, z - d / 2, x + w / 2, y + 0.77, z + d / 2, MOVE);
    this.collider(x - w / 2, y + 0.69, z - d / 2, x + w / 2, y + 0.77, z + d / 2, BULLET);
    const cs = [[0, -1], [0, 1], [-1, 0], [1, 0]].slice(0, chairs);
    for (const [sx, sz] of cs) {
      const cx = x + sx * (w / 2 + 0.3), cz = z + sz * (d / 2 + 0.3);
      this.boxC(chairRole, cx, y + 0.45, cz, 0.42, 0.04, 0.42, { col: false });
      const bx = cx + sx * 0.19, bz = cz + sz * 0.19;
      this.boxC(chairRole, bx, y + 0.7, bz, sx ? 0.04 : 0.42, 0.46, sz ? 0.04 : 0.42, { col: false });
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) this.boxC(chairRole, cx + lx, y + 0.22, cz + lz, 0.035, 0.44, 0.035, { col: false });
      this.collider(cx - 0.22, y, cz - 0.22, cx + 0.22, y + 0.93, cz + 0.22, MOVE);
    }
    if (y < 0.5) this.mapRect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'table');
  }

  shelf(x0, z0, x1, z1, h = 1.8, y = 0) {
    this.box('steel', x0, y, z0, x1, y + h, z1);
    const along = x1 - x0 > z1 - z0;
    for (let yy = y + 0.45; yy < y + h; yy += 0.45) {
      for (const f of along ? [z0 - 0.003, z1 + 0.003] : [x0 - 0.003, x1 + 0.003]) {
        if (along) this.line(x0, yy, f, x1, yy, f); else this.line(f, yy, z0, f, yy, z1);
      }
    }
    this.mapRect(x0, z0, x1, z1, 'prop');
  }

  // Ceiling or wall lamp. Registered so levels can flicker / reflect them.
  lampLight(x, y, z, { sx = 0.9, sz = 0.3, role = 'lamp' } = {}) {
    this.boxC(role, x, y, z, sx, 0.06, sz, { col: false });
    this.data.lamps.push({ x, y, z });
  }

  // ------------------------------------------------------------------ machinery
  // Conveyor belt from (x0,z0) to (x1,z1), top at y, moving along dir.
  conveyor({ x0, z0, x1, z1, y = 0.9, dir = 'e', speed = 1.6 }) {
    const [dx, dz] = DIRS[dir];
    this.box('machine', x0, 0, z0, x1, y - 0.06, z1, { col: false });
    const col = this.collider(x0, 0, z0, x1, y, z1, SOLID, 'belt', 'metal');
    col.conv = { vx: dx * speed, vz: dz * speed, on: true };
    // rollers at both ends
    const along = dx !== 0;
    const L = along ? x1 - x0 : z1 - z0, W = along ? z1 - z0 : x1 - x0;
    for (const e of [0, 1]) {
      const px = along ? (e ? x1 : x0) : (x0 + x1) / 2, pz = along ? (z0 + z1) / 2 : (e ? z1 : z0);
      this.cyl('steel', px, y - 0.08, pz, 0.1, 0.1, W + 0.1, 10, along ? { rx: Math.PI / 2 } : { rz: Math.PI / 2 });
    }
    for (let a = 0.8; a < L; a += 1.6) {
      const px = along ? x0 + a : x0 + 0.05, pz = along ? z0 + 0.05 : z0 + a;
      this.deco('steel', px - 0.04, 0, pz - 0.04, px + 0.04, y - 0.06, pz + 0.04);
    }
    // the belt surface itself: its own mesh with UVs so the texture can scroll
    const geo = new THREE.PlaneGeometry(W, L);
    geo.rotateX(-Math.PI / 2);
    if (along) geo.rotateY(Math.PI / 2);
    if (dir === 's' || dir === 'w') geo.rotateY(Math.PI);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 1.2), uv.getY(i) * (L / 1.2));
    geo.translate((x0 + x1) / 2, y + 0.004, (z0 + z1) / 2);
    const mesh = new THREE.Mesh(geo, this.materials.get('belt'));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.line(x0, y, z0, x1, y, z0); this.line(x0, y, z1, x1, y, z1);
    this.line(x0, y, z0, x0, y, z1); this.line(x1, y, z0, x1, y, z1);
    this.data.conveyors.push({ col, conv: col.conv, x0, z0, x1, z1, y });
    this.mapRect(x0, z0, x1, z1, 'prop');
    return col;
  }

  // Timed steam vent in the floor (grate + pipe + warning light).
  vent({ x, z, y = 0, r = 0.75, h = 2.8, period = 4.8, burst = 1.3, phase = 0 }) {
    this.deco('steel', x - r, y, z - r, x + r, y + 0.03, z + r);
    for (let a = -r + 0.15; a < r; a += 0.15) this.line(x + a, y + 0.035, z - r, x + a, y + 0.035, z + r);
    this.cyl('pipe', x + r + 0.15, y + 1.1, z, 0.08, 0.08, 2.2, 8);
    this.deco('ink', x + r + 0.05, y + 0.85, z - 0.12, x + r + 0.25, y + 1.05, z + 0.12);
    this.data.vents.push({ x, y, z, r, h, period, burst, phase, lx: r + 0.15, ly: 1.3, lz: 0 });
  }

  // Slow press over a line: static frame + moving head with warning light.
  press({ x0, z0, x1, z1, yTop = 3.2, yLow = 0.95, headH = 0.6, period = 5.2, phase = 0, floorY = null }) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const top = yTop + headH + 0.8;
    for (const [px, pz] of [[x0 - 0.35, cz], [x1 + 0.35, cz]]) this.box('machine', px - 0.18, 0, pz - 0.4, px + 0.18, top, pz + 0.4);
    this.box('machine', x0 - 0.55, top, cz - 0.45, x1 + 0.55, top + 0.4, cz + 0.45);
    // floor warning stripes
    const fy = floorY ?? yLow - 0.05;
    this.deco('hazard', x0, fy, z0, x1, fy + 0.008, z1);
    for (let a = x0; a < x1; a += 0.4) this.line(a, fy + 0.012, z0, Math.min(x1, a + 0.3), fy + 0.012, z1);
    const g = new THREE.Group();
    const pb = new PartBuilder();
    pb.box('hazard', cx, yTop + headH / 2, cz, x1 - x0, headH, z1 - z0);
    for (let a = x0 + 0.2; a < x1; a += 0.35) pb.line(a, yTop + 0.02, z1 + 0.003, a + 0.25, yTop + headH - 0.02, z1 + 0.003);
    for (let a = x0 + 0.2; a < x1; a += 0.35) pb.line(a, yTop + 0.02, z0 - 0.003, a + 0.25, yTop + headH - 0.02, z0 - 0.003);
    pb.rod('steel', V(cx, yTop + headH, cz), V(cx, top, cz), 0.12, 8);
    pb.build(g, this.materials, { lineMaterial: this.materials.lines.main });
    this.group.add(g);
    const col = this.world.add(x0, yTop, z0, x1, yTop + headH, z1, SOLID, 'press', 'metal');
    this.data.presses.push({ x0, z0, x1, z1, yTop, yLow, headH, period, phase, col, group: g, lx: x0 - 0.35, ly: top - 0.3, lz: cz + 0.45 });
  }

  // Lift platform between y0 and y1 (moved by script).
  lift({ id, x0, z0, x1, z1, y0, y1, speed = 1.3 }) {
    const g = new THREE.Group();
    const pb = new PartBuilder();
    pb.box('catwalk', (x0 + x1) / 2, y0 - 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0);
    for (let x = x0 + 0.4; x < x1; x += 0.4) pb.line(x, y0 + 0.003, z0, x, y0 + 0.003, z1);
    pb.build(g, this.materials, { lineMaterial: this.materials.lines.main });
    this.group.add(g);
    const col = this.world.add(x0, y0 - 0.3, z0, x1, y0, z1, SOLID, 'lift', 'metal');
    this.data.lifts.push({ id, x0, z0, x1, z1, y0, y1, speed, col, group: g });
  }

  // Text quads on signs (EXIT, NORTH GATE, ...). axis 'z': faces +/-Z; 'x': faces +/-X.
  // ------------------------------------------------------------------ data
  setStart(x, y, z, yaw) { this.data.start = { x, y, z, yaw }; }

  // Enemy spawn. o: {group, weapon, patrol, hold, sniper}
  spawn(x, y, z, yaw, role, o = {}) {
    const s = { key: 's' + (this._spawnKey++), x, y, z, yaw, role, group: o.group || 'main', ...o };
    this.data.spawns.push(s);
    return s;
  }

  // Reinforcement entry point (behind a door, gate, stairway or far away).
  entry(id, x, y, z, yaw = 0, door = null) { this.data.entries.push({ id, x, y, z, yaw, door }); }

  checkpoint(x, y, z, yaw, o = {}) { this.data.checkpoints.push({ x, y, z, yaw, r: o.r || 3.5, need: o.need ?? 0 }); }

  secret(x, y, z) { this.data.secrets.push({ x, y, z }); }

  // Pickup: type 'health' | 'ammo' | 'weapon'. tier 1 = always, 2 = Normal and
  // Easy, 3 = Easy only (difficulty changes pickup frequency, not the map).
  item(type, x, y, z, o = {}) { this.data.items.push({ key: 'i' + this.data.items.length, type, x, y, z, tier: o.tier || 1, ...o }); }

  weapon(id, x, y, z, yaw = 0, o = {}) { this.item('weapon', x, y, z, { weapon: id, yaw, ...o }); }

  // Interactable panel/console. o: {prompt, face, r, panel}
  interact(id, x, y, z, o = {}) {
    const it = { ...o, id, x, y, z, r: o.r || 1.9, prompt: o.prompt || 'prompt.use', face: o.face || null, panel: o.panel !== false };
    this.data.interacts.push(it);
    if (it.panel) {
      const [dx, dz] = DIRS[o.face || 's'];
      const px = x + dx * 0.0, pz = z + dz * 0.0;
      this.boxC('panel', px, y, pz, dz ? 0.7 : 0.18, 0.9, dx ? 0.7 : 0.18, { col: false });
      this.boxC('ink', px + dx * 0.1, y + 0.2, pz + dz * 0.1, dz ? 0.45 : 0.02, 0.25, dx ? 0.45 : 0.02, { col: false });
      for (let i = 0; i < 3; i++) this.boxC('ink', px + dx * 0.1 + (dz ? -0.15 + i * 0.15 : 0), y - 0.2, pz + dz * 0.1 + (dx ? -0.15 + i * 0.15 : 0), dz ? 0.08 : 0.03, 0.08, dx ? 0.08 : 0.03, { col: false });
      this.collider(px - (dz ? 0.35 : 0.09), y - 0.45, pz - (dx ? 0.35 : 0.09), px + (dz ? 0.35 : 0.09), y + 0.45, pz + (dx ? 0.35 : 0.09));
      it.light = { x: px + dx * 0.1, y: y + 0.36, z: pz + dz * 0.1 };
    }
    return it;
  }

  // Destructible object: a mesh group that can be hidden when destroyed.
  // build(pb) draws it into a PartBuilder in world coordinates.
  destructible(id, box, hp, build, wreck) {
    const g = new THREE.Group();
    const pb = new PartBuilder();
    build(pb);
    pb.build(g, this.materials, { lineMaterial: this.materials.lines.main });
    this.group.add(g);
    let w = null;
    if (wreck) {
      w = new THREE.Group();
      const pw = new PartBuilder();
      wreck(pw);
      pw.build(w, this.materials, { lineMaterial: this.materials.lines.main });
      w.visible = false;
      this.group.add(w);
    }
    const col = this.world.add(box[0], box[1], box[2], box[3], box[4], box[5], SOLID, 'destructible:' + id, 'metal');
    this.data.destructibles.push({ id, hp, group: g, wreck: w, col, box });
  }

  zone(id, x0, y0, z0, x1, y1, z1) { this.data.zones.push({ id, x0, y0, z0, x1, y1, z1 }); }

  area(key, x0, z0, x1, z1, y0 = -1e3, y1 = 1e3) { this.data.areas.push({ key, x0, z0, x1, z1, y0, y1 }); }

  tip(key, x0, z0, x1, z1) { this.data.tips.push({ key, x0, z0, x1, z1 }); }

  route(points) { this.data.route = points; }

  // ------------------------------------------------------------------ nav
  navGrid(x0, x1, z0, z1, y, step = 2.5, area = '') { this.navGrids.push({ x0, x1, z0, z1, y, step, area }); }
  navChain(points, special = null, area = '') { this.navChains.push({ points, special, area }); }
  navPoint(x, y, z) { this.navPoints.push([x, y, z]); }

  // ------------------------------------------------------------------ finalize
  // Generator: merges geometry and builds the nav graph, yielding progress.
  *finalize() {
    const mats = this.materials;
    const named = {};
    for (const [name, b] of Object.entries(this.builders)) {
      const grp = name === 'main' ? this.group : new THREE.Group();
      if (name !== 'main') { grp.name = name; this.group.add(grp); }
      named[name] = b.buildStatic(grp, mats);
      yield 0.05;
    }
    if (this.signQuads.length) this.group.add(buildSigns(this.signQuads, mats));
    yield 0.1;
    if (this.preview) return { named };

    const nav = this.nav, w = this.world;
    const addChecked = (x, y, z, area, r = 0.42) => {
      const n = nav.add(x, y, z, area);
      if (!nav.nodeClear(n, r) || w.groundBelow(x, z, 0.2, y + 0.05, 0.3) === null) { nav.pop(); return null; }
      return n;
    };
    for (const gdef of this.navGrids) {
      for (let x = gdef.x0; x <= gdef.x1 + 1e-6; x += gdef.step) {
        for (let z = gdef.z0; z <= gdef.z1 + 1e-6; z += gdef.step) addChecked(x, gdef.y, z, gdef.area);
      }
    }
    for (const [x, y, z] of this.navPoints) addChecked(x, y, z, '', 0.3);
    yield 0.2;
    for (const ch of this.navChains) {
      let prev = null;
      for (const [x, y, z] of ch.points) {
        const n = nav.add(x, y, z, ch.area);
        if (prev) nav.link(prev, n, null, ch.special);
        prev = n;
      }
    }
    for (const d of this.navDoorPairs) {
      const nx = -Math.sin(d.closed), nz = Math.cos(d.closed);
      const a = nav.add(d.cx + nx * 0.9, d.y0, d.cz + nz * 0.9, '');
      const b2 = nav.add(d.cx - nx * 0.9, d.y0, d.cz - nz * 0.9, '');
      nav.link(a, b2, d);
    }
    // link everything that can walk to everything nearby
    const gen = nav.autoLinkGen(3.4, this.doors);
    for (let r = gen.next(); !r.done; r = gen.next()) yield 0.25 + r.value * 0.7;
    return { named };
  }
}

// Text quads for signs, drawn from one canvas atlas per level.
function buildSigns(quads, materials) {
  const texts = [...new Set(quads.map((q) => q.text))];
  const rowH = 96, W = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = rowH * texts.length;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const widths = [];
  texts.forEach((t, i) => {
    let size = 72;
    g.font = `900 ${size}px Arial, Helvetica, sans-serif`;
    while (g.measureText(t).width > W - 20 && size > 20) { size -= 2; g.font = `900 ${size}px Arial, Helvetica, sans-serif`; }
    widths.push(Math.min(1, g.measureText(t).width / (W - 20)));
    g.fillText(t, W / 2, i * rowH + rowH / 2 + 3);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = materials.get('signText');
  if (mat.map) mat.map.dispose();
  mat.map = tex;
  mat.alphaTest = 0.4;
  mat.needsUpdate = true;
  const geoms = [];
  for (const q of quads) {
    const i = texts.indexOf(q.text);
    const pg = new THREE.PlaneGeometry(q.w, q.h);
    const uv = pg.attributes.uv;
    const v0 = 1 - (i + 1) / texts.length, v1 = 1 - i / texts.length;
    const m = Math.max(widths[i], 0.6);
    const u0 = 0.5 - 0.5 * m, u1 = 0.5 + 0.5 * m;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) < 0.5 ? u0 : u1, uv.getY(k) < 0.5 ? v0 : v1);
    if (q.axis === 'x') pg.rotateY(q.facing > 0 ? Math.PI / 2 : -Math.PI / 2);
    else if (q.facing < 0) pg.rotateY(Math.PI);
    pg.translate(q.x, q.y, q.z);
    geoms.push(pg);
  }
  let count = 0, icount = 0;
  for (const gg of geoms) { count += gg.attributes.position.count; icount += gg.index.count; }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const idx = new Uint32Array(icount);
  let o = 0, io = 0;
  for (const gg of geoms) {
    pos.set(gg.attributes.position.array, o * 3);
    nor.set(gg.attributes.normal.array, o * 3);
    uvs.set(gg.attributes.uv.array, o * 2);
    const gi = gg.index.array;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + o;
    o += gg.attributes.position.count;
    io += gi.length;
    gg.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(out, mat);
  mesh.name = 'signs';
  return mesh;
}

// Free GPU memory held by a level's group (materials are shared and kept).
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  if (group.parent) group.parent.remove(group);
}
