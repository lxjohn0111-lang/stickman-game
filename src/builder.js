// Collects static primitives (boxes, cylinders, cones) for the whole map and
// merges them into one mesh per material role, plus one fat-line mesh for all
// ink edges. That keeps the static world to ~30 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { LineSegments2 } from '../vendor/three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from '../vendor/three/addons/lines/LineSegmentsGeometry.js';
import { ROLE_DEFS } from './materials.js';
import { SOLID } from './world.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

const BOX_CORNERS = [
  [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
];
const BOX_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export class GeometryCache {
  constructor() {
    this.geoms = new Map();
    this.edges = new Map();
  }
  box() {
    return this._get('box', () => new THREE.BoxGeometry(1, 1, 1), null);
  }
  cyl(rt, rb, h, seg, open = false) {
    const key = `c${rt.toFixed(3)}_${rb.toFixed(3)}_${h.toFixed(3)}_${seg}_${open}`;
    return this._get(key, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), 24);
  }
  sphere(r, ws = 12, hs = 8) {
    return this._get(`s${r}_${ws}_${hs}`, () => new THREE.SphereGeometry(r, ws, hs), null);
  }
  _get(key, make, edgeAngle) {
    let g = this.geoms.get(key);
    if (!g) {
      g = make();
      g.deleteAttribute('uv');
      this.geoms.set(key, g);
      if (edgeAngle !== null) {
        const eg = new THREE.EdgesGeometry(g, edgeAngle);
        this.edges.set(key, eg.attributes.position.array.slice());
        eg.dispose();
      }
    }
    g.userData.key = key;
    return g;
  }
  edgesFor(geom) {
    return this.edges.get(geom.userData.key) || null;
  }
}

export const geoCache = new GeometryCache();

// Build a matrix from position / rotation (euler XYZ or a quaternion) / scale.
export function makeMatrix(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, out = new THREE.Matrix4()) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

export function boxEdgeSegments(matrix, out) {
  const pts = BOX_CORNERS.map((c) => new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(matrix));
  for (const [a, b] of BOX_EDGES) {
    out.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
  }
}

export function pushEdges(edgeArray, matrix, out) {
  for (let i = 0; i < edgeArray.length; i += 3) {
    _v.set(edgeArray[i], edgeArray[i + 1], edgeArray[i + 2]).applyMatrix4(matrix);
    out.push(_v.x, _v.y, _v.z);
  }
}

// A group of role-meshes + one line mesh, used both for the static world
// and for small dynamic objects (doors, viewmodels) that move as a unit.
export class PartBuilder {
  constructor() {
    this.parts = {};
    this.edges = [];
  }

  add(role, geom, matrix, edges = true) {
    const g = geom.clone();
    g.applyMatrix4(matrix);
    (this.parts[role] || (this.parts[role] = [])).push(g);
    if (edges) {
      if (geom.userData.key === 'box' || edges === 'box') boxEdgeSegments(matrix, this.edges);
      else {
        const e = geoCache.edgesFor(geom);
        if (e) pushEdges(e, matrix, this.edges);
      }
    }
  }

  box(role, x, y, z, sx, sy, sz, o = {}) {
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, sx, sy, sz, _m);
    this.add(role, geoCache.box(), _m, o.edges !== false);
    return _m;
  }

  // Cylinder/cone centred at (x,y,z) with its axis along +Y before rotation.
  cyl(role, x, y, z, rt, rb, h, seg, o = {}) {
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1, _m);
    this.add(role, geoCache.cyl(rt, rb, h, seg, !!o.open), _m, o.edges !== false);
    return _m;
  }

  // Cylinder between two points.
  rod(role, a, b, r, seg = 6, o = {}) {
    const dir = _v.subVectors(b, a);
    const len = dir.length();
    dir.divideScalar(len);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _p.addVectors(a, b).multiplyScalar(0.5);
    _s.set(1, len, 1);
    _m.compose(_p, _q, _s);
    this.add(role, geoCache.cyl(r, r, 1, seg), _m, o.edges !== false);
  }

  sphere(role, x, y, z, r, o = {}) {
    makeMatrix(x, y, z, 0, 0, 0, 1, 1, 1, _m);
    this.add(role, geoCache.sphere(r, o.ws || 12, o.hs || 8), _m, false);
  }

  line(ax, ay, az, bx, by, bz) {
    this.edges.push(ax, ay, az, bx, by, bz);
  }

  // Merge everything into meshes attached to `parent`.
  build(parent, materials, { lineMaterial, castShadow = true, receiveShadow = true, renderOrder } = {}) {
    const meshes = [];
    for (const [role, list] of Object.entries(this.parts)) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials.get(role));
      const def = ROLE_DEFS[role] || {};
      mesh.castShadow = castShadow && def.shadow !== false && !def.transparent;
      mesh.receiveShadow = receiveShadow;
      mesh.name = 'role:' + role;
      if (renderOrder !== undefined) mesh.renderOrder = renderOrder;
      parent.add(mesh);
      meshes.push(mesh);
    }
    let lines = null;
    if (this.edges.length && lineMaterial) {
      const lg = new LineSegmentsGeometry();
      lg.setPositions(this.edges);
      lines = new LineSegments2(lg, lineMaterial);
      lines.name = 'ink-edges';
      if (renderOrder !== undefined) lines.renderOrder = renderOrder;
      parent.add(lines);
    }
    this.parts = {};
    this.edges = [];
    return { meshes, lines };
  }
}

// Static-world builder: PartBuilder + colliders + extra line sets.
export class StaticBuilder extends PartBuilder {
  constructor(world) {
    super();
    this.world = world;
    this.fenceEdges = [];
  }

  // Axis-aligned box from min/max corners; adds a collider unless col === false.
  boxMM(role, x0, y0, z0, x1, y1, z1, o = {}) {
    if (role) this.box(role, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, o);
    const col = o.col === undefined ? SOLID : o.col;
    if (col) this.world.add(x0, y0, z0, x1, y1, z1, col, o.tag);
  }

  collider(x0, y0, z0, x1, y1, z1, flags = SOLID, tag) {
    this.world.add(x0, y0, z0, x1, y1, z1, flags, tag);
  }

  fenceLine(ax, ay, az, bx, by, bz) {
    this.fenceEdges.push(ax, ay, az, bx, by, bz);
  }

  buildStatic(scene, materials) {
    const fence = this.fenceEdges;
    const out = this.build(scene, materials, { lineMaterial: materials.lines.main });
    if (fence.length) {
      const lg = new LineSegmentsGeometry();
      lg.setPositions(fence);
      const fl = new LineSegments2(lg, materials.lines.fence);
      fl.name = 'fence-lattice';
      scene.add(fl);
      out.fence = fl;
    }
    this.fenceEdges = [];
    return out;
  }
}
