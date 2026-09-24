// Level machinery and interactive objects:
//  * conveyor belts push anything standing on them (player, enemies, guns);
//  * steam vents and presses are timed hazards with a clear warning phase
//    (flashing light + sound + wisps) before they can hurt, so damage is
//    always avoidable;
//  * lifts move a platform collider between two heights;
//  * interactable panels show a red / green light;
//  * destructibles (radio transmitters...) take bullet damage and collapse.
import * as THREE from 'three';
import { SOLID } from './world.js';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const RED = new THREE.Color(0xff2d3d);
const GREEN = new THREE.Color(0x2dff7a);
const AMBER = new THREE.Color(0xffb000);
const DIM = new THREE.Color(0x3a1010);

export class Hazards {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    // indicator lights (panels, presses, vents)
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), this.lightMat, 64);
    this.lights.frustumCulled = false;
    this.lights.count = 0;
    this.lights.setColorAt(0, RED);
    scene.add(this.lights);
    // steam puffs
    this.steam = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), game.materials.get('steam'), 260);
    this.steam.frustumCulled = false;
    this.steam.count = 0;
    scene.add(this.steam);
    this.puffs = [];
    this.reset();
  }

  reset() {
    this.conveyors = [];
    this.vents = [];
    this.presses = [];
    this.lifts = [];
    this.panels = [];
    this.destructibles = [];
    this.puffs.length = 0;
    this.lightList = [];
    this.flicker = null;
    this.t = 0;
    this.beltOffset = 0;
  }

  load(level) {
    this.reset();
    const d = level.data;
    this.conveyors = d.conveyors;
    for (const c of this.conveyors) c.conv.on = true;
    this.vents = d.vents.map((v) => ({ ...v, state: 'idle', t: v.phase || 0, hurtCd: 0 }));
    this.presses = d.presses.map((p) => ({ ...p, t: p.phase || 0, y: p.yTop, hit: false }));
    this.lifts = d.lifts.map((l) => ({ ...l, y: l.y0, target: l.y0, moving: false }));
    this.panels = d.interacts.filter((i) => i.light).map((i) => ({ it: i, state: 'off' }));
    this.destructibles = d.destructibles.map((x) => ({ ...x, maxHp: x.hp, dead: false }));
    // back to the level's starting state (restarts reuse the built level)
    for (const x of this.destructibles) {
      x.group.visible = true; x.group.position.y = 0;
      if (x.wreck) x.wreck.visible = false;
      x.col.f = SOLID;
    }
    for (const l of this.lifts) { l.col.y1 = l.y0; l.col.y0 = l.y0 - 0.3; l.group.position.y = 0; }
    for (const p of this.presses) { p.state = 'up'; this.setPress(p); }
    this.flicker = level.def.env.flicker ? { on: true } : null;
    this.beltTex = level.beltTex || null;
  }

  panelState(id, state) {
    for (const p of this.panels) if (p.it.id === id) p.state = state;
  }

  destructible(id) { return this.destructibles.find((x) => x.id === id); }

  // Bullet hit on a destructible collider. Returns true if it was destroyed.
  damage(tag, amount, point) {
    const id = tag.slice('destructible:'.length);
    const x = this.destructible(id);
    if (!x || x.dead) return false;
    x.hp -= amount;
    x.flash = 0.08;
    if (x.hp <= 0) {
      this.destroy(x, false);
      return true;
    }
    return false;
  }

  destroy(x, silent) {
    x.dead = true;
    x.hp = 0;
    x.group.visible = false;
    if (x.wreck) x.wreck.visible = true;
    x.col.f = 0;
    const g = this.game;
    if (!silent) {
      const cx = (x.box[0] + x.box[3]) / 2, cy = x.box[1] + 1.2, cz = (x.box[2] + x.box[5]) / 2;
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
        g.fx.particle(cx, cy + Math.random() * 2, cz, Math.cos(a) * s, 2 + Math.random() * 7, Math.sin(a) * s, 0.05 + Math.random() * 0.12, 1 + Math.random(), g.fx.inkColor, 0);
      }
      for (let i = 0; i < 18; i++) this.puff(cx + (Math.random() - 0.5) * 2, cy + Math.random() * 2, cz + (Math.random() - 0.5) * 2, 1.2, 1.6);
      g.fx.decal(cx, 0.01, cz, 0, 1, 0, 3.2);
      g.audio.play('explosion', { gain: 0.9, priority: true });
      g.player.shake = Math.max(g.player.shake, 1.2);
      g.enemies.blast(cx, cy, cz, 5, 70);
      g.mission.onDestroyed(x.id);
    }
  }

  restoreDestroyed(ids) {
    for (const x of this.destructibles) if (ids.includes(x.id)) this.destroy(x, true);
  }

  puff(x, y, z, size, life, vy = 0.6) {
    if (this.puffs.length > 240) this.puffs.shift();
    this.puffs.push({ x, y, z, s: size * (0.6 + Math.random() * 0.5), life, max: life, vy: vy + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, r: Math.random() * 3 });
  }

  lift(id) { return this.lifts.find((l) => l.id === id); }

  moveLift(id, y) {
    const l = this.lift(id);
    if (l) { l.target = y; l.moving = true; }
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    this.t += dt;
    this.lightList.length = 0;
    // conveyor belts: texture scroll (one shared material)
    this.beltOffset = (this.beltOffset + dt * 1.6 / 1.2) % 1;
    if (this.beltTex && this.conveyors.some((c) => c.conv.on)) this.beltTex.offset.y = -this.beltOffset;
    // steam vents: idle -> warn (1.1 s) -> burst (1.2 s)
    for (const v of this.vents) {
      if (v.off) continue;
      v.t += dt;
      const cycle = v.period;
      const tc = v.t % cycle;
      const warnStart = cycle - v.burst - 1.1, burstStart = cycle - v.burst;
      const prev = v.state;
      v.state = tc >= burstStart ? 'burst' : tc >= warnStart ? 'warn' : 'idle';
      if (v.state === 'warn') {
        if (prev === 'idle') g.audio.play('hiss', g.spatialAt(v.x, v.y + 1, v.z, 0.35));
        if (Math.random() < dt * 8) this.puff(v.x, v.y + 0.2, v.z, 0.25, 0.6, 0.8);
        this.lightList.push([v.x + (v.lx || 0), v.y + (v.ly ?? 0.9), v.z + (v.lz || 0), Math.floor(this.t * 8) % 2 ? AMBER : DIM]);
      } else if (v.state === 'burst') {
        if (prev !== 'burst') g.audio.play('steam', g.spatialAt(v.x, v.y + 1, v.z, 0.7));
        for (let i = 0; i < 3; i++) this.puff(v.x + (Math.random() - 0.5) * v.r, v.y + Math.random() * 0.4, v.z + (Math.random() - 0.5) * v.r, 0.5, 0.9, 3 + Math.random() * 2.5);
        this.lightList.push([v.x + (v.lx || 0), v.y + (v.ly ?? 0.9), v.z + (v.lz || 0), RED]);
        // hurts only inside the column while it's bursting
        v.hurtCd -= dt;
        if (P.alive && v.hurtCd <= 0 && Math.hypot(P.x - v.x, P.z - v.z) < v.r && P.y < v.y + v.h && P.y > v.y - 0.5) {
          P.damage(6, v.x, v.z, 'steam');
          v.hurtCd = 0.35;
        }
        g.enemies.hazard(v.x, v.y, v.z, v.r, v.h, 12 * dt);
      } else {
        this.lightList.push([v.x + (v.lx || 0), v.y + (v.ly ?? 0.9), v.z + (v.lz || 0), GREEN]);
      }
    }
    // presses: up -> warn (1.0 s) -> slam -> hold -> rise
    for (const p of this.presses) {
      if (p.off) {
        p.y += (p.yTop - p.y) * Math.min(1, dt * 2);
        this.setPress(p);
        this.lightList.push([p.lx, p.ly, p.lz, GREEN]);
        continue;
      }
      p.t = (p.t + dt) % p.period;
      const up = p.period - 3.15; // idle time at the top
      let y, st;
      if (p.t < up) { y = p.yTop; st = 'up'; } else if (p.t < up + 1.0) { y = p.yTop; st = 'warn'; } else if (p.t < up + 1.25) { const k = (p.t - up - 1.0) / 0.25; y = p.yTop + (p.yLow - p.yTop) * k * k; st = 'slam'; } else if (p.t < up + 1.95) { y = p.yLow; st = 'hold'; } else { const k = (p.t - up - 1.95) / 1.2; y = p.yLow + (p.yTop - p.yLow) * k; st = 'rise'; }
      if (st === 'warn' && p.state === 'up') g.audio.play('alarmBeep', g.spatialAt(p.lx, p.ly, p.lz, 0.3));
      if (st === 'hold' && p.state === 'slam') {
        g.audio.play('press', g.spatialAt(p.lx, p.ly, p.lz, 0.8));
        g.player.shake = Math.max(g.player.shake, Math.max(0, 0.6 - Math.hypot(P.x - p.lx, P.z - p.lz) * 0.05));
      }
      p.state = st;
      p.y = y;
      this.setPress(p);
      this.lightList.push([p.lx, p.ly, p.lz, st === 'warn' || st === 'slam' ? (Math.floor(this.t * 10) % 2 ? RED : DIM) : st === 'up' ? GREEN : AMBER]);
      // crushing: only while slamming, and only under the head
      if (st === 'slam' && P.alive && !p.hitP && P.x > p.x0 - 0.1 && P.x < p.x1 + 0.1 && P.z > p.z0 - 0.1 && P.z < p.z1 + 0.1 && P.y < p.yLow + 0.2 && P.y + P.height > y) {
        p.hitP = true;
        P.damage(35, p.lx, p.lz, 'press');
      }
      if (st !== 'slam') p.hitP = false;
      if (st === 'slam') g.enemies.hazardBox(p.x0, p.z0, p.x1, p.z1, p.yLow + 0.2, y, 200);
    }
    // lifts
    for (const l of this.lifts) {
      if (!l.moving) continue;
      const d = l.target - l.y;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * l.speed);
      l.y += step;
      if (Math.abs(l.target - l.y) < 1e-3) { l.y = l.target; l.moving = false; if (l.onArrive) l.onArrive(); }
      l.col.y1 = l.y;
      l.col.y0 = l.y - 0.3;
      l.group.position.y = l.y - l.y0;
    }
    // lamp flicker (power out) — shared lamp material intensity
    const lamp = g.materials.get('lamp');
    if (this.flicker && this.flicker.on) {
      const n = Math.sin(this.t * 13.1) + Math.sin(this.t * 7.3 + 1.3) + (Math.random() < 0.04 ? -2.5 : 0);
      lamp.emissiveIntensity = n < -1.2 ? 0.15 : n < 0.2 ? 0.55 : 0.85;
    } else lamp.emissiveIntensity = 1;
    // destructible hit flash
    for (const x of this.destructibles) {
      if (x.flash > 0) { x.flash -= dt; x.group.position.y = x.flash > 0 ? (Math.random() - 0.5) * 0.04 : 0; }
    }
    // panel lights
    for (const p of this.panels) {
      const l = p.it.light;
      const c = p.state === 'done' ? GREEN : p.state === 'locked' ? AMBER : (Math.floor(this.t * 3) % 2 ? RED : DIM);
      this.lightList.push([l.x, l.y, l.z, c]);
    }
    this._renderLights();
    this._renderSteam(dt);
  }

  setPress(p) {
    p.col.y0 = p.y;
    p.col.y1 = p.y + p.headH;
    p.group.position.y = p.y - p.yTop;
  }

  _renderLights() {
    const n = Math.min(64, this.lightList.length);
    for (let i = 0; i < n; i++) {
      const [x, y, z, c] = this.lightList[i];
      _m.makeTranslation(x, y, z);
      this.lights.setMatrixAt(i, _m);
      this.lights.setColorAt(i, c);
    }
    this.lights.count = n;
    if (n) { this.lights.instanceMatrix.needsUpdate = true; this.lights.instanceColor.needsUpdate = true; }
  }

  _renderSteam(dt) {
    let n = 0;
    const cap = Math.round(240 * (this.game.quality.particles || 1));
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt;
      p.vy *= 0.97;
      const k = p.life / p.max;
      const s = p.s * (1.6 - k * 0.8);
      if (n < cap) {
        _q.setFromAxisAngle(_v.set(0, 1, 0), p.r);
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
        this.steam.setMatrixAt(n++, _m);
      }
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    this.steam.count = n;
    if (n) this.steam.instanceMatrix.needsUpdate = true;
  }

  save() {
    return { belts: this.conveyors.map((c) => c.conv.on), panels: this.panels.map((p) => p.state), destroyed: this.destructibles.filter((x) => x.dead).map((x) => x.id), lifts: this.lifts.map((l) => [l.id, l.target]), off: this.presses.map((p) => !!p.off).concat(this.vents.map((v) => !!v.off)) };
  }

  restore(s) {
    for (const x of this.destructibles) {
      if (s.destroyed.includes(x.id)) { if (!x.dead) this.destroy(x, true); continue; }
      x.dead = false; x.hp = x.maxHp; x.flash = 0;
      x.group.visible = true; x.group.position.y = 0;
      if (x.wreck) x.wreck.visible = false;
      x.col.f = SOLID;
    }
    if (s.belts) this.conveyors.forEach((c, i) => { c.conv.on = s.belts[i]; });
    if (s.panels) this.panels.forEach((p, i) => { p.state = s.panels[i]; });
    this.puffs.length = 0;
    for (const [id, y] of s.lifts) { const l = this.lift(id); if (l) { l.y = l.target = y; l.col.y1 = y; l.col.y0 = y - 0.3; l.group.position.y = y - l.y0; } }
    let i = 0;
    for (const p of this.presses) p.off = s.off[i++];
    for (const v of this.vents) v.off = s.off[i++];
  }
}

export { SOLID };
