// Waypoint graph + A*. Nodes are laid out per area by the level; links are
// made automatically wherever an enemy can walk straight between two nodes,
// plus explicit links for stairs, ramps and ladders. Links through doorways
// remember the door so enemies can open it on the way.
//
// Nodes are bucketed in a spatial hash so big levels link and query quickly,
// and linking runs as a generator so loading can spread it over frames.
import { MOVE } from './world.js';

const CELL = 4;

export class NavGraph {
  constructor(world) {
    this.world = world;
    this.nodes = [];
    this.hash = new Map();
  }

  _key(x, z) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; }

  add(x, y, z, area = '') {
    const n = { id: this.nodes.length, x, y, z, area, links: [] };
    this.nodes.push(n);
    const k = this._key(x, z);
    let b = this.hash.get(k);
    if (!b) this.hash.set(k, (b = []));
    b.push(n);
    return n;
  }

  // Remove the most recently added node (used while laying out grids).
  pop() {
    const n = this.nodes.pop();
    const b = this.hash.get(this._key(n.x, n.z));
    if (b) b.splice(b.indexOf(n), 1);
  }

  near(x, z, r, out = []) {
    out.length = 0;
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
    const d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL);
    for (let i = c0; i <= c1; i++) {
      for (let j = d0; j <= d1; j++) {
        const b = this.hash.get(`${i},${j}`);
        if (b) for (const n of b) out.push(n);
      }
    }
    return out;
  }

  link(a, b, door = null, special = null) {
    if (a === b || a.links.some((l) => l.to === b)) return;
    const cost = Math.hypot(a.x - b.x, (a.y - b.y) * 2, a.z - b.z) * (special === 'ladder' ? 2.5 : 1);
    a.links.push({ to: b, door, cost, special });
    b.links.push({ to: a, door, cost, special });
  }

  // Can a body walk in a straight line from a to b on (roughly) level ground?
  walkable(ax, ay, az, bx, by, bz) {
    const w = this.world;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return true;
    const px = (-dz / len) * 0.3, pz = (dx / len) * 0.3;
    for (const [ox, oz, hy] of [[0, 0, 0.45], [0, 0, 1.3], [px, pz, 0.45], [-px, -pz, 0.45], [px, pz, 1.3], [-px, -pz, 1.3]]) {
      if (!w.clear(ax + ox, ay + hy, az + oz, bx + ox, by + hy, bz + oz, MOVE, true)) return false;
    }
    // no holes along the way
    const steps = Math.ceil(len / 0.8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const y = ay + (by - ay) * t;
      const g = w.groundBelow(ax + dx * t, az + dz * t, 0.2, y + 0.3, 0.7);
      if (g === null) return false;
    }
    return true;
  }

  nodeClear(n, r = 0.42) {
    return !this.world.overlaps(n.x, n.z, r, n.y + 0.05, n.y + 1.7);
  }

  // Generator: links neighbours within maxDist; yields progress 0..1.
  *autoLinkGen(maxDist, doors) {
    const nodes = this.nodes;
    const md2 = maxDist * maxDist;
    const tmp = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      this.near(a.x, a.z, maxDist, tmp);
      for (const b of tmp) {
        if (b.id <= a.id) continue;
        if (Math.abs(a.y - b.y) > 0.3) continue;
        const d2 = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
        if (d2 > md2) continue;
        if (a.links.some((l) => l.to === b)) continue;
        if (!this.walkable(a.x, a.y, a.z, b.x, b.y, b.z)) continue;
        let door = null;
        for (const d of doors) {
          if (Math.abs(d.y0 - a.y) < 1 && d.crosses(a.x, a.z, b.x, b.z)) { door = d; break; }
        }
        this.link(a, b, door);
      }
      if (i % 120 === 119) yield i / nodes.length;
    }
  }

  autoLink(maxDist, doors) {
    const g = this.autoLinkGen(maxDist, doors);
    while (!g.next().done) { /* run to completion */ }
  }

  // Nearest node reachable in a straight line from a point.
  nearest(x, y, z, requireWalk = true) {
    let cands = [];
    for (const r of [5, 12, 30]) {
      const list = this.near(x, z, r);
      cands = [];
      for (const n of list) {
        const dy = Math.abs(n.y - y);
        if (dy > 1.6) continue;
        cands.push([(n.x - x) ** 2 + (n.z - z) ** 2 + dy * dy * 4, n]);
      }
      if (cands.length >= 3 || r === 30) break;
    }
    if (!cands.length) {
      for (const n of this.nodes) {
        const dy = Math.abs(n.y - y);
        cands.push([(n.x - x) ** 2 + (n.z - z) ** 2 + dy * dy * 4, n]);
      }
    }
    cands.sort((p, q) => p[0] - q[0]);
    const limit = Math.min(cands.length, 8);
    for (let i = 0; i < limit; i++) {
      const n = cands[i][1];
      if (!requireWalk || this.walkable(x, y, z, n.x, n.y, n.z)) return n;
    }
    return cands.length ? cands[0][1] : null;
  }

  // A* returning [{node, door, special}] from start to goal (start excluded).
  path(start, goal) {
    if (!start || !goal) return null;
    if (start === goal) return [];
    const N = this.nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const f = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const cameLink = new Array(N).fill(null);
    const closed = new Uint8Array(N);
    const heap = [];
    const h = (n) => Math.hypot(n.x - goal.x, n.y - goal.y, n.z - goal.z);
    const push = (id) => {
      heap.push(id);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (f[heap[p]] <= f[heap[i]]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    g[start.id] = 0;
    f[start.id] = h(start);
    push(start.id);
    let expanded = 0;
    while (heap.length) {
      const id = pop();
      if (closed[id]) continue;
      closed[id] = 1;
      if (id === goal.id) break;
      if (++expanded > 6000) break;
      const n = this.nodes[id];
      for (const l of n.links) {
        if (l.special === 'ladder') continue; // enemies don't climb ladders
        if (l.door && l.door.locked) continue;
        const t = l.to.id;
        if (closed[t]) continue;
        const ng = g[id] + l.cost;
        if (ng < g[t]) {
          g[t] = ng; f[t] = ng + h(l.to); came[t] = id; cameLink[t] = l;
          push(t);
        }
      }
    }
    if (came[goal.id] === -1) return null;
    const out = [];
    for (let id = goal.id; id !== start.id; id = came[id]) out.push({ node: this.nodes[id], door: cameLink[id].door, special: cameLink[id].special });
    return out.reverse();
  }
}
