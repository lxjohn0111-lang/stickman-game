// First-person player: movement, look, weapon handling, interaction, health.
import * as THREE from 'three';
import { GRAVITY, PLAYER, WEAPONS, WIN_Z } from './config.js';
import { SOLID } from './world.js';

const _dir = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _org = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _hit = {};

export class Player {
  constructor(game) {
    this.game = game;
    this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: PLAYER.radius, h: PLAYER.height, grounded: true, stepH: PLAYER.stepHeight, jumping: false, stepDelta: 0 };
    this.cam = new THREE.Vector3();
    this.hitRadius = 0.34;
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get z() { return this.body.z; }
  get height() { return this.body.h; }

  reset(start) {
    const b = this.body;
    b.x = start.x; b.y = start.y; b.z = start.z;
    b.vx = b.vy = b.vz = 0;
    b.grounded = true; b.jumping = false; b.h = PLAYER.height; b.stepDelta = 0;
    this.yaw = start.yaw; this.pitch = 0;
    this.recoilPitch = 0;
    this.roll = 0;
    this.health = PLAYER.maxHealth;
    this.alive = true;
    this.deathT = -1;
    this.lastDamage = -99;
    this.crouch = 0;
    this.eyeOffset = 0;
    this.landDip = 0;
    this.bobT = 0;
    this.stepDist = 0;
    this.shake = 0;
    this.fireCd = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadSounds = 0;
    this.sprintBlock = 0;
    this.aiming = false;
    this.sprinting = false;
    this.moving = 0;
    this.dryClicked = false;
    this.shotId = 0;
    this.shotHits = new Set();
    this.stats = { shots: 0, hits: 0, kills: 0, headshots: 0, time: 0 };
    this.setWeapon('smg', WEAPONS.smg.mag, 96, true);
    this.lookTarget = null;
  }

  setWeapon(id, mag, reserve, instant = false) {
    this.weapon = { id, def: WEAPONS[id], mag, reserve };
    this.reloading = false;
    this.fireCd = Math.max(this.fireCd, instant ? 0 : 0.3);
    this.game.vm.setWeapon(id, instant);
  }

  forward(out) {
    const cp = Math.cos(this.pitch + this.recoilPitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch + this.recoilPitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input, settings) {
    const g = this.game;
    const b = this.body;
    if (!this.alive) { this.updateDeath(dt); return; }
    this.stats.time += dt;

    // ---- look
    const [ldx, ldy] = input.takeLook();
    this.lookDX = ldx; this.lookDY = ldy;
    const sens = 0.0021 * settings.sensitivity * (this.aiming ? 0.7 : 1);
    this.yaw -= ldx * sens;
    this.pitch -= ldy * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    // recoil partly recovers
    this.recoilPitch *= Math.exp(-dt * 8);

    // ---- movement
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const wantCrouch = input.down('KeyC') || input.down('ControlLeft');
    this.aiming = input.right && !this.reloading;
    this.sprintBlock = Math.max(0, this.sprintBlock - dt);
    this.sprinting = input.down('ShiftLeft') || input.down('ShiftRight') ? f > 0 && !wantCrouch && !this.aiming && this.sprintBlock <= 0 : false;
    // crouch / stand (stand only with headroom)
    if (wantCrouch) this.crouch = Math.min(1, this.crouch + dt * 7);
    else if (this.crouch > 0) {
      if (!g.world.overlaps(b.x, b.z, b.r * 0.9, b.y + 0.05, b.y + PLAYER.height)) this.crouch = Math.max(0, this.crouch - dt * 7);
    }
    b.h = PLAYER.height + (PLAYER.crouchHeight - PLAYER.height) * this.crouch;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * f + rx * s, wz = fz * f + rz * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    let speed = PLAYER.walk;
    if (this.crouch > 0.5) speed = PLAYER.crouchSpeed;
    else if (this.aiming) speed = PLAYER.aimSpeed;
    else if (this.sprinting) speed = PLAYER.sprint;
    if (b.grounded) {
      const tx = wx * speed, tz = wz * speed;
      const ax = tx - b.vx, az = tz - b.vz;
      const al = Math.hypot(ax, az);
      const rate = (wl > 0 ? PLAYER.groundAccel : PLAYER.friction * Math.max(2, Math.hypot(b.vx, b.vz))) * dt;
      if (al <= rate) { b.vx = tx; b.vz = tz; } else { b.vx += (ax / al) * rate; b.vz += (az / al) * rate; }
      if (input.hit('Space') && this.crouch < 0.5) {
        b.vy = PLAYER.jumpVelocity;
        b.jumping = true;
        b.grounded = false;
      }
    } else if (wl > 0) {
      b.vx += wx * PLAYER.airAccel * dt;
      b.vz += wz * PLAYER.airAccel * dt;
      const hs = Math.hypot(b.vx, b.vz), cap = Math.max(speed, 1);
      if (hs > cap) { b.vx *= cap / hs; b.vz *= cap / hs; }
    }
    const wasGrounded = b.grounded;
    const fallSpeed = -b.vy;
    const hsp = Math.hypot(b.vx, b.vz);
    const steps = Math.max(1, Math.ceil((hsp * dt) / 0.1));
    const x0 = b.x, z0 = b.z;
    for (let i = 0; i < steps; i++) g.world.moveBody(b, dt / steps, GRAVITY);
    const moved = Math.hypot(b.x - x0, b.z - z0);
    this.moving = Math.min(1, (moved / Math.max(dt, 1e-4)) / PLAYER.walk);
    if (!wasGrounded && b.grounded && fallSpeed > 5) {
      g.audio.play('land', { gain: Math.min(1, fallSpeed / 10) });
      this.landDip = Math.min(0.12, fallSpeed * 0.012);
    }
    if (b.grounded && moved > 0.001) {
      this.stepDist += moved;
      const stride = this.sprinting ? 2.4 : this.crouch > 0.5 ? 1.4 : 1.9;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (this.crouch < 0.5) g.audio.play(Math.random() < 0.5 ? 'step' : 'step2', { gain: this.sprinting ? 0.35 : 0.22, rate: 0.9 + Math.random() * 0.2 });
      }
    }
    this.bobT += dt * (this.sprinting ? 11 : 8) * (b.grounded ? this.moving : 0);

    // ---- camera
    this.eyeOffset -= b.stepDelta; b.stepDelta = 0;
    this.eyeOffset = Math.max(-0.45, Math.min(0.45, this.eyeOffset));
    this.eyeOffset *= Math.exp(-dt * 16);
    this.landDip *= Math.exp(-dt * 9);
    this.shake *= Math.exp(-dt * 7);
    this.applyCamera(settings);

    // ---- weapon
    this.updateWeapon(dt, input, settings);

    // ---- interaction
    this.updateInteract(input);

    // ---- health regen
    if (g.time - this.lastDamage > g.diff.regenDelay && this.health < PLAYER.maxHealth) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenRate * dt);
    }

    // ---- win
    if (b.z < WIN_Z) g.win();
  }

  applyCamera(settings) {
    const b = this.body;
    const cam = this.game.camera;
    const eye = PLAYER.eye + (PLAYER.crouchEye - PLAYER.eye) * this.crouch;
    let bx = 0, by = 0;
    if (settings.viewBob && b.grounded) {
      const amp = this.moving * (this.sprinting ? 1.3 : 1) * (this.aiming ? 0.35 : 1);
      by = Math.sin(this.bobT * 2) * 0.028 * amp;
      bx = Math.cos(this.bobT) * 0.018 * amp;
    }
    const sh = this.shake * settings.shake;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cam.position.set(b.x + rx * bx, b.y + eye + this.eyeOffset + by - this.landDip, b.z + rz * bx);
    cam.rotation.set(
      this.pitch + this.recoilPitch + (Math.random() - 0.5) * sh * 0.02,
      this.yaw + (Math.random() - 0.5) * sh * 0.02,
      this.roll,
      'YXZ',
    );
    this.cam.copy(cam.position);
  }

  updateWeapon(dt, input, settings) {
    const g = this.game;
    const w = this.weapon;
    const def = w.def;
    this.fireCd -= dt;
    // reload
    if (input.hit('KeyR')) this.startReload();
    if (this.reloading) {
      this.reloadT += dt;
      if (def.shellReload) {
        if (this.reloadT >= def.reload) {
          this.reloadT -= def.reload;
          if (w.reserve > 0 && w.mag < def.mag) {
            w.mag++; w.reserve--;
            g.audio.play('shell', { gain: 0.7 });
          }
          if (w.mag >= def.mag || w.reserve <= 0) {
            this.reloading = false;
            g.vm.stopReload();
            g.vm.pump();
            g.audio.play('pump', { gain: 0.8 });
            this.fireCd = Math.max(this.fireCd, 0.45);
          }
        }
      } else {
        const t = this.reloadT / def.reload;
        if (this.reloadSounds === 0 && t > 0.18) { g.audio.play('magOut', { gain: 0.8 }); this.reloadSounds = 1; }
        if (this.reloadSounds === 1 && t > 0.58) { g.audio.play('magIn', { gain: 0.9 }); this.reloadSounds = 2; }
        if (this.reloadSounds === 2 && t > 0.82) { g.audio.play('bolt', { gain: 0.8 }); this.reloadSounds = 3; }
        if (t >= 1) {
          const take = Math.min(def.mag - w.mag, w.reserve);
          w.mag += take; w.reserve -= take;
          this.reloading = false;
        }
      }
    }
    const trigger = def.auto ? input.left : input.leftPressed;
    if (!input.left) this.dryClicked = false;
    if (trigger && this.reloading && def.shellReload && w.mag > 0) {
      // fire interrupts a shell-by-shell reload
      this.reloading = false;
      g.vm.stopReload();
    }
    if (trigger && !this.reloading && this.fireCd <= 0) {
      if (w.mag <= 0) {
        if (!this.dryClicked) { g.audio.play('dry'); this.dryClicked = true; }
        if (w.reserve > 0) this.startReload();
      } else {
        this.fire(settings);
      }
    }
    g.vm.update(dt, {
      moving: this.body.grounded ? this.moving : 0,
      aim: this.aiming,
      sprint: this.sprinting && this.moving > 0.3,
      lookDX: this.lookDX || 0,
      lookDY: this.lookDY || 0,
      bob: settings.viewBob,
    });
  }

  startReload() {
    const w = this.weapon;
    if (this.reloading || w.reserve <= 0 || w.mag >= w.def.mag || !this.alive) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadSounds = 0;
    this.game.vm.startReload(w.def.shellReload ? w.def.reload * 1.2 : w.def.reload);
  }

  fire(settings) {
    const g = this.game;
    const w = this.weapon;
    const def = w.def;
    w.mag--;
    // keep the cadence exact (0.09 s SMG, 0.125 s rifle) despite frame steps
    this.fireCd = Math.max(this.fireCd, -0.02) + def.interval;
    this.sprintBlock = 0.35;
    const cam = g.camera;
    cam.updateMatrixWorld();
    g.vm.kick(def.vmKick);
    g.vm.muzzleWorld(cam, _muz);
    _org.copy(cam.position);
    this.forward(_dir);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _up.crossVectors(_right, _dir).normalize();
    let spread = def.spread * (this.aiming ? 0.4 : 1) * (this.crouch > 0.5 ? 0.8 : 1);
    spread += def.moveSpread * this.moving * (this.aiming ? 0.5 : 1);
    if (!this.body.grounded) spread += 0.03;
    this.shotId++;
    this.stats.shots++;
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const d = new THREE.Vector3().copy(_dir)
        .addScaledVector(_right, Math.cos(a) * r)
        .addScaledVector(_up, Math.sin(a) * r)
        .normalize();
      g.bullets.firePlayer(_org, d, _muz, def, def.damage);
      g.bullets.player[g.bullets.player.length - 1].shotId = this.shotId;
    }
    g.audio.play(def.sound, { gain: 0.9, rate: 0.96 + Math.random() * 0.08, priority: true });
    // camera kick: most of it recovers, part of it stays
    const kp = def.kickPitch * (this.aiming ? 0.7 : 1);
    this.pitch += kp * 0.35;
    this.recoilPitch += kp * 0.65;
    this.yaw += (Math.random() - 0.5) * def.kickYaw * 2;
    this.shake = Math.max(this.shake, def.id === 'shotgun' ? 0.6 : 0.15);
    if (def.id === 'shotgun') {
      g.vm.pump();
      setTimeout(() => { if (this.alive && this.weapon.id === 'shotgun') g.audio.play('pump', { gain: 0.7 }); }, 110);
    }
    g.onPlayerShot();
  }

  registerHit(bullet) {
    if (bullet.shotId !== undefined && !this.shotHits.has(bullet.shotId)) {
      this.shotHits.add(bullet.shotId);
      this.stats.hits++;
    }
  }

  updateInteract(input) {
    const g = this.game;
    const cam = g.camera;
    this.forward(_dir);
    let target = null;
    // doors: what the crosshair points at, else the nearest one in front
    if (g.world.raycast(cam.position.x, cam.position.y, cam.position.z, _dir.x, _dir.y, _dir.z, 2.6, SOLID, _hit) && _hit.door) {
      target = { kind: 'door', door: _hit.door };
    }
    if (!target) {
      let best = 1.7;
      for (const d of g.doors) {
        if (Math.abs(d.y0 - this.body.y) > 1) continue;
        const dist = d.distanceTo(this.body.x, this.body.z);
        if (dist < best) {
          const cx = d.hx + Math.cos(d.angle) * d.w * 0.5 - this.body.x, cz = d.hz + Math.sin(d.angle) * d.w * 0.5 - this.body.z;
          const facing = (cx * _dir.x + cz * _dir.z) / (Math.hypot(cx, cz) || 1);
          if (facing > 0.2 || dist < 0.9) { best = dist; target = { kind: 'door', door: d }; }
        }
      }
    }
    // pickups override when closer / looked at
    const p = g.enemies.nearestPickup(this.body.x, this.body.y, this.body.z, _dir);
    if (p && (!target || p.score > 0.5)) target = { kind: 'pickup', pickup: p.pickup };
    this.lookTarget = target;
    if (target && input.hit('KeyF')) {
      if (target.kind === 'door') {
        const d = target.door;
        const wasOpen = d.isOpen;
        d.toggle(this.body.x, this.body.z);
        g.audio.play(wasOpen ? 'doorClose' : 'doorOpen', { gain: 0.8 });
        g.onNoise(d.cx, d.y0 + 1, d.cz, 6);
      } else {
        this.takePickup(target.pickup);
      }
    }
  }

  takePickup(p) {
    const g = this.game;
    const w = this.weapon;
    if (p.weapon === w.id) {
      const room = 999;
      const amount = p.mag + p.reserve;
      w.reserve = Math.min(w.reserve + amount, room);
      g.enemies.removePickup(p);
      g.audio.play('pickup', { gain: 0.9 });
      g.ui.toast(`+${amount} ${w.def.name} ammo`);
    } else {
      const old = { weapon: w.id, mag: w.mag, reserve: w.reserve };
      g.enemies.removePickup(p);
      g.enemies.dropPickup(old.weapon, old.mag, old.reserve, this.body.x - Math.sin(this.yaw) * 0.6, this.body.y, this.body.z - Math.cos(this.yaw) * 0.6, this.yaw + 1.2);
      this.setWeapon(p.weapon, p.mag, p.reserve);
      g.audio.play('pickup', { gain: 0.9 });
    }
  }

  damage(amount, fromX, fromZ) {
    if (!this.alive) return;
    const g = this.game;
    this.health -= amount;
    this.lastDamage = g.time;
    this.shake = Math.max(this.shake, 0.8);
    // direction of the hit relative to where we face
    const dx = fromX - this.body.x, dz = fromZ - this.body.z;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const deg = (a * 180) / Math.PI;
    const dir = Math.abs(deg) <= 45 ? 'AHEAD' : Math.abs(deg) >= 135 ? 'BEHIND' : deg > 0 ? 'RIGHT' : 'LEFT';
    g.ui.hit(dir);
    g.audio.play('hurt', { gain: 0.7 });
    if (this.health <= 0) this.die();
  }

  die() {
    const g = this.game;
    this.health = 0;
    this.alive = false;
    this.deathT = 0;
    this.deathRoll = Math.random() < 0.5 ? -1 : 1;
    this.deathStart = { eye: this.game.camera.position.y - this.body.y, pitch: this.pitch + this.recoilPitch };
    this.reloading = false;
    g.vm.drop();
    g.audio.play('death', { gain: 0.9, priority: true });
    g.onPlayerDeath();
  }

  // Camera falls, rolls and tips up toward the sky.
  updateDeath(dt) {
    const g = this.game;
    this.deathT += dt;
    const b = this.body;
    b.vx *= Math.exp(-dt * 4); b.vz *= Math.exp(-dt * 4);
    g.world.moveBody(b, dt, GRAVITY);
    const t = Math.min(1, this.deathT / 1.1);
    const fall = t * t;
    const eye = this.deathStart.eye + (0.28 - this.deathStart.eye) * fall;
    const tp = Math.min(1, this.deathT / 1.6);
    const e = 1 - (1 - tp) * (1 - tp);
    this.pitch = this.deathStart.pitch + (1.3 - this.deathStart.pitch) * e;
    this.recoilPitch = 0;
    this.roll = this.deathRoll * 0.75 * e;
    const cam = g.camera;
    cam.position.set(b.x, b.y + eye, b.z);
    cam.rotation.set(this.pitch, this.yaw + this.deathRoll * 0.3 * e, this.roll, 'YXZ');
    this.cam.copy(cam.position);
    g.vm.update(dt, { moving: 0, aim: false, sprint: false, lookDX: 0, lookDY: 0, bob: false });
  }

  snapshot() {
    const b = this.body;
    return {
      x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, yaw: this.yaw, pitch: this.pitch,
      health: this.health, alive: this.alive, weapon: this.weapon.id, mag: this.weapon.mag, reserve: this.weapon.reserve,
      stats: { ...this.stats },
    };
  }
}
