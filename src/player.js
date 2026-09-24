// First-person player: movement (ladders, conveyors), look, two weapon slots
// (a main weapon and a sidearm), interaction, pickups and health.
import * as THREE from 'three';
import { GRAVITY, PLAYER, WEAPONS, stepSound } from './config.js';
import { SOLID, surfaceOf } from './world.js';
import { t } from './i18n.js';

const _dir = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _org = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _hit = {};

export class Player {
  constructor(game) {
    this.game = game;
    this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: PLAYER.radius, h: PLAYER.height, grounded: true, stepH: PLAYER.stepHeight, jumping: false, stepDelta: 0, ex: 0, ez: 0 };
    this.cam = new THREE.Vector3();
    this.hitRadius = 0.34;
    this.slots = { main: null, side: null };
    this.active = 'main';
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 }, { main: ['smg', 32, 96], side: ['pistol', 12, 36] });
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get z() { return this.body.z; }
  get height() { return this.body.h; }
  get weapon() { return this.slots[this.active] || this.slots.main || this.slots.side; }

  reset(start, loadout) {
    const b = this.body;
    b.x = start.x; b.y = start.y; b.z = start.z;
    b.vx = b.vy = b.vz = 0; b.ex = b.ez = 0;
    b.grounded = true; b.jumping = false; b.h = PLAYER.height; b.stepDelta = 0; b.groundCol = null;
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
    this.stepSide = 0;
    this.shake = 0;
    this.fireCd = 0;
    this.burstLeft = 0;
    this.burstT = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadSounds = 0;
    this.swapT = 0;
    this.sprintBlock = 0;
    this.aiming = false;
    this.sprinting = false;
    this.moving = 0;
    this.dryClicked = false;
    this.pumpSoundT = 0;
    this.shotId = 0;
    this.shotHits = new Set();
    this.climb = null;
    this.stats = { shots: 0, hits: 0, kills: 0, headshots: 0, time: 0, damageTaken: 0 };
    if (loadout) this.setLoadout(loadout);
    this.lookTarget = null;
    this.lastActed = 0;
  }

  // ---------------------------------------------------------------- loadout
  // {main: [id, mag, reserve] | null, side: [...], active}
  setLoadout(l) {
    const mk = (s) => (s ? { id: s[0], def: WEAPONS[s[0]], mag: s[1], reserve: s[2] } : null);
    this.slots.main = mk(l.main);
    this.slots.side = mk(l.side);
    this.active = l.active && this.slots[l.active] ? l.active : this.slots.main ? 'main' : 'side';
    this.reloading = false;
    this.burstLeft = 0;
    this.fireCd = 0;
    this.game.vm.setWeapon(this.weapon.id, true);
  }

  // At least `mags` magazines per carried gun (loaded + reserve), within the
  // gun's reserve limit. Used when a checkpoint is restored, so a checkpoint
  // reached on an empty gun can't trap the player in a no-ammo loop.
  topUpAmmo(mags = 3) {
    for (const w of [this.slots.main, this.slots.side]) {
      if (!w) continue;
      const want = Math.min(w.def.mag * mags, w.def.mag + w.def.reserve);
      if (w.mag + w.reserve < want) w.reserve = want - w.mag;
    }
  }

  getLoadout() {
    const s = (w) => (w ? [w.id, w.mag, w.reserve] : null);
    return { main: s(this.slots.main), side: s(this.slots.side), active: this.active };
  }

  selectSlot(slot) {
    if (!this.slots[slot] || slot === this.active || !this.alive) return;
    this.active = slot;
    this.reloading = false;
    this.burstLeft = 0;
    this.game.vm.stopReload();
    this.game.vm.setWeapon(this.weapon.id);
    this.swapT = 0.32;
    this.fireCd = Math.max(this.fireCd, 0.32);
    this.game.audio.play('swap', { gain: 0.6 });
    this.lastActed = this.game.time;
  }

  forward(out) {
    const cp = Math.cos(this.pitch + this.recoilPitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch + this.recoilPitch), -Math.cos(this.yaw) * cp);
  }

  // ---------------------------------------------------------------- update
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
    this.recoilPitch *= Math.exp(-dt * 8);

    // ---- movement
    let f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    let s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    // touch joystick: analog direction and speed
    const stick = input.stick;
    let mag = 1;
    if (stick && (stick.f || stick.s)) { f = stick.f; s = stick.s; mag = Math.min(1, Math.hypot(f, s)); }
    if (f || s) this.lastActed = g.time;
    const wantCrouch = input.down('KeyC') || input.down('ControlLeft');
    this.aiming = input.right && !this.reloading && !this.climb;
    this.sprintBlock = Math.max(0, this.sprintBlock - dt);
    this.sprinting = input.down('ShiftLeft') || input.down('ShiftRight') ? f > 0 && !wantCrouch && !this.aiming && this.sprintBlock <= 0 : false;
    if (wantCrouch && !this.climb) this.crouch = Math.min(1, this.crouch + dt * 7);
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
    if (stick) speed *= Math.max(0.35, mag);

    const wasGrounded = b.grounded;
    const fallSpeed = -b.vy;
    const x0 = b.x, z0 = b.z, y0 = b.y;
    if (this.updateLadder(dt, input, stick ? (Math.abs(f) > 0.3 ? Math.sign(f) : 0) : f)) {
      // climbing handled the body this frame
    } else {
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
          this.lastActed = g.time;
        }
      } else if (wl > 0) {
        b.vx += wx * PLAYER.airAccel * dt;
        b.vz += wz * PLAYER.airAccel * dt;
        const hs = Math.hypot(b.vx, b.vz), cap = Math.max(speed, 1);
        if (hs > cap) { b.vx *= cap / hs; b.vz *= cap / hs; }
      }
      // conveyor belts carry you along
      const c = b.groundCol;
      if (b.grounded && c && c.conv && c.conv.on) { b.ex = c.conv.vx; b.ez = c.conv.vz; } else if (b.grounded) { b.ex = 0; b.ez = 0; }
      const hsp = Math.hypot(b.vx + b.ex, b.vz + b.ez);
      const steps = Math.max(1, Math.ceil((hsp * dt) / 0.1));
      for (let i = 0; i < steps; i++) g.world.moveBody(b, dt / steps, GRAVITY);
    }
    const moved = Math.hypot(b.x - x0 - b.ex * dt, b.z - z0 - b.ez * dt);
    this.moving = this.climb ? 0 : Math.min(1, (moved / Math.max(dt, 1e-4)) / PLAYER.walk);
    const surf = surfaceOf(g.world, b);
    if (!wasGrounded && b.grounded && fallSpeed > 5) {
      g.audio.play('land', { gain: Math.min(1, fallSpeed / 10) });
      g.audio.play(stepSound(surf), { gain: 0.35 });
      this.landDip = Math.min(0.12, fallSpeed * 0.012);
    }
    if (b.grounded && moved > 0.001) {
      this.stepDist += moved;
      const stride = this.sprinting ? 2.4 : this.crouch > 0.5 ? 1.4 : 1.9;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.stepSide ^= 1;
        if (this.crouch < 0.5) g.audio.play(stepSound(surf), { gain: this.sprinting ? 0.35 : 0.22, rate: 0.9 + Math.random() * 0.2 });
        if (surf === 'snow' && g.env) {
          const side = this.stepSide ? 0.13 : -0.13;
          g.env.footprint(b.x + rx * side, b.y, b.z + rz * side, this.yaw);
        }
      }
    }
    if (this.climb && Math.abs(b.y - y0) > 0) {
      this.stepDist += Math.abs(b.y - y0);
      if (this.stepDist > 0.62) { this.stepDist = 0; g.audio.play('step_metal', { gain: 0.25, rate: 1.1 }); }
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

    // ---- interaction + walk-over pickups
    this.updateInteract(input);
    this.touchItems();

    // ---- health regeneration (only up to the difficulty's limit)
    const cap = g.diff.regenCap;
    if (g.time - this.lastDamage > PLAYER.regenDelay && this.health < cap) {
      this.health = Math.min(cap, this.health + PLAYER.regenRate * dt);
    }
  }

  // Ladders: walk into one (or step backwards off the top) and hold W/S.
  updateLadder(dt, input, f) {
    const g = this.game;
    const b = this.body;
    const ladders = g.world.ladders;
    if (!ladders.length) { this.climb = null; return false; }
    let L = this.climb;
    if (L && !(b.x > L.x0 - 0.3 && b.x < L.x1 + 0.3 && b.z > L.z0 - 0.3 && b.z < L.z1 + 0.3)) L = this.climb = null;
    if (!L) {
      for (const l of ladders) {
        if (b.x < l.x0 || b.x > l.x1 || b.z < l.z0 || b.z > l.z1 || b.y < l.y0 - 0.2 || b.y > l.y1) continue;
        const look = -Math.sin(this.yaw) * l.dx - Math.cos(this.yaw) * l.dz;
        // grab when pushing toward it from the bottom, or when dropping past it
        if ((b.grounded && f > 0 && look > 0.35 && b.y < l.top - 0.5) || (!b.grounded && f !== 0 && b.vy < 1)) { L = l; break; }
      }
      if (!L) return false;
      this.climb = L;
      b.vx = b.vz = b.vy = 0; b.ex = b.ez = 0;
      b.jumping = false;
    }
    // climbing: W up, S down, jump lets go
    if (input.hit('Space')) {
      this.climb = null;
      b.vx = -L.dx * 2.5; b.vz = -L.dz * 2.5; b.vy = 2;
      b.grounded = false;
      return false;
    }
    const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
    // stay on the ladder line
    b.x += ((L.dx ? cx : b.x) - b.x) * Math.min(1, dt * 10);
    b.z += ((L.dz ? cz : b.z) - b.z) * Math.min(1, dt * 10);
    const vy = f * PLAYER.climbSpeed;
    b.y += vy * dt;
    b.vx = b.vz = b.vy = 0;
    b.grounded = false;
    if (b.y >= L.top - 0.35 && f > 0) {
      // step off onto the platform at the top
      b.y = L.top + 0.02;
      b.x = cx + L.dx * 0.95; b.z = cz + L.dz * 0.95;
      b.grounded = true;
      b.groundCol = null;
      this.climb = null;
      this.eyeOffset -= 0.25;
      return true;
    }
    const floor = g.world.groundBelow(b.x, b.z, b.r * 0.8, b.y + 0.05, 0.3);
    if (f < 0 && floor !== null && b.y <= floor + 0.02) {
      b.y = floor;
      b.grounded = true;
      this.climb = null;
    }
    return true;
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

  // ---------------------------------------------------------------- weapons
  updateWeapon(dt, input, settings) {
    const g = this.game;
    // slot keys / wheel / Q swap
    if (input.hit('Digit1')) this.selectSlot('main');
    if (input.hit('Digit2')) this.selectSlot('side');
    if (input.hit('KeyQ') || input.wheel) this.selectSlot(this.active === 'main' ? 'side' : 'main');
    const w = this.weapon;
    const def = w.def;
    this.fireCd -= dt;
    this.swapT = Math.max(0, this.swapT - dt);
    if (this.pumpSoundT > 0) {
      this.pumpSoundT -= dt;
      if (this.pumpSoundT <= 0 && w.id === 'shotgun') g.audio.play('pump', { gain: 0.7 });
    }
    // reload (no firing until the magazine is ready)
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
        const tt = this.reloadT / def.reload;
        const rev = w.id === 'revolver';
        if (this.reloadSounds === 0 && tt > 0.18) { g.audio.play(rev ? 'drumOpen' : 'magOut', { gain: 0.8 }); this.reloadSounds = 1; }
        if (this.reloadSounds === 1 && tt > 0.58) { g.audio.play(rev ? 'shell' : 'magIn', { gain: 0.9 }); this.reloadSounds = 2; }
        if (this.reloadSounds === 2 && tt > 0.82) { g.audio.play(rev ? 'drumClose' : 'bolt', { gain: 0.8 }); this.reloadSounds = 3; }
        if (tt >= 1) {
          const take = Math.min(def.mag - w.mag, w.reserve);
          w.mag += take; w.reserve -= take;
          this.reloading = false;
        }
      }
    }
    // burst rifle: the rest of the burst follows on its own
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        if (w.mag > 0 && !this.reloading && this.alive) {
          this.fire(settings, true);
          this.burstLeft--;
          this.burstT += def.burstGap;
        } else this.burstLeft = 0;
      }
    }
    const trigger = (def.auto ? input.left : input.leftPressed) && !this.climb;
    if (input.leftPressed) this.lastActed = g.time;
    if (!input.left) this.dryClicked = false;
    if (trigger && this.reloading && def.shellReload && w.mag > 0) {
      // fire interrupts a shell-by-shell reload
      this.reloading = false;
      g.vm.stopReload();
    }
    if (trigger && !this.reloading && this.fireCd <= 0 && this.burstLeft === 0 && this.swapT <= 0) {
      if (w.mag <= 0) {
        if (!this.dryClicked) { g.audio.play('dry'); this.dryClicked = true; }
        if (w.reserve > 0) this.startReload();
      } else {
        this.fire(settings);
        if (def.burst) { this.burstLeft = def.burst - 1; this.burstT = def.burstGap; }
      }
    }
    g.vm.update(dt, {
      moving: this.body.grounded ? this.moving : 0,
      aim: this.aiming,
      sprint: (this.sprinting && this.moving > 0.3) || !!this.climb,
      lookDX: this.lookDX || 0,
      lookDY: this.lookDY || 0,
      bob: settings.viewBob,
    });
  }

  startReload() {
    const w = this.weapon;
    if (this.reloading || w.reserve <= 0 || w.mag >= w.def.mag || !this.alive) return;
    this.reloading = true;
    this.burstLeft = 0;
    this.reloadT = 0;
    this.reloadSounds = 0;
    this.game.vm.startReload(w.def.shellReload ? w.def.reload * 1.2 : w.def.reload);
    this.lastActed = this.game.time;
  }

  fire(settings, followUp = false) {
    const g = this.game;
    const w = this.weapon;
    const def = w.def;
    w.mag--;
    // keep the cadence exact (0.09 s SMG, 0.125 s rifle) despite frame steps
    if (!followUp) this.fireCd = Math.max(this.fireCd, -0.02) + def.interval;
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
    const kp = def.kickPitch * (this.aiming ? 0.7 : 1);
    this.pitch += kp * 0.35;
    this.recoilPitch += kp * 0.65;
    this.yaw += (Math.random() - 0.5) * def.kickYaw * 2;
    this.shake = Math.max(this.shake, def.id === 'shotgun' ? 0.6 : def.id === 'revolver' ? 0.4 : 0.15);
    if (def.id === 'shotgun') {
      g.vm.pump();
      this.pumpSoundT = 0.11;
    }
    g.onPlayerShot();
  }

  registerHit(bullet) {
    if (bullet.shotId !== undefined && !this.shotHits.has(bullet.shotId)) {
      this.shotHits.add(bullet.shotId);
      this.stats.hits++;
    }
  }

  // ---------------------------------------------------------------- interaction
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
    // consoles / switches from the mission
    const it = g.mission ? g.mission.nearestInteract(this.body.x, this.body.y, this.body.z, cam.position, _dir) : null;
    if (it) target = { kind: 'interact', it };
    // weapons on the floor override when closer / looked at
    const p = g.items.nearestWeapon(this.body.x, this.body.y, this.body.z, _dir);
    if (p && (!target || (target.kind === 'door' && p.score > 0.5))) target = { kind: 'pickup', pickup: p.pickup };
    this.lookTarget = target;
    if (target && input.hit('KeyF')) {
      this.lastActed = g.time;
      if (target.kind === 'door') {
        const d = target.door;
        if (d.locked) {
          g.audio.play('locked', { gain: 0.7 });
          g.ui.toast(t('prompt.lockedToast'));
          return;
        }
        const wasOpen = d.isOpen;
        d.toggle(this.body.x, this.body.z);
        g.audio.play(wasOpen ? 'doorClose' : 'doorOpen', { gain: 0.8 });
        g.onNoise(d.cx, d.y0 + 1, d.cz, 6);
      } else if (target.kind === 'interact') {
        g.mission.interact(target.it);
      } else {
        this.takeWeapon(target.pickup);
      }
    }
  }

  // Pick up a weapon: same gun = take its ammo, otherwise swap it into its
  // slot and drop what was there (keeping that gun's ammo).
  takeWeapon(p) {
    const g = this.game;
    const def = WEAPONS[p.weapon];
    const slot = def.slot;
    const cur = this.slots[slot];
    if (cur && cur.id === p.weapon) {
      this.absorbAmmo(p, cur, true);
      return;
    }
    g.items.remove(p);
    if (cur) {
      g.items.drop(cur.id, cur.mag, cur.reserve, this.body.x - Math.sin(this.yaw) * 0.6, this.body.y + 0.9, this.body.z - Math.cos(this.yaw) * 0.6, this.yaw + 1.2, true);
    }
    this.slots[slot] = { id: p.weapon, def, mag: p.mag, reserve: p.reserve };
    this.active = slot;
    this.reloading = false;
    this.burstLeft = 0;
    g.vm.setWeapon(p.weapon);
    this.swapT = 0.3;
    this.fireCd = Math.max(this.fireCd, 0.3);
    g.audio.play('pickup', { gain: 0.9 });
    g.ui.toast(t('toast.took', { gun: t('weapon.' + p.weapon) }));
  }

  absorbAmmo(p, w, loud) {
    const g = this.game;
    const room = w.def.reserve - w.reserve;
    if (room <= 0) { if (loud) g.ui.toast(t('toast.ammoFull')); return false; }
    const have = p.mag + p.reserve;
    const take = Math.min(room, have);
    w.reserve += take;
    let left = take;
    const fromRes = Math.min(p.reserve, left); p.reserve -= fromRes; left -= fromRes;
    p.mag -= left;
    if (p.mag + p.reserve <= 0) g.items.remove(p);
    g.audio.play('pickup', { gain: 0.8 });
    g.ui.toast(t('toast.ammo', { n: take, gun: t('weapon.' + w.id) }));
    return true;
  }

  // Walk-over pickups: health kits, ammo boxes, secrets, and ammo from guns
  // of a type you already carry.
  touchItems() {
    const g = this.game;
    for (const p of g.items.touch(this)) {
      if (p.type === 'health') {
        if (this.health >= PLAYER.maxHealth) continue; // not wasted at full health
        this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.healthKit);
        g.items.remove(p);
        g.audio.play('heal', { gain: 0.8 });
        g.ui.toast(t('toast.health'));
        g.ui.healFlash();
      } else if (p.type === 'ammo') {
        let took = false;
        const got = [];
        for (const w of [this.slots.main, this.slots.side]) {
          if (!w) continue;
          const add = Math.min(w.def.reserve - w.reserve, w.def.mag * (w.def.slot === 'main' ? 2 : 2));
          if (add > 0) { w.reserve += add; took = true; got.push(`+${add} ${t('weapon.' + w.id)}`); }
        }
        if (!took) continue;
        g.items.remove(p);
        g.audio.play('pickup', { gain: 0.8 });
        g.ui.toast(got.join('  '));
      } else if (p.type === 'secret') {
        g.items.remove(p);
        g.mission.onSecret(p.index);
      }
    }
    // ammo from dropped guns you already carry
    for (const p of g.items.list) {
      if (p.type !== 'weapon' || !p.rest) continue;
      if (Math.abs(p.y - this.body.y) > 1.3 || Math.hypot(p.x - this.body.x, p.z - this.body.z) > 0.9) continue;
      const w = this.slots[WEAPONS[p.weapon].slot];
      if (w && w.id === p.weapon && w.reserve < w.def.reserve) { this.absorbAmmo(p, w, false); break; }
    }
  }

  // ---------------------------------------------------------------- health
  damage(amount, fromX, fromZ, src = 'enemy') {
    if (!this.alive || amount <= 0) return;
    const g = this.game;
    if (g.godMode) return;
    this.health -= amount;
    this.lastDamage = g.time;
    this.stats.damageTaken += amount;
    this.shake = Math.max(this.shake, Math.min(1, 0.4 + amount / 30));
    const dx = fromX - this.body.x, dz = fromZ - this.body.z;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const deg = (a * 180) / Math.PI;
    const dir = Math.hypot(dx, dz) < 0.2 ? 'AHEAD' : Math.abs(deg) <= 45 ? 'AHEAD' : Math.abs(deg) >= 135 ? 'BEHIND' : deg > 0 ? 'RIGHT' : 'LEFT';
    g.ui.hit(dir, amount);
    g.audio.play('hurt', { gain: 0.7 });
    if (g.mission) g.mission.onPlayerDamaged(amount, src);
    if (this.health <= 0) this.die();
  }

  die() {
    const g = this.game;
    this.health = 0;
    this.alive = false;
    this.deathT = 0;
    this.climb = null;
    this.deathRoll = Math.random() < 0.5 ? -1 : 1;
    this.deathStart = { eye: this.game.camera.position.y - this.body.y, pitch: this.pitch + this.recoilPitch };
    this.reloading = false;
    this.burstLeft = 0;
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
    b.ex = b.ez = 0;
    g.world.moveBody(b, dt, GRAVITY);
    const tt = Math.min(1, this.deathT / 1.1);
    const fall = tt * tt;
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
    const w = this.weapon;
    return {
      x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, yaw: this.yaw, pitch: this.pitch, grounded: b.grounded,
      health: this.health, alive: this.alive, weapon: w.id, mag: w.mag, reserve: w.reserve, active: this.active,
      loadout: this.getLoadout(), climbing: !!this.climb, reloading: this.reloading,
      stats: { ...this.stats },
    };
  }
}
