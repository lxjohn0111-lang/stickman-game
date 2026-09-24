// Collision world: axis-aligned boxes in a uniform XZ grid, plus swinging
// doors (oriented boxes) and an infinite ground plane at y = 0.
//
// Character movement follows three rules that avoid classic FPS bugs:
//  * step-ups (stairs, kerbs) only happen while grounded, so a jump can't
//    mantle the 1.05 m parapet;
//  * vertical collisions only resolve against surfaces the body actually
//    crossed this step, so brushing a tall collider never teleports you on top;
//  * walking down stairs snaps the body to the ground instead of bouncing.

export const MOVE = 1; // blocks bodies
export const BULLET = 2; // stops bullets
export const SIGHT = 4; // blocks line of sight
export const SOLID = MOVE | BULLET | SIGHT;

const EPS = 1e-3;

export class World {
  constructor() {
    this.cs = 4;
    this.ox = -140;
    this.oz = -160;
    this.nx = 70;
    this.nz = 70;
    this.cells = new Array(this.nx * this.nz);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.cols = [];
    this.doors = [];
    this.stamp = 1;
    this._list = [];
    this._mlist = [];
    this._olist = [];
    this._glist = [];
    this._ax = -1;
  }

  add(x0, y0, z0, x1, y1, z1, f = SOLID, tag = null) {
    const c = { x0, y0, z0, x1, y1, z1, f, tag, s: 0, i: this.cols.length };
    this.cols.push(c);
    const r = this._range(x0, z0, x1, z1);
    for (let j = r[2]; j <= r[3]; j++) for (let i = r[0]; i <= r[1]; i++) this.cells[j * this.nx + i].push(c);
    return c;
  }

  _range(x0, z0, x1, z1) {
    const cs = this.cs;
    const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
    return [
      cl(Math.floor((x0 - this.ox) / cs), this.nx), cl(Math.floor((x1 - this.ox) / cs), this.nx),
      cl(Math.floor((z0 - this.oz) / cs), this.nz), cl(Math.floor((z1 - this.oz) / cs), this.nz),
    ];
  }

  // Unique colliders whose cells overlap the XZ rectangle.
  gather(x0, z0, x1, z1, out = this._list) {
    out.length = 0;
    const st = ++this.stamp;
    const r = this._range(x0, z0, x1, z1);
    for (let j = r[2]; j <= r[3]; j++) {
      for (let i = r[0]; i <= r[1]; i++) {
        const cell = this.cells[j * this.nx + i];
        for (let k = 0; k < cell.length; k++) {
          const c = cell[k];
          if (c.s !== st) { c.s = st; out.push(c); }
        }
      }
    }
    return out;
  }

  _rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    let tmin = -Infinity, tmax = Infinity, ax = -1;
    if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; } else {
      const inv = 1 / dx; let a = (x0 - ox) * inv, b = (x1 - ox) * inv;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > tmin) { tmin = a; ax = 0; }
      if (b < tmax) tmax = b;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; } else {
      const inv = 1 / dy; let a = (y0 - oy) * inv, b = (y1 - oy) * inv;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > tmin) { tmin = a; ax = 1; }
      if (b < tmax) tmax = b;
    }
    if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; } else {
      const inv = 1 / dz; let a = (z0 - oz) * inv, b = (z1 - oz) * inv;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > tmin) { tmin = a; ax = 2; }
      if (b < tmax) tmax = b;
    }
    if (tmax < 0 || tmin > tmax) return -1;
    if (tmin < 0) { this._ax = -2; return 0; }
    this._ax = ax;
    return tmin;
  }

  // Ray against boxes, the ground plane and doors. dir must be normalised.
  // Fills `hit` {t, x,y,z, nx,ny,nz, col, door} and returns true on a hit.
  raycast(ox, oy, oz, dx, dy, dz, maxT, mask, hit, ignoreDoors = false) {
    let best = maxT, bcol = null, bdoor = null, nx = 0, ny = 0, nz = 0, found = false;
    if (dy < -1e-9 && oy >= 0) {
      const t = -oy / dy;
      if (t < best) { best = t; found = true; nx = 0; ny = 1; nz = 0; bcol = null; }
    }
    const st = ++this.stamp;
    const cs = this.cs;
    const fx = (ox - this.ox) / cs, fz = (oz - this.oz) / cs;
    let ix = Math.floor(fx), iz = Math.floor(fz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tDX = adx > 1e-9 ? cs / adx : Infinity;
    const tDZ = adz > 1e-9 ? cs / adz : Infinity;
    let tMX = adx > 1e-9 ? (dx > 0 ? ix + 1 - fx : fx - ix) * cs / adx : Infinity;
    let tMZ = adz > 1e-9 ? (dz > 0 ? iz + 1 - fz : fz - iz) * cs / adz : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      if (ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz) {
        const cell = this.cells[iz * this.nx + ix];
        for (let k = 0; k < cell.length; k++) {
          const c = cell[k];
          if (c.s === st) continue;
          c.s = st;
          if (!(c.f & mask)) continue;
          const t = this._rayBox(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
          if (t >= 0 && t < best) {
            best = t; found = true; bcol = c;
            const ax = this._ax;
            if (ax === 0) { nx = dx > 0 ? -1 : 1; ny = 0; nz = 0; } else if (ax === 1) { nx = 0; ny = dy > 0 ? -1 : 1; nz = 0; } else if (ax === 2) { nx = 0; ny = 0; nz = dz > 0 ? -1 : 1; } else { nx = -dx; ny = -dy; nz = -dz; }
          }
        }
      }
      const tExit = Math.min(tMX, tMZ);
      if (best <= tExit || tExit > maxT) break;
      if (tMX < tMZ) { ix += stepX; tMX += tDX; } else { iz += stepZ; tMZ += tDZ; }
      if ((ix < 0 && stepX < 0) || (ix >= this.nx && stepX > 0) || (iz < 0 && stepZ < 0) || (iz >= this.nz && stepZ > 0)) break;
    }
    if (!ignoreDoors) {
      for (const d of this.doors) {
        if (!(d.flags & mask)) continue;
        const c = Math.cos(d.angle), s = Math.sin(d.angle);
        const rx = ox - d.hx, rz = oz - d.hz;
        const ou = rx * c + rz * s, ov = -rx * s + rz * c;
        const du = dx * c + dz * s, dv = -dx * s + dz * c;
        const t = this._rayBox(ou, oy, ov, du, dy, dv, 0, d.y0, -d.t / 2, d.w, d.y1, d.t / 2);
        if (t >= 0 && t < best) {
          best = t; found = true; bcol = null; bdoor = d;
          const ax = this._ax;
          if (ax === 0) { const sg = du > 0 ? -1 : 1; nx = c * sg; ny = 0; nz = s * sg; } else if (ax === 1) { nx = 0; ny = dy > 0 ? -1 : 1; nz = 0; } else { const sg = dv > 0 ? -1 : 1; nx = -s * sg; ny = 0; nz = c * sg; }
        }
      }
    }
    if (!found) return false;
    if (hit) {
      hit.t = best; hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
      hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.col = bcol; hit.door = bdoor;
    }
    return true;
  }

  // Segment visibility test between two points.
  clear(ax, ay, az, bx, by, bz, mask = SIGHT, ignoreDoors = false) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.02, mask, null, ignoreDoors);
  }

  // Does a vertical cylinder overlap anything that blocks movement?
  overlaps(x, z, r, yA, yB, ignoreBelow = -Infinity) {
    const list = this.gather(x - r, z - r, x + r, z + r, this._olist);
    for (const c of list) {
      if (!(c.f & MOVE) || c.y1 <= yA + EPS || c.y0 >= yB || c.y1 <= ignoreBelow) continue;
      const qx = x < c.x0 ? c.x0 : x > c.x1 ? c.x1 : x;
      const qz = z < c.z0 ? c.z0 : z > c.z1 ? c.z1 : z;
      if ((x - qx) ** 2 + (z - qz) ** 2 < r * r) return true;
    }
    for (const d of this.doors) {
      if (d.y1 <= yA || d.y0 >= yB) continue;
      if (this._doorPush(d, x, z, r, null)) return true;
    }
    return false;
  }

  // Highest walkable top under a circle within [y - maxDrop, y].
  groundBelow(x, z, r, y, maxDrop) {
    let best = y >= -EPS && y - maxDrop <= 0 ? 0 : -Infinity;
    const list = this.gather(x - r, z - r, x + r, z + r, this._glist);
    for (const c of list) {
      if (!(c.f & MOVE)) continue;
      const top = c.y1;
      if (top > y + EPS || top < y - maxDrop || top <= best) continue;
      const qx = x < c.x0 ? c.x0 : x > c.x1 ? c.x1 : x;
      const qz = z < c.z0 ? c.z0 : z > c.z1 ? c.z1 : z;
      if ((x - qx) ** 2 + (z - qz) ** 2 < r * r) best = top;
    }
    return best === -Infinity ? null : best;
  }

  // Ground height at a point, searching down from y (for ragdolls and drops).
  heightAt(x, z, y) {
    const g = this.groundBelow(x, z, 0.05, y, 1e4);
    return g === null ? 0 : g;
  }

  // Circle vs door slab. Writes the push vector into out (if given).
  _doorPush(d, x, z, r, out) {
    const c = Math.cos(d.angle), s = Math.sin(d.angle);
    const rx = x - d.hx, rz = z - d.hz;
    const u = rx * c + rz * s, v = -rx * s + rz * c;
    const qu = u < 0 ? 0 : u > d.w ? d.w : u;
    const hv = d.t / 2;
    const qv = v < -hv ? -hv : v > hv ? hv : v;
    let du = u - qu, dv = v - qv;
    const d2 = du * du + dv * dv;
    if (d2 >= r * r) return false;
    if (!out) return true;
    let push;
    if (d2 > 1e-10) {
      const dist = Math.sqrt(d2);
      push = r - dist; du /= dist; dv /= dist;
    } else {
      dv = v >= 0 ? 1 : -1; du = 0; push = r + hv - Math.abs(v);
    }
    out.x = (du * c - dv * s) * push;
    out.z = (du * s + dv * c) * push;
    return true;
  }

  // Character controller step. b: {x,y,z (feet), vx,vy,vz, r, h, grounded,
  // stepH, jumping}. Returns nothing; mutates b.
  moveBody(b, dt, gravity) {
    const wasGrounded = b.grounded;
    const r = b.r;
    const feet0 = b.y;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    let stepTop = -Infinity;
    const push = { x: 0, z: 0 };
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const list = this.gather(b.x - r - 0.1, b.z - r - 0.1, b.x + r + 0.1, b.z + r + 0.1, this._mlist);
      for (const c of list) {
        if (!(c.f & MOVE)) continue;
        if (c.y1 <= b.y + 0.02 || c.y0 >= b.y + b.h) continue;
        const qx = b.x < c.x0 ? c.x0 : b.x > c.x1 ? c.x1 : b.x;
        const qz = b.z < c.z0 ? c.z0 : b.z > c.z1 ? c.z1 : b.z;
        let dx = b.x - qx, dz = b.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (wasGrounded && c.y1 - b.y <= b.stepH && !this.overlaps(b.x, b.z, r * 0.9, c.y1, c.y1 + b.h, c.y1)) {
          if (c.y1 > stepTop) stepTop = c.y1;
          continue;
        }
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          dx /= d; dz /= d;
          const p = r - d;
          b.x += dx * p; b.z += dz * p;
          const vn = b.vx * dx + b.vz * dz;
          if (vn < 0) { b.vx -= vn * dx; b.vz -= vn * dz; }
        } else {
          // centre inside the box: leave along the shallowest axis
          const pl = b.x - c.x0 + r, pr = c.x1 - b.x + r, pb = b.z - c.z0 + r, pf = c.z1 - b.z + r;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) { b.x -= pl; b.vx = Math.min(b.vx, 0); } else if (m === pr) { b.x += pr; b.vx = Math.max(b.vx, 0); } else if (m === pb) { b.z -= pb; b.vz = Math.min(b.vz, 0); } else { b.z += pf; b.vz = Math.max(b.vz, 0); }
        }
        moved = true;
      }
      for (const d of this.doors) {
        if (d.y1 <= b.y + 0.02 || d.y0 >= b.y + b.h) continue;
        if (this._doorPush(d, b.x, b.z, r, push)) {
          b.x += push.x; b.z += push.z;
          const pl = Math.hypot(push.x, push.z) || 1;
          const nx = push.x / pl, nz = push.z / pl;
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (stepTop > b.y) {
      b.stepDelta = (b.stepDelta || 0) + (stepTop - b.y);
      b.y = stepTop;
      if (b.vy < 0) b.vy = 0;
    }

    // vertical: only surfaces crossed during this step count
    b.vy -= gravity * dt;
    const y0 = b.y;
    const y1 = y0 + b.vy * dt;
    const rr = r * 0.85;
    let landed = false;
    if (b.vy <= 0) {
      let top = -Infinity;
      if (y0 >= -EPS && y1 < 0) top = 0;
      const list = this.gather(b.x - rr, b.z - rr, b.x + rr, b.z + rr, this._mlist);
      for (const c of list) {
        if (!(c.f & MOVE)) continue;
        if (c.y1 > y0 + EPS || c.y1 <= y1 || c.y1 <= top) continue;
        const qx = b.x < c.x0 ? c.x0 : b.x > c.x1 ? c.x1 : b.x;
        const qz = b.z < c.z0 ? c.z0 : b.z > c.z1 ? c.z1 : b.z;
        if ((b.x - qx) ** 2 + (b.z - qz) ** 2 < rr * rr) top = c.y1;
      }
      if (top > -Infinity) { b.y = top; b.vy = 0; landed = true; } else b.y = y1;
    } else {
      let ceil = Infinity;
      const head0 = y0 + b.h, head1 = y1 + b.h;
      const list = this.gather(b.x - rr, b.z - rr, b.x + rr, b.z + rr, this._mlist);
      for (const c of list) {
        if (!(c.f & MOVE)) continue;
        if (c.y0 < head0 - EPS || c.y0 >= head1 || c.y0 >= ceil) continue;
        const qx = b.x < c.x0 ? c.x0 : b.x > c.x1 ? c.x1 : b.x;
        const qz = b.z < c.z0 ? c.z0 : b.z > c.z1 ? c.z1 : b.z;
        if ((b.x - qx) ** 2 + (b.z - qz) ** 2 < rr * rr) ceil = c.y0;
      }
      if (ceil < Infinity) { b.y = ceil - b.h; b.vy = 0; } else b.y = y1;
    }
    b.grounded = landed;
    if (landed) b.jumping = false;

    // stick to the ground when walking down steps or slopes
    if (!landed && wasGrounded && !b.jumping && b.vy <= 0) {
      const g = this.groundBelow(b.x, b.z, rr, b.y + EPS, 0.42);
      if (g !== null) {
        b.stepDelta = (b.stepDelta || 0) + (g - b.y);
        b.y = g; b.vy = 0; b.grounded = true;
      }
    }
    if (b.y < -5) { b.y = 0; b.vy = 0; }
    b.fell = feet0 - b.y;
  }
}
